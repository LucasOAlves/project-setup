import { Queue, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import { discoveryJobId, evaluationJobId } from "./job-ids.js";

// Queue names are the contract between whoever enqueues (API routes, schedulers) and the
// worker process that consumes them — see ADR-015. New pipelines add their queue here
// rather than spelling the name at each call site.
export const QUEUE_NAMES = {
  system: "system",
  discovery: "discovery",
  evaluation: "evaluation",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const SYSTEM_JOBS = {
  heartbeat: "heartbeat",
} as const;

export type DiscoveryJobData = { sourceId: string; correlationId: string };
export type EvaluationJobData = { jobId: string; profileVersion: number; correlationId: string };

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
