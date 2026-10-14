import { Redis } from "ioredis";

// Queue names are the contract between whoever enqueues (API routes, schedulers) and the
// worker process that consumes them — see ADR-015. New Job Hunter pipelines (discovery,
// evaluation) add their queue here rather than spelling the name at each call site.
export const QUEUE_NAMES = {
  system: "system",
} as const;

export const SYSTEM_JOBS = {
  heartbeat: "heartbeat",
} as const;

// BullMQ requires maxRetriesPerRequest: null on connections used by a Worker, so blocking
// commands wait for Redis to come back instead of failing the job mid-flight.
export function createRedisConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}
