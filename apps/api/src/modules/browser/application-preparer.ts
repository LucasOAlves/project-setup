import type { SupportedApplicationPortal } from "@studio/shared";
import { detectBlockingPage } from "./blocking-page.js";
import { portalPolicy } from "./browser-guard.js";
import { BrowserRunTimeout, withGuardedPage, type BrowserSessionOptions } from "./browser-session.js";
import { collectPageSignals } from "./page-signals.js";

export type PreparationOutcome = {
  status: "NEEDS_INFORMATION" | "READY_FOR_REVIEW" | "BLOCKED_BY_PLATFORM" | "FAILED";
  reason: string;
  lastError?: string;
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
    try {
      return await withGuardedPage(portalPolicy(target.portal), this.options, async ({ page, blocked }) => {
        const response = await page.goto(target.destinationUrl, { waitUntil: "domcontentloaded" }).catch(() => null);
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
        return { status: "FAILED" as const, reason: "Reading this portal's form is not available yet.", lastError: "FORM_READER_MISSING" };
      });
    } catch (error) {
      if (error instanceof BrowserRunTimeout) return { status: "FAILED", reason: error.message, lastError: "TIMEOUT" };
      throw error;
    }
  }
}
