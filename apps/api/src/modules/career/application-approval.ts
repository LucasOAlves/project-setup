import type { ApplicationState } from "@studio/shared";

// Approval validity (Milestone 4, spec A08 and section 4). An approval is bound to one exact
// payload and destination. The same check runs when the worker claims the approval and again
// just before the submit click.

export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export type ApprovalFacts = {
  applicationId: string;
  payloadHash: string;
  destinationUrl: string;
  decidedAt: Date;
  expiresAt: Date;
  invalidatedAt: Date | null;
};

// The application as it is now. payloadHash is what would be sent now: the stored hash when
// approving, the hash recomputed from the filled page right before the click.
export type ApprovalTarget = {
  id: string;
  status: ApplicationState;
  payloadHash: string | null;
  destinationUrl: string;
};

export type ApprovalProblem =
  | "NO_APPROVAL"
  | "WRONG_APPLICATION"
  | "NOT_APPROVED"
  | "INVALIDATED"
  | "EXPIRED"
  | "PAYLOAD_CHANGED"
  | "DESTINATION_CHANGED";

export type ApprovalCheck = { ok: true } | { ok: false; reason: ApprovalProblem };

const APPROVED_STATES: ReadonlySet<ApplicationState> = new Set(["APPROVED", "SUBMITTING"]);

function withoutFragment(url: string): string {
  const index = url.indexOf("#");
  return index < 0 ? url : url.slice(0, index);
}

export function checkApproval(approval: ApprovalFacts | null, target: ApprovalTarget, now: Date): ApprovalCheck {
  if (!approval) return { ok: false, reason: "NO_APPROVAL" };
  if (approval.applicationId !== target.id) return { ok: false, reason: "WRONG_APPLICATION" };
  if (!APPROVED_STATES.has(target.status)) return { ok: false, reason: "NOT_APPROVED" };
  if (approval.invalidatedAt) return { ok: false, reason: "INVALIDATED" };
  if (now.getTime() >= approval.expiresAt.getTime()) return { ok: false, reason: "EXPIRED" };
  if (target.payloadHash !== approval.payloadHash) return { ok: false, reason: "PAYLOAD_CHANGED" };
  if (withoutFragment(target.destinationUrl) !== withoutFragment(approval.destinationUrl)) {
    return { ok: false, reason: "DESTINATION_CHANGED" };
  }
  return { ok: true };
}

export const APPROVAL_PROBLEM_TEXT: Record<ApprovalProblem, string> = {
  NO_APPROVAL: "There is no approval for this application.",
  WRONG_APPLICATION: "The approval belongs to another application.",
  NOT_APPROVED: "The application is not approved.",
  INVALIDATED: "The approval was withdrawn after a change.",
  EXPIRED: "The approval expired after 24 hours.",
  PAYLOAD_CHANGED: "What would be sent differs from what you approved.",
  DESTINATION_CHANGED: "The destination differs from the one you approved.",
};
