import type { ApplicationActor, ApplicationState } from "@studio/shared";

export const initialApplicationState: ApplicationState = "PREPARING";

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

const ok: TransitionCheck = { ok: true };
const no = (reason: string): TransitionCheck => ({ ok: false, reason });

// Outcomes of one preparation run. Only the run records them: the browser worker, or the
// system for a portal prepared without a browser and for a run that was abandoned.
const RUN_OUTCOMES: ReadonlySet<ApplicationState> = new Set([
  "NEEDS_INFORMATION",
  "READY_FOR_REVIEW",
  "BLOCKED_BY_PLATFORM",
  "FAILED",
  "EXPIRED",
]);

// Outcomes of one submission run (Milestone 4). The worker records them. The system only marks
// a stalled run SUBMISSION_UNKNOWN, since the click may already have happened.
const SUBMISSION_OUTCOMES: ReadonlySet<ApplicationState> = new Set([
  "SUBMITTED",
  "SUBMISSION_UNKNOWN",
  "NEEDS_INFORMATION",
  "READY_FOR_REVIEW",
  "BLOCKED_BY_PLATFORM",
  "FAILED",
  "EXPIRED",
]);

// While a submission runs, or its result is unknown, nothing else may start: preparing again
// or rejecting could hide an application that was actually sent.
const SUBMISSION_LOCKED: ReadonlySet<ApplicationState> = new Set(["SUBMITTING", "SUBMISSION_UNKNOWN", "SUBMITTED"]);

// States from which the user can say they submitted the application themselves.
const MANUAL_SUBMIT_FROM: ReadonlySet<ApplicationState> = new Set([
  "READY_FOR_REVIEW",
  "APPROVED",
  "NEEDS_INFORMATION",
  "BLOCKED_BY_PLATFORM",
  "FAILED",
  "SUBMISSION_UNKNOWN",
]);

// Spec section 4. The worker never starts, approves or rejects an application, the user never
// records what the browser found, and a submitted application is final.
export function checkTransition(from: ApplicationState, to: ApplicationState, actor: ApplicationActor): TransitionCheck {
  if (from === "SUBMITTED") return no("This application was already submitted.");

  if (from === "SUBMITTING") {
    if (!SUBMISSION_OUTCOMES.has(to)) return no("A submission is running. Wait for its result.");
    if (actor === "WORKER") return ok;
    if (actor === "SYSTEM" && to === "SUBMISSION_UNKNOWN") return ok;
    return no("Only the submission run can record its outcome.");
  }

  if (from === "SUBMISSION_UNKNOWN") {
    if (actor !== "USER") return no("Only you can say whether this application was sent.");
    if (to === "SUBMITTED" || to === "READY_FOR_REVIEW") return ok;
    return no("First say whether this application was sent.");
  }

  if (to === "PREPARING") {
    if (actor !== "USER") return no("Only you can start preparing an application.");
    if (from === "PREPARING") return no("This application is already being prepared.");
    return ok;
  }
  if (to === "USER_REJECTED") {
    if (actor !== "USER") return no("Only you can reject an application.");
    if (from === "PREPARING") return no("Wait for the current preparation to finish.");
    if (from === "USER_REJECTED") return no("This application was already rejected.");
    return ok;
  }
  if (to === "APPROVED") {
    if (actor !== "USER") return no("Only you can approve an application.");
    if (from !== "READY_FOR_REVIEW") return no("Only an application ready for review can be approved.");
    return ok;
  }
  if (to === "SUBMITTING") {
    if (actor !== "WORKER") return no("Only the submission run can start submitting.");
    if (from !== "APPROVED") return no("Only an approved application can be submitted.");
    return ok;
  }
  if (to === "SUBMITTED") {
    if (actor !== "USER") return no("Only a submission run can record a submission.");
    if (!MANUAL_SUBMIT_FROM.has(from)) return no(`An application in ${from} cannot be marked as submitted.`);
    return ok;
  }
  if (from === "APPROVED" && to === "READY_FOR_REVIEW") return ok;
  if (SUBMISSION_LOCKED.has(to)) return no(`${to} can only follow a submission run.`);
  if (RUN_OUTCOMES.has(to) || to === "READY_FOR_REVIEW") {
    if (from !== "PREPARING") return no(`No preparation is running, so ${to} cannot be recorded.`);
    if (actor === "WORKER" || actor === "SYSTEM") return ok;
    return no("Only the preparation run can record its outcome.");
  }
  return no(`Unknown target state ${to}.`);
}
