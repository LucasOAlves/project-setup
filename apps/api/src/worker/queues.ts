import { Queue, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import { applicationPrepJobId, applicationSubmitJobId, discoveryJobId, emailCheckJobId, evaluationJobId, watchJobId } from "./job-ids.js";

// Queue names are the contract between whoever enqueues (API routes, schedulers) and the
// worker process that consumes them — see ADR-015. New pipelines add their queue here
// rather than spelling the name at each call site.
export const QUEUE_NAMES = {
  system: "system",
  discovery: "discovery",
  evaluation: "evaluation",
  // Consumed only by the browser worker process (browser-worker.ts), never by worker.ts.
  applicationPrep: "application-prep",
  // Approved submissions (Milestone 4), also consumed only by the browser worker.
  applicationSubmit: "application-submit",
  // Milestone 5: reading recruiter replies (and, later, notifications), consumed by worker.ts.
  monitoring: "monitoring",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const SYSTEM_JOBS = {
  heartbeat: "heartbeat",
} as const;

export const MONITORING_JOBS = {
  emailCheck: "email-check",
  dailyNotifications: "daily-notifications",
  // Milestone 6: the encrypted daily backup.
  backup: "backup",
  // Milestone 6: screenshots, message text, unmatched Gmail ids and notification records.
  retention: "retention",
} as const;

export type DiscoveryJobData = { sourceId: string; correlationId: string };
// Watchlist jobs share the discovery queue: "watchlist" fans out one "watch-company" per company.
export type WatchCompanyJobData = { companyId: string; correlationId: string };
export const WATCH_JOBS = { run: "watchlist", company: "watch-company" } as const;
export type EvaluationJobData = { jobId: string; profileVersion: number; correlationId: string };
// runId is the time the run started, so each "prepare" is its own job and a duplicate add is not.
export type ApplicationPrepJobData = { applicationId: string; runId: string; correlationId: string };
export type ApplicationSubmitJobData = { applicationId: string; approvalId: string; correlationId: string };

// Retries for transient failures (a source API timing out, a model rate limit): 3 attempts,
// 30s then 60s apart. A processor that knows a failure is permanent throws BullMQ's
// UnrecoverableError so it is not retried. History is capped so Redis does not grow forever.
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 1000 },
};

// BullMQ requires maxRetriesPerRequest: null on connections used by a Worker, so blocking
// commands wait for Redis to come back instead of failing the job mid-flight.
export function createRedisConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

export function createQueue(name: QueueName, connection: Redis): Queue {
  return new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
}

// Enqueue helpers use the deterministic ids from job-ids.ts, so calling them twice for the
// same source/day or job/profile-version adds nothing.
export async function enqueueDiscovery(queue: Queue, data: DiscoveryJobData, at = new Date()) {
  return queue.add("discover", data, { jobId: discoveryJobId(data.sourceId, at) });
}

export async function enqueueEvaluation(queue: Queue, data: EvaluationJobData) {
  return queue.add("evaluate", data, { jobId: evaluationJobId(data.jobId, data.profileVersion) });
}

// Spaced a few seconds apart so a long watchlist never bursts the boards' hosts.
export async function enqueueWatchCompany(queue: Queue, data: WatchCompanyJobData, at = new Date(), delayMs = 0) {
  return queue.add(WATCH_JOBS.company, data, { jobId: watchJobId(data.companyId, at), delay: delayMs });
}

// A browser run is not retried: re-opening the portal is the user's call, through "prepare" again.
export async function enqueueApplicationPrep(queue: Queue, data: ApplicationPrepJobData) {
  return queue.add("prepare", data, { jobId: applicationPrepJobId(data.applicationId, data.runId), attempts: 1 });
}

// One submission run per approval, never retried: the job id is the approval's, attempts is 1,
// and the executions table refuses a second run for the same approval even if the job is added
// again after Redis forgot the first. A finished job for the approval (one that was skipped
// because submission was switched off, say) is cleared so "submit" can queue it again: the
// claim in the executions table, not the job id, is what keeps it to one run.
export async function enqueueApplicationSubmit(queue: Queue, data: ApplicationSubmitJobData) {
  const jobId = applicationSubmitJobId(data.approvalId);
  const previous = await queue.getJob(jobId);
  if (previous && ((await previous.isCompleted()) || (await previous.isFailed()))) await previous.remove();
  return queue.add("submit", data, { jobId, attempts: 1 });
}

// A mail check on demand. Two clicks within a minute add one job.
export async function enqueueEmailCheck(queue: Queue, at = new Date()) {
  return queue.add(MONITORING_JOBS.emailCheck, { correlationId: "manual.email-check" }, { jobId: emailCheckJobId(at), attempts: 1 });
}
