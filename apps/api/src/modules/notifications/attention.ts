// The count on the Applications step (Milestone 5, ticket 6): what waits on the user. The same
// events Telegram announces, counted while they are still open.
const NEEDS_YOU = new Set(["READY_FOR_REVIEW", "NEEDS_INFORMATION", "SUBMISSION_UNKNOWN", "BLOCKED_BY_PLATFORM"]);

export type Attention = { applications: number; suggestions: number; followUps: number; total: number };

export function attentionCount(input: {
  inboxStatuses: string[];
  sent: Array<{ messages: Array<{ suggestedStatus: string; decision: string }>; followUp: { due: boolean } }>;
}): Attention {
  const applications = input.inboxStatuses.filter((status) => NEEDS_YOU.has(status)).length;
  const suggestions = input.sent.reduce((sum, item) => sum + item.messages.filter((message) => message.suggestedStatus && !message.decision).length, 0);
  const followUps = input.sent.filter((item) => item.followUp.due).length;
  return { applications, suggestions, followUps, total: applications + suggestions + followUps };
}
