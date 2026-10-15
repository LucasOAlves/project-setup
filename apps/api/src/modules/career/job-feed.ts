import type { JobFeedItem, JobFeedQuery } from "@studio/shared";

// Filter and rank the job feed (JOB-008). Pure: the service loads jobs and evaluations, this
// decides what shows and in which order. Ranked by match score, then confidence, then the
// newest posting, so a well-supported score outranks an equal but less certain one, and jobs
// not scored yet come last.
export function buildJobFeed(items: JobFeedItem[], query: JobFeedQuery, now: Date): JobFeedItem[] {
  const needle = query.q.toLowerCase();
  const oldest =
    query.postedWithinDays === undefined ? null : now.getTime() - query.postedWithinDays * 24 * 60 * 60 * 1000;

  return items
    .filter((item) => {
      const eligibility = item.evaluation?.eligibility ?? "NOT_EVALUATED";
      if (!query.eligibility.includes(eligibility)) return false;
      const score = item.evaluation?.score ?? null;
      if (query.minScore > 0 && (score === null || score < query.minScore)) return false;
      if (query.source && item.job.source !== query.source) return false;
      if (needle && !`${item.job.title} ${item.companyName}`.toLowerCase().includes(needle)) return false;
      if (oldest !== null && new Date(item.postedAt).getTime() < oldest) return false;
      return true;
    })
    .sort(
      (a, b) =>
        (b.evaluation?.score ?? -1) - (a.evaluation?.score ?? -1) ||
        (b.evaluation?.confidence ?? -1) - (a.evaluation?.confidence ?? -1) ||
        new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime(),
    );
}
