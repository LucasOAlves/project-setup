/// <reference lib="dom" />
// The callback passed to page.evaluate runs inside the browser page, so it needs DOM types.
import type { Page } from "playwright-core";
import type { FieldPlan, FormField, SupportedApplicationPortal } from "@studio/shared";
import { detectBlockingPage } from "./blocking-page.js";
import { portalPolicy } from "./browser-guard.js";
import { BrowserRunTimeout, withGuardedPage, type BrowserSessionOptions, type GuardedSession, type SubmitRecord } from "./browser-session.js";
import { fillAndCheck, openApplicationForm } from "./fill-and-check.js";
import { applicationPageUrl } from "./form-fields.js";
import type { AttachmentFile } from "./form-filler.js";
import { FORM_ROOTS } from "./form-reader.js";
import { collectPageSignals } from "./page-signals.js";
import { classifySubmission, type SubmitOutcome, type SubmitSignals } from "./submission-outcome.js";

export type SubmissionTarget = {
  portal: SupportedApplicationPortal | null;
  destinationUrl: string;
  planFields: (fields: FormField[]) => Promise<FieldPlan[]>;
  loadFile: (documentId: string) => Promise<AttachmentFile>;
  payloadHash: (plan: FieldPlan[]) => Promise<string>;
  // The last check, with the hash of what was just filled. Anything but ok stops before the click.
  beforeClick: (payloadHash: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  // Records the click time before it happens, so a crash right after still shows a click.
  onClick: () => Promise<void>;
};

// How a submission run ended. Before the click nothing can have been sent, so the run says
// exactly why it stopped. After the click, classifySubmission decides from the signals.
export type SubmissionRun =
  | { clicked: false; status: "READY_FOR_REVIEW" | "NEEDS_INFORMATION" | "BLOCKED_BY_PLATFORM" | "FAILED"; reason: string; lastError: string }
  | ({ clicked: true; submitStatus: number | null } & SubmitOutcome);

const OUTCOME_WAIT_MS = 20_000;
const NO_REQUEST_MS = 5_000;
const SETTLE_MS = 1_500;
const TEXT_LIMIT = 5_000;

async function pageText(page: Page): Promise<string> {
  return page.evaluate((limit) => (document.body?.innerText ?? "").slice(0, limit), TEXT_LIMIT).catch(() => "");
}

async function formState(page: Page, portal: SupportedApplicationPortal) {
  return page
    .evaluate((selector) => {
      const root = document.querySelector(selector);
      const visible = (element: Element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && window.getComputedStyle(element).visibility !== "hidden";
      };
      // A single-page portal keeps the container and swaps its content for a message, so the
      // form counts as shown only while it still has fields to fill.
      const controls = root ? Array.from(root.querySelectorAll("input:not([type=hidden]), select, textarea")).filter(visible) : [];
      if (!root || !visible(root) || controls.length === 0) return { formVisible: false, invalidFields: 0, errorText: "" };
      const invalid = root.querySelectorAll("[aria-invalid='true'], :invalid:not(form):not(fieldset)").length;
      const errors = Array.from(root.querySelectorAll("[role='alert'], .error, .error-message, [class*='error']"))
        .filter(visible)
        .map((element) => (element.textContent ?? "").trim())
        .filter(Boolean)
        .join(" ");
      return { formVisible: true, invalidFields: invalid, errorText: errors.slice(0, 500) };
    }, FORM_ROOTS[portal])
    .catch(() => ({ formVisible: false, invalidFields: 0, errorText: "" }));
}

async function clickSubmit(page: Page, portal: SupportedApplicationPortal): Promise<boolean> {
  const root = page.locator(FORM_ROOTS[portal]).first();
  const candidates = [
    root.locator("button[type=submit], input[type=submit]"),
    root.getByRole("button", { name: /submit/i }),
  ];
  for (const candidate of candidates) {
    if ((await candidate.count()) > 0) {
      await candidate.first().click({ noWaitAfter: true });
      return true;
    }
  }
  return false;
}

// Waits until the submit request has its response (or the time runs out), then lets the page
// settle so a confirmation can render.
async function waitForOutcome(page: Page, session: GuardedSession): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < OUTCOME_WAIT_MS) {
    const record = session.submits[0];
    if (record && record.status !== null) break;
    // No request after a few seconds: the page did not send the form.
    if (!record && Date.now() - started > NO_REQUEST_MS) break;
    await page.waitForTimeout(250);
  }
  await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(SETTLE_MS);
}

// One submission run for one approved application (Milestone 4, spec section 5 steps 13-16):
// open the page again in a fresh guarded browser, fill it again, hash what was filled, check the
// approval once more, then arm the one-shot gate and click submit. Nothing is ever retried.
export class BrowserApplicationSubmitter {
  constructor(private readonly options: BrowserSessionOptions) {}

  async submit(target: SubmissionTarget): Promise<SubmissionRun> {
    if (!target.portal) return { clicked: false, status: "FAILED", reason: "This portal is not supported by the browser worker.", lastError: "UNSUPPORTED_PORTAL" };
    const portal = target.portal;
    const pageUrl = applicationPageUrl(portal, target.destinationUrl);
    if (!pageUrl) return { clicked: false, status: "FAILED", reason: "The job's link is not a posting on the portal.", lastError: "NOT_A_POSTING" };

    let clicked = false;
    let submits: SubmitRecord[] = [];
    const submitStatus = () => submits[0]?.status ?? null;
    let before = { url: "", text: "" };
    try {
      return await withGuardedPage(portalPolicy(portal), { ...this.options, submit: { destinationUrl: target.destinationUrl } }, async (session) => {
        const { page } = session;
        submits = session.submits;
        const opened = await openApplicationForm(page, portal, pageUrl, session.blocked);
        if ("status" in opened) return { clicked: false as const, ...opened };

        const planned = await target.planFields(opened.fields);
        const filled = await fillAndCheck(page, opened.fields, planned, target.loadFile);
        const open = filled.plan.filter((field) => field.status === "NEEDS_INPUT").length;
        if (open > 0) {
          return {
            clicked: false as const,
            status: "NEEDS_INFORMATION" as const,
            reason: `The form changed or did not keep ${open === 1 ? "a value" : `${open} values`} since you approved it. Nothing was sent.`,
            lastError: "PLAN_CHANGED",
          };
        }
        const check = await target.beforeClick(await target.payloadHash(filled.plan));
        if (!check.ok) return { clicked: false as const, status: "READY_FOR_REVIEW" as const, reason: `${check.reason} Nothing was sent.`, lastError: "APPROVAL_CHECK_FAILED" };

        before = { url: page.url(), text: await pageText(page) };
        await target.onClick();
        session.armSubmit();
        clicked = true;
        if (!(await clickSubmit(page, portal))) {
          clicked = false;
          return { clicked: false as const, status: "FAILED" as const, reason: "No submit button was found. Nothing was sent.", lastError: "NO_SUBMIT_BUTTON" };
        }
        await waitForOutcome(page, session);
        const signals: SubmitSignals = {
          submits: session.submits.map((record) => ({ status: record.status })),
          urlBefore: before.url,
          urlAfter: page.isClosed() ? before.url : page.url(),
          textBefore: before.text,
          textAfter: page.isClosed() ? "" : await pageText(page),
          ...(page.isClosed() ? { formVisible: false, invalidFields: 0, errorText: "" } : await formState(page, portal)),
          blocking: page.isClosed() ? null : detectBlockingPage(await collectPageSignals(page).catch(() => ({ title: "", text: "", hasVisiblePasswordField: false, visibleFrameHosts: [] }))),
          runError: null,
        };
        return { clicked: true as const, submitStatus: submitStatus(), ...classifySubmission(signals) };
      });
    } catch (error) {
      const kind = error instanceof BrowserRunTimeout ? "TIMEOUT" : "CRASH";
      if (!clicked) {
        return {
          clicked: false,
          status: "FAILED",
          reason: error instanceof BrowserRunTimeout ? error.message : "The browser run hit an unexpected error before submitting. Nothing was sent.",
          lastError: kind,
        };
      }
      // After the click, an error leaves the result unknown.
      return {
        clicked: true,
        submitStatus: submitStatus(),
        ...classifySubmission({
          submits: submits.map((record) => ({ status: record.status })),
          urlBefore: before.url,
          urlAfter: before.url,
          textBefore: before.text,
          textAfter: "",
          formVisible: false,
          invalidFields: 0,
          errorText: "",
          blocking: null,
          runError: kind,
        }),
      };
    }
  }
}
