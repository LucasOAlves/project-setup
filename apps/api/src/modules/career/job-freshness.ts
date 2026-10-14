import { detectBoardReference, type JobFreshnessSignal } from "@studio/shared";

// Freshness and trust signals for a tracked job (Milestone 1.5), from the guide's advice:
// apply to recent postings, treat a role that has sat open for months as a likely ghost job,
// prefer postings with a published salary and the company's own careers page. Pure and
// read-time only: nothing is stored, so the signals follow the clock and any later update.
const DAY_MS = 24 * 60 * 60 * 1000;
export const STALE_AFTER_DAYS = 30;
export const LIKELY_GHOST_AFTER_DAYS = 60;

export type FreshnessInput = {
  url: string;
  sourcePostedAt: Date | null;
  salaryMin: number | null;
  salaryMax: number | null;
};

export function jobFreshnessSignals(job: FreshnessInput, now: Date): JobFreshnessSignal[] {
  const signals: JobFreshnessSignal[] = [];
  if (!job.sourcePostedAt) {
    signals.push("NO_POSTED_DATE");
  } else {
    const ageDays = (now.getTime() - job.sourcePostedAt.getTime()) / DAY_MS;
    if (ageDays >= LIKELY_GHOST_AFTER_DAYS) signals.push("LIKELY_GHOST");
    else if (ageDays >= STALE_AFTER_DAYS) signals.push("STALE");
  }
  if ((job.salaryMin ?? 0) > 0 || (job.salaryMax ?? 0) > 0) signals.push("SALARY_PUBLISHED");
  if (job.url && detectBoardReference(job.url)) signals.push("COMPANY_SITE");
  return signals;
}
