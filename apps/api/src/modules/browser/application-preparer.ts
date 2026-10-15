import type { FieldPlan, FormField, FormSnapshot, SupportedApplicationPortal } from "@studio/shared";
import { portalPolicy } from "./browser-guard.js";
import { BrowserRunTimeout, withGuardedPage, type BrowserSessionOptions } from "./browser-session.js";
import { applicationPageUrl } from "./form-fields.js";
import { fillAndCheck, maskedScreenshot, openApplicationForm } from "./fill-and-check.js";
import type { AttachmentFile } from "./form-filler.js";

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
        const opened = await openApplicationForm(page, portal, pageUrl, blocked);
        if ("status" in opened) return opened;
        const { fields, form } = opened;
        if (!target.planFields) {
          return { status: "NEEDS_INFORMATION" as const, reason: `Read ${fields.length} fields.`, form };
        }
        let plan = await target.planFields(fields);
        let preview: PreparationPreview | undefined;
        if (target.loadFile) {
          const filled = await fillAndCheck(page, fields, plan, target.loadFile);
          plan = filled.plan;
          preview = {
            screenshot: await maskedScreenshot(page, plan),
            pageUrl: page.url(),
            confirmed: filled.confirmed,
            unverified: filled.unverified,
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
