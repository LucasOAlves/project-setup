// How long the app keeps what it no longer needs (Milestone 6, JOB-031; spec section 6 "Define
// retention limits for screenshots and browser sessions"). Pure: the policy and its cutoffs.
// Browser sessions need no limit: every run uses a throwaway context closed when it ends.

export type RetentionPolicy = {
  // Preview screenshots (the preview keeps its counts).
  screenshotDays: number;
  // A matched recruiter message's text (its class and evidence quote stay).
  messageBodyDays: number;
  // Gmail ids of messages that matched no application, kept only so they are not read again.
  unmatchedMessageDays: number;
  // Notification send records.
  notificationDays: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const UNMATCHED_MESSAGE_DAYS = 60;
const NOTIFICATION_DAYS = 180;

function wholeDays(value: number | undefined, fallback: number, name: string): number {
  const days = value ?? fallback;
  if (!Number.isInteger(days) || days < 1) throw new Error(`${name} must be a whole number of days, at least 1.`);
  return days;
}

export function retentionPolicy(input: { screenshotDays?: number; messageBodyDays?: number; mailLookbackDays?: number }): RetentionPolicy {
  return {
    screenshotDays: wholeDays(input.screenshotDays, 30, "SCREENSHOT_RETENTION_DAYS"),
    messageBodyDays: wholeDays(input.messageBodyDays, 180, "MESSAGE_BODY_RETENTION_DAYS"),
    // Twice the mail search window, so an id is never dropped while a search can still find it.
    unmatchedMessageDays: Math.max(UNMATCHED_MESSAGE_DAYS, 2 * (input.mailLookbackDays ?? 30)),
    notificationDays: NOTIFICATION_DAYS,
  };
}

export function retentionCutoffs(policy: RetentionPolicy, now: Date) {
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
  return {
    screenshotsBefore: before(policy.screenshotDays),
    messageBodiesBefore: before(policy.messageBodyDays),
    unmatchedMessagesBefore: before(policy.unmatchedMessageDays),
    notificationsBefore: before(policy.notificationDays),
  };
}

// A follow-up is keyed by application and stays due while no reply comes, so its record is
// what stops it being sent again.
export const KEPT_NOTIFICATION_KINDS = ["FOLLOW_UP"];

export function isPrunableNotification(kind: string): boolean {
  return !KEPT_NOTIFICATION_KINDS.includes(kind);
}
