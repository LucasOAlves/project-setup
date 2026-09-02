import {
  JOB_SOURCES,
  JOB_STATUSES,
  type CareerAnalytics,
  type JobPublic,
  type JobSource,
  type JobStatus,
  type RecruiterPublic,
} from "@studio/shared";

const INTERVIEW_OR_LATER: JobStatus[] = [
  "INTERVIEW",
  "TECHNICAL_INTERVIEW",
  "FINAL_INTERVIEW",
  "OFFER",
];

export function computeCareerAnalytics(input: {
  jobs: JobPublic[];
  recruiters: RecruiterPublic[];
  statusEventsByJobId: Map<string, Set<JobStatus>>;
  gapsByJobId: Map<string, string[]>;
}): CareerAnalytics {
  const { jobs, recruiters, statusEventsByJobId, gapsByJobId } = input;

  const jobsByStatus = Object.fromEntries(
    JOB_STATUSES.map((status) => [status, 0]),
  ) as Record<JobStatus, number>;
  for (const job of jobs) {
    jobsByStatus[job.status] += 1;
  }

  const jobsBySource = Object.fromEntries(
    JOB_SOURCES.map((source) => [source, 0]),
  ) as Record<JobSource, number>;
  for (const job of jobs) {
    jobsBySource[job.source] += 1;
  }

  const applications = jobs.filter((job) => job.appliedAt !== null).length;

  // A job that ever reached interview stage counts, even if it's since moved to REJECTED —
  // Job.status alone can't answer this; the status-event history can.
  const interviewsReached = jobs.filter((job) => {
    const events = statusEventsByJobId.get(job.id) ?? new Set<JobStatus>();
    return INTERVIEW_OR_LATER.some((status) => events.has(status));
  }).length;

  const offers = jobs.filter((job) =>
    (statusEventsByJobId.get(job.id) ?? new Set<JobStatus>()).has("OFFER"),
  ).length;

  const applicationToInterviewRate =
    applications > 0 ? Math.round((100 * interviewsReached) / applications) : null;

  // Rejections as a share of jobs actually applied to — a SAVED job that was never applied to
  // was never "rejected," so it shouldn't count against this rate.
  const rejectedApplications = jobs.filter(
    (job) => job.status === "REJECTED" && job.appliedAt !== null,
  ).length;
  const rejectionRate = applications > 0 ? Math.round((100 * rejectedApplications) / applications) : null;

  const scoredJobs = jobs.filter((job): job is JobPublic & { fitScore: number } => job.fitScore !== null);
  const averageFitScore =
    scoredJobs.length > 0
      ? Math.round(scoredJobs.reduce((sum, job) => sum + job.fitScore, 0) / scoredJobs.length)
      : null;

  const companiesTargeted = new Set(jobs.map((job) => job.companyId)).size;
  const recruitersConnected = recruiters.filter(
    (recruiter) => recruiter.connectionStatus === "CONNECTED",
  ).length;

  const topTechnologies = tally(jobs.flatMap((job) => job.technologies)).map(([technology, count]) => ({
    technology,
    count,
  }));
  const topGaps = tally([...gapsByJobId.values()].flat()).map(([skill, count]) => ({ skill, count }));

  return {
    totalJobs: jobs.length,
    jobsByStatus,
    applications,
    interviewsReached,
    offers,
    applicationToInterviewRate,
    rejectionRate,
    averageFitScore,
    companiesTargeted,
    recruiterContacts: recruiters.length,
    recruitersConnected,
    topTechnologies,
    topGaps,
    jobsBySource,
  };
}

function tally(values: string[]): Array<[string, number]> {
  const counts = new Map<string, { display: string; count: number }>();
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key) continue;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { display: value, count: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((entry) => [entry.display, entry.count]);
}
