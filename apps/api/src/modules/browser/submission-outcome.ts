import type { BlockingPage } from "./blocking-page.js";

// What happened after the submit click (Milestone 4, spec A09 and acceptance criterion 9).
// Pure: the submission run collects the signals. A click alone proves nothing, so SUBMITTED
// needs a submit request that got a successful response AND a confirmation that appeared after
// the click. When no submit request left the browser, nothing was sent, which is certain.
// Everything in between is SUBMISSION_UNKNOWN, which only the user resolves.

export type SubmitSignals = {
  // Submit requests the guard let through (at most one), with the status of the response;
  // null when none arrived.
  submits: Array<{ status: number | null }>;
  urlBefore: string;
  urlAfter: string;
  // Visible page text right before the click and after it settled, truncated by the caller.
  textBefore: string;
  textAfter: string;
  // The application form is still shown.
  formVisible: boolean;
  // Fields the page marks invalid, and the text of its error messages.
  invalidFields: number;
  errorText: string;
  blocking: BlockingPage | null;
  // The run stopped after the click without settling.
  runError: "TIMEOUT" | "CRASH" | null;
};

export type SubmitOutcome = {
  status: "SUBMITTED" | "SUBMISSION_UNKNOWN" | "NEEDS_INFORMATION" | "BLOCKED_BY_PLATFORM" | "FAILED" | "READY_FOR_REVIEW";
  reason: string;
  // What the decision rests on, for the execution record. Never page content beyond a phrase.
  evidence: string;
  confirmationReference?: string;
};

const CONFIRMATION =
  /(thank(s| you)(,? [^.!\n]{0,40})? for (applying|your application|your interest|submitting)|application (has been |was |is )?(successfully )?(submitted|received|sent)|we('ve| have) received your application|successfully (submitted|applied))/gi;
const REFERENCE = /\b(?:application|reference|confirmation)\s*(?:id|number|no\.?|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,40})\b/i;
const QUOTE_LIMIT = 160;

function quote(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > QUOTE_LIMIT ? `${flat.slice(0, QUOTE_LIMIT)}…` : flat;
}

function count(pattern: RegExp, text: string): number {
  return text.match(pattern)?.length ?? 0;
}

function path(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname + parsed.pathname;
  } catch {
    return url;
  }
}

export function classifySubmission(signals: SubmitSignals): SubmitOutcome {
  const errors = signals.errorText ? ` The page says: "${quote(signals.errorText)}"` : "";

  if (signals.submits.length === 0) {
    if (signals.blocking) {
      return { status: "BLOCKED_BY_PLATFORM", reason: `${signals.blocking.reason} Nothing was sent.`, evidence: `no submit request; ${signals.blocking.kind}` };
    }
    if (signals.invalidFields > 0 || signals.errorText) {
      return {
        status: "NEEDS_INFORMATION",
        reason: `The portal did not accept the form before sending it, so nothing was sent.${errors}`,
        evidence: `no submit request; ${signals.invalidFields} invalid fields`,
      };
    }
    return {
      status: "READY_FOR_REVIEW",
      reason: "Nothing was sent: the submit button did not send the form. Review it and approve again.",
      evidence: "no submit request left the browser",
    };
  }

  const status = signals.submits[0]!.status;
  if (signals.runError) {
    return {
      status: "SUBMISSION_UNKNOWN",
      reason: "The run stopped right after sending. Check the portal or your email before doing anything else.",
      evidence: `submit sent; run ${signals.runError.toLowerCase()}; status ${status ?? "none"}`,
    };
  }
  if (status === null || status >= 500) {
    return {
      status: "SUBMISSION_UNKNOWN",
      reason: `The portal ${status === null ? "never answered" : `answered ${status}`} after the application was sent. Check the portal or your email before doing anything else.`,
      evidence: `submit sent; status ${status ?? "none"}`,
    };
  }
  if (status >= 400) {
    if (signals.blocking) {
      return { status: "BLOCKED_BY_PLATFORM", reason: `${signals.blocking.reason} The portal refused the submission.`, evidence: `submit refused ${status}; ${signals.blocking.kind}` };
    }
    if (signals.invalidFields > 0 || signals.errorText) {
      return { status: "NEEDS_INFORMATION", reason: `The portal refused the form (HTTP ${status}).${errors}`, evidence: `submit refused ${status}` };
    }
    return { status: "FAILED", reason: `The portal refused the submission (HTTP ${status}). Nothing was accepted.`, evidence: `submit refused ${status}` };
  }

  const newConfirmation = count(CONFIRMATION, signals.textAfter) > count(CONFIRMATION, signals.textBefore);
  const pageMoved = path(signals.urlAfter) !== path(signals.urlBefore);
  if (newConfirmation && (!signals.formVisible || pageMoved)) {
    const phrase = signals.textAfter.match(new RegExp(CONFIRMATION.source, "i"))?.[0] ?? "";
    const reference = signals.textAfter.match(REFERENCE)?.[1];
    return {
      status: "SUBMITTED",
      reason: `The portal confirmed it: "${quote(phrase)}".`,
      evidence: `submit ${status}; confirmation on ${path(signals.urlAfter)}`,
      ...(reference ? { confirmationReference: reference } : {}),
    };
  }
  return {
    status: "SUBMISSION_UNKNOWN",
    reason: `The application was sent (HTTP ${status}) but the portal showed no clear confirmation.${errors} Check the portal or your email before doing anything else.`,
    evidence: `submit ${status}; no new confirmation; form ${signals.formVisible ? "still shown" : "gone"}`,
  };
}
