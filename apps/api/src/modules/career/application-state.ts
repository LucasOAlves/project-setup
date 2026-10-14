import type { ApplicationActor, ApplicationState } from "@studio/shared";

export const initialApplicationState: ApplicationState = "PREPARING";

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

// Outcomes of one preparation run. Only the run records them: the browser worker, or the
// system for a portal prepared without a browser and for a run that was abandoned.
const RUN_OUTCOMES: ReadonlySet<ApplicationState> = new Set([
  "NEEDS_INFORMATION",
  "READY_FOR_REVIEW",
  "BLOCKED_BY_PLATFORM",
  "FAILED",
]);

// Spec section 4. The worker never starts or rejects an application, and the user never
// records what the browser found.
export function checkTransition(from: ApplicationState, to: ApplicationState, actor: ApplicationActor): TransitionCheck {
  if (to === "PREPARING") {
    if (actor !== "USER") return { ok: false, reason: "Only you can start preparing an application." };
    if (from === "PREPARING") return { ok: false, reason: "This application is already being prepared." };
    return { ok: true };
  }
  if (to === "USER_REJECTED") {
    if (actor !== "USER") return { ok: false, reason: "Only you can reject an application." };
    if (from === "PREPARING") return { ok: false, reason: "Wait for the current preparation to finish." };
    if (from === "USER_REJECTED") return { ok: false, reason: "This application was already rejected." };
    return { ok: true };
  }
  if (RUN_OUTCOMES.has(to)) {
    if (from !== "PREPARING") return { ok: false, reason: `No preparation is running, so ${to} cannot be recorded.` };
    if (actor === "WORKER" || actor === "SYSTEM") return { ok: true };
    return { ok: false, reason: "Only the preparation run can record its outcome." };
  }
  return { ok: false, reason: `Unknown target state ${to}.` };
}
