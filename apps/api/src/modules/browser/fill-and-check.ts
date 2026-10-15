import type { Page } from "playwright-core";
import type { FieldPlan, FormField, FormSnapshot, SupportedApplicationPortal } from "@studio/shared";
import { detectBlockingPage } from "./blocking-page.js";
import { checkFilledValues } from "./filled-values.js";
import { fillForm, type AttachmentFile } from "./form-filler.js";
import { FormNotFound, readApplicationForm } from "./form-reader.js";
import { collectPageSignals } from "./page-signals.js";

export type OpenFailure = { status: "FAILED" | "BLOCKED_BY_PLATFORM"; reason: string; lastError: string };

// Opens the application page and reads its form, stopping on a login, CAPTCHA or bot check
// (Milestones 3 and 4).
export async function openApplicationForm(
  page: Page,
  portal: SupportedApplicationPortal,
  pageUrl: string,
  blocked: string[],
): Promise<{ fields: FormField[]; form: FormSnapshot } | OpenFailure> {
  const response = await page.goto(pageUrl, { waitUntil: "domcontentloaded" }).catch(() => null);
  if (!response || page.isClosed()) {
    return { status: "FAILED", reason: "The application page could not be opened.", lastError: blocked.at(-1) ?? "NAVIGATION_FAILED" };
  }
  if (response.status() >= 400) {
    return { status: "FAILED", reason: `The portal answered ${response.status()}. The posting may be closed.`, lastError: `HTTP_${response.status()}` };
  }
  const blocking = detectBlockingPage(await collectPageSignals(page));
  if (blocking) return { status: "BLOCKED_BY_PLATFORM", reason: blocking.reason, lastError: blocking.kind };
  let fields: FormField[];
  try {
    fields = await readApplicationForm(page, portal);
  } catch (error) {
    if (error instanceof FormNotFound) {
      // A login or CAPTCHA can appear late, in place of the form.
      const late = detectBlockingPage(await collectPageSignals(page));
      if (late) return { status: "BLOCKED_BY_PLATFORM", reason: late.reason, lastError: late.kind };
      return { status: "FAILED", reason: "No application form was found. The posting may be closed.", lastError: "FORM_NOT_FOUND" };
    }
    throw error;
  }
  return { fields, form: { portal, url: page.url(), title: (await page.title()).slice(0, 300), fields, readAt: new Date().toISOString() } };
}

const MASKED_KINDS = new Set(["TEXT", "EMAIL", "PHONE", "URL", "NUMBER", "DATE", "TEXTAREA", "COMBOBOX"]);

// Fills the form, reads every value back and adjusts the plan to what the page actually kept
// (Milestones 3 and 4). A value the portal did not keep is not claimed: it becomes a question
// again, or is left empty when optional. Preparation and submission runs share it, so a
// submission run computes its payload hash from exactly what preparation would have shown.
export async function fillAndCheck(
  page: Page,
  fields: FormField[],
  plan: FieldPlan[],
  loadFile: (documentId: string) => Promise<AttachmentFile>,
): Promise<{ plan: FieldPlan[]; confirmed: number; unverified: string[] }> {
  const readBack = await fillForm(page, fields, plan, loadFile);
  const check = checkFilledValues(plan, readBack);
  const mismatched = new Map(check.mismatches.map((mismatch) => [mismatch.key, mismatch]));
  const adjusted = plan.map((field) => {
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
  return { plan: adjusted, confirmed: check.confirmed.length, unverified: check.unverified };
}

// Full-page PNG with every typed value masked, or null if it could not be taken.
export async function maskedScreenshot(page: Page, plan: FieldPlan[]): Promise<Buffer | null> {
  const masks = plan
    .filter((field) => field.status === "FILLED" && MASKED_KINDS.has(field.kind))
    .map((field) => page.locator(`[data-jh-key="${field.key}"]`));
  return page.screenshot({ fullPage: true, mask: masks, maskColor: "#3a3a3a", animations: "disabled" }).catch(() => null);
}
