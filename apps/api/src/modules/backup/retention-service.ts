import { expireOldScreenshots } from "../browser/application-prep-processor.js";
import type { Env } from "../../env.js";
import { MAIL_LOOKBACK_DAYS } from "../email/recruiter-mail-service.js";
import { KEPT_NOTIFICATION_KINDS, retentionCutoffs, retentionPolicy, type RetentionPolicy } from "./retention-policy.js";

// The main worker's daily retention job (Milestone 6, ticket 4). Each step is counted, and the
// result is what the audit history and the Operations step show.

export function retentionPolicyFromEnv(env: Pick<Env, "SCREENSHOT_RETENTION_DAYS" | "MESSAGE_BODY_RETENTION_DAYS">): RetentionPolicy {
  return retentionPolicy({ screenshotDays: env.SCREENSHOT_RETENTION_DAYS, messageBodyDays: env.MESSAGE_BODY_RETENTION_DAYS, mailLookbackDays: MAIL_LOOKBACK_DAYS });
}

export type RetentionDeps = {
  screenshots: Parameters<typeof expireOldScreenshots>[0];
  deleteFile: (key: string) => Promise<void>;
  messages: { clearBodiesBefore(cutoff: Date): Promise<number>; deleteUnmatchedBefore(cutoff: Date): Promise<number> };
  notifications: { pruneBefore(cutoff: Date, keptKinds: string[]): Promise<number> };
};

export type RetentionResult = { screenshots: number; messageBodies: number; unmatchedMessages: number; notifications: number };

export async function applyRetention(deps: RetentionDeps, policy: RetentionPolicy, now = new Date()): Promise<RetentionResult> {
  const cutoffs = retentionCutoffs(policy, now);
  return {
    screenshots: await expireOldScreenshots(deps.screenshots, deps.deleteFile, cutoffs.screenshotsBefore),
    messageBodies: await deps.messages.clearBodiesBefore(cutoffs.messageBodiesBefore),
    unmatchedMessages: await deps.messages.deleteUnmatchedBefore(cutoffs.unmatchedMessagesBefore),
    notifications: await deps.notifications.pruneBefore(cutoffs.notificationsBefore, KEPT_NOTIFICATION_KINDS),
  };
}
