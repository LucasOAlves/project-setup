import type { FormSnapshot, SupportedApplicationPortal } from "@studio/shared";
import { detectBlockingPage } from "./blocking-page.js";
import { portalPolicy } from "./browser-guard.js";
import { BrowserRunTimeout, withGuardedPage, type BrowserSessionOptions } from "./browser-session.js";
import { applicationPageUrl } from "./form-fields.js";
import { FormNotFound, readApplicationForm } from "./form-reader.js";
import { collectPageSignals } from "./page-signals.js";

export type PreparationOutcome = {
  status: "NEEDS_INFORMATION" | "READY_FOR_REVIEW" | "BLOCKED_BY_PLATFORM" | "FAILED";
  reason: string;
  lastError?: string;
  form?: FormSnapshot;
};

export type PreparationTarget = { portal: SupportedApplicationPortal | null; destinationUrl: string };

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
        return {
          status: "NEEDS_INFORMATION" as const,
          reason: `Read ${fields.length} fields. Filling them is not available yet.`,
          form,
        };
      });
    } catch (error) {
      if (error instanceof BrowserRunTimeout) return { status: "FAILED", reason: error.message, lastError: "TIMEOUT" };
      throw error;
    }
  }
}
