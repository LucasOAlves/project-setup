// What the app tells the user on Telegram (Milestone 5, ticket 6; spec JOB-025). Pure
// formatters. A message carries job titles, companies, scores and links only: never a
// recruiter's message text, contact details or anything typed into an application.

export type JobRef = { title: string; company: string };

const MAX_DIGEST_JOBS = 10;

function job(ref: JobRef): string {
  return ref.company ? `${ref.title} at ${ref.company}` : ref.title;
}

function withLink(text: string, appUrl: string): string {
  return appUrl ? `${text}\n${appUrl}` : text;
}

// The application changes worth hearing about: it waits on your review, or a submission ended.
export function applicationChangeText(change: { from: string; to: string }, ref: JobRef, appUrl: string): string | null {
  const name = job(ref);
  if (change.to === "READY_FOR_REVIEW") return withLink(`Ready for your review: ${name}. Check the form and approve it, or decide not to apply.`, appUrl);
  if (change.to === "SUBMITTED" && change.from === "SUBMITTING") return withLink(`Application sent: ${name}.`, appUrl);
  if (change.to === "SUBMISSION_UNKNOWN") return withLink(`Submission result unknown: ${name}. Check the portal or your email, then tell the app what happened.`, appUrl);
  if (change.from === "SUBMITTING") return withLink(`Application not sent: ${name}. Open the app to see why.`, appUrl);
  return null;
}

const MESSAGE_KINDS: Record<string, string> = {
  INTERVIEW_REQUEST: "Interview request",
  ASSESSMENT: "Assessment",
  OFFER: "Offer",
};

export function recruiterMessageText(classification: string, ref: JobRef, appUrl: string): string | null {
  const kind = MESSAGE_KINDS[classification];
  if (!kind) return null;
  return withLink(`${kind} about ${job(ref)}. Read it in the app and accept or dismiss the suggested status.`, appUrl);
}

export function followUpText(ref: JobRef, waitingDays: number, appUrl: string): string {
  return withLink(`No reply from ${ref.company || ref.title} for ${waitingDays} days (${ref.title}). Consider following up.`, appUrl);
}

export function digestText(jobs: Array<JobRef & { score: number; url: string }>, minScore: number): string | null {
  if (jobs.length === 0) return null;
  const sorted = [...jobs].sort((a, b) => b.score - a.score);
  const shown = sorted.slice(0, MAX_DIGEST_JOBS);
  const lines = shown.map((item) => `${item.score} ${job(item)}${item.url ? `\n${item.url}` : ""}`);
  const more = sorted.length > shown.length ? [`and ${sorted.length - shown.length} more in the app.`] : [];
  const heading = `${jobs.length === 1 ? "1 new job" : `${jobs.length} new jobs`} scored ${minScore} or more:`;
  return [heading, ...lines, ...more].join("\n");
}

export function budgetText(state: "WARNING" | "REACHED", spentUsd: number, budgetUsd: number): string {
  const spent = `$${spentUsd.toFixed(2)} of $${budgetUsd.toFixed(2)}`;
  return state === "REACHED"
    ? `AI budget reached: ${spent} this month. Explanations, cover letters and message classification are paused until next month.`
    : `AI budget at 80%: ${spent} this month.`;
}
