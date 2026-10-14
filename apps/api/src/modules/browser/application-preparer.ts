import type { FieldPlan, FormField, FormSnapshot, SupportedApplicationPortal } from "@studio/shared";
import { detectBlockingPage } from "./blocking-page.js";
import { portalPolicy } from "./browser-guard.js";
import { BrowserRunTimeout, withGuardedPage, type BrowserSessionOptions } from "./browser-session.js";
import { applicationPageUrl } from "./form-fields.js";
import { FormNotFound, readApplicationForm } from "./form-reader.js";
import { checkFilledValues } from "./filled-values.js";
import { fillForm, type AttachmentFile } from "./form-filler.js";
import { collectPageSignals } from "./page-signals.js";

export type PreparationOutcome = {
  status: "NEEDS_INFORMATION" | "READY_FOR_REVIEW" | "BLOCKED_BY_PLATFORM" | "FAILED";
  reason: string;
  lastError?: string;
  form?: FormSnapshot;
  plan?: FieldPlan[];
  preview?: PreparationPreview;
};

export type PreparationPreview = {
  // Full-page PNG with every typed value masked, or null if it could not be taken.
  screenshot: Buffer | null;
  pageUrl: string;
  confirmed: number;
  unverified: string[];
  blockedRequests: number;
};

export type PreparationTarget = {
  portal: SupportedApplicationPortal | null;
  destinationUrl: string;
  // Decides each field's value from the user's stated data (application-field-mapper.ts).
  planFields?: (fields: FormField[]) => Promise<FieldPlan[]>;
  // Reads a document's PDF to attach. Without it, nothing is filled.
  loadFile?: (documentId: string) => Promise<AttachmentFile>;
};

const MASKED_KINDS = new Set(["TEXT", "EMAIL", "PHONE", "URL", "NUMBER", "DATE", "TEXTAREA", "COMBOBOX"]);

// One browser run for one application (Milestone 3): open the portal inside the guard, stop on
// a login or CAPTCHA, then read and fill the form. It never submits.
export class BrowserApplicationPreparer {
  constructor(private readonly options: BrowserSessionOptions) {}

  async prepare(target: PreparationTarget): Promise<PreparationOutcome> {
    if (!target.portal) {
      return { status: "FAILED", reason: "This portal is not supported by the browser worker.", lastError: "UNSUPPORTED_PORTAL" };
    }
    const portal = target.portal;
    const pageUrl = applicationPageUrl(portal, target.destinationUrl);
    if (!pageUrl) {
      return { status: "FAILED", reason: "The job's link is not a posting on the portal.", lastError: "NOT_A_POSTING" };
    }
    try {
      return await withGuardedPage(portalPolicy(portal), this.options, async ({ page, blocked }) => {
        const response = await page.goto(pageUrl, { waitUntil: "domcontentloaded" }).catch(() => null);
        if (!response || page.isClosed()) {
          return {
            status: "FAILED" as const,
            reason: "The application page could not be opened.",
            lastError: blocked.at(-1) ?? "NAVIGATION_FAILED",
          };
        }
        if (response.status() >= 400) {
          return {
            status: "FAILED" as const,
            reason: `The portal answered ${response.status()}. The posting may be closed.`,
            lastError: `HTTP_${response.status()}`,
          };
        }
        const blocking = detectBlockingPage(await collectPageSignals(page));
        if (blocking) return { status: "BLOCKED_BY_PLATFORM" as const, reason: blocking.reason, lastError: blocking.kind };
        let fields;
        try {
          fields = await readApplicationForm(page, portal);
        } catch (error) {
          if (error instanceof FormNotFound) {
            // A login or CAPTCHA can appear late, in place of the form.
            const late = detectBlockingPage(await collectPageSignals(page));
            if (late) return { status: "BLOCKED_BY_PLATFORM" as const, reason: late.reason, lastError: late.kind };
            return { status: "FAILED" as const, reason: "No application form was found. The posting may be closed.", lastError: "FORM_NOT_FOUND" };
          }
          throw error;
        }
        const form: FormSnapshot = { portal, url: page.url(), title: (await page.title()).slice(0, 300), fields, readAt: new Date().toISOString() };
        if (!target.planFields) {
          return { status: "NEEDS_INFORMATION" as const, reason: `Read ${fields.length} fields.`, form };
        }
        let plan = await target.planFields(fields);
        let preview: PreparationPreview | undefined;
        if (target.loadFile) {
          const readBack = await fillForm(page, fields, plan, target.loadFile);
          const check = checkFilledValues(plan, readBack);
          const mismatched = new Map(check.mismatches.map((mismatch) => [mismatch.key, mismatch]));
          // A value the portal did not keep is not claimed: it becomes a question again.
          plan = plan.map((field) => {
            const mismatch = mismatched.get(field.key);
            if (!mismatch) return field;
            return {
              ...field,
              status: field.required ? ("NEEDS_INPUT" as const) : ("LEFT_EMPTY" as const),
              value: null,
              source: null,
              note: mismatch.actual
                ? `The portal did not keep "${mismatch.expected}"; it shows "${mismatch.actual}".`
                : `The portal did not keep "${mismatch.expected}".`,
            };
          });
          const masks = plan
            .filter((field) => field.status === "FILLED" && MASKED_KINDS.has(field.kind))
            .map((field) => page.locator(`[data-jh-key="${field.key}"]`));
          const screenshot = await page
            .screenshot({ fullPage: true, mask: masks, maskColor: "#3a3a3a", animations: "disabled" })
            .catch(() => null);
          preview = {
            screenshot,
            pageUrl: page.url(),
            confirmed: check.confirmed.length,
            unverified: check.unverified,
            blockedRequests: blocked.length,
          };
        }
        const questions = plan.filter((field) => field.status === "NEEDS_INPUT").length;
        if (questions > 0) {
          return {
            status: "NEEDS_INFORMATION" as const,
            reason: `${questions} required ${questions === 1 ? "question needs" : "questions need"} your answer.`,
            form,
            plan,
            ...(preview ? { preview } : {}),
          };
        }
        return {
          status: "READY_FOR_REVIEW" as const,
          reason: preview
            ? "The form is filled with your details and waits for your review. Nothing was submitted."
            : "Every required field has an answer from your details.",
          form,
          plan,
          ...(preview ? { preview } : {}),
        };
      });
    } catch (error) {
      if (error instanceof BrowserRunTimeout) return { status: "FAILED", reason: error.message, lastError: "TIMEOUT" };
      throw error;
    }
  }
}
