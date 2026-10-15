import { JOB_STATUSES } from "@studio/shared";

// Response tracking (Milestone 5, ticket 5; spec A10). Pure rules: which pursuit status a
// classified message suggests, and when an application has waited long enough to consider
// following up. A suggestion is only that: the user accepts or dismisses it, and the app never
// writes to anyone.

const SUGGESTED: Record<string, string> = {
  APPLICATION_RECEIVED: "APPLIED",
  REJECTION: "REJECTED",
  ASSESSMENT: "SCREENING",
  INTERVIEW_REQUEST: "INTERVIEW",
  OFFER: "OFFER",
};

const CLOSED = new Set(["REJECTED", "WITHDRAWN"]);
// Statuses at which the user is still waiting to hear back.
const WAITING = new Set(["SAVED", "SHORTLISTED", "PREPARING", "APPLIED"]);
const rank = (status: string) => (JOB_STATUSES as readonly string[]).indexOf(status);

export function suggestedStatusFor(classification: string): string {
  return SUGGESTED[classification] ?? "";
}

// The suggestion for a job at `jobStatus`, or "" when it would not move the job forward. A
// rejection can come at any open stage; a closed job gets none.
export function suggestionFor(classification: string, jobStatus: string): string {
  const suggested = suggestedStatusFor(classification);
  if (!suggested || CLOSED.has(jobStatus) || suggested === jobStatus) return "";
  if (suggested === "REJECTED") return suggested;
  return rank(suggested) > rank(jobStatus) ? suggested : "";
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Due when the application has waited `afterDays` with no reply (an automatic confirmation is
// not one) and the job is still at APPLIED or before.
export function followUpState(input: {
  submittedAt: Date;
  jobStatus: string;
  messages: Array<{ classification: string }>;
  now: Date;
  afterDays: number;
}): { due: boolean; waitingDays: number } {
  const waitingDays = Math.max(0, Math.floor((input.now.getTime() - input.submittedAt.getTime()) / DAY_MS));
  const replied = input.messages.some((message) => message.classification !== "APPLICATION_RECEIVED");
  const due = WAITING.has(input.jobStatus) && !replied && waitingDays >= input.afterDays;
  return { due, waitingDays };
}
