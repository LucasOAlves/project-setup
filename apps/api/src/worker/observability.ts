import type { Job, Worker } from "bullmq";
import type { AuditRepository } from "../modules/audit/audit-repository.js";
import type { Logger } from "../observability/logger.js";
import { QUEUE_NAMES, type QueueName } from "./queues.js";

// Every queue gets the same treatment: completions and failures are logged (redacted), and
// pipeline queues (everything but the system heartbeat) also write an audit event, so the
// user-visible history shows what the worker did and what it gave up on.
export function attachObservability(worker: Worker, queueName: QueueName, logger: Logger, audit: AuditRepository) {
  const log = logger.child({ queue: queueName });
  const audited = queueName !== QUEUE_NAMES.system;

  worker.on("completed", (job: Job) => {
    log.info("job completed", { job: job.name, jobId: job.id, attempts: job.attemptsMade });
    if (audited) {
      void recordAudit(audit, log, job, "WORKER_JOB_COMPLETED", {});
    }
  });

  worker.on("failed", (job: Job | undefined, error: Error) => {
    if (!job) {
      log.error("job failed", { error });
      return;
    }
    const maxAttempts = job.opts.attempts ?? 1;
    const final = job.attemptsMade >= maxAttempts || error.name === "UnrecoverableError";
    log[final ? "error" : "warn"]("job failed", {
      job: job.name,
      jobId: job.id,
      attempts: job.attemptsMade,
      maxAttempts,
      final,
      error,
    });
    if (audited && final) {
      void recordAudit(audit, log, job, "WORKER_JOB_FAILED", { error });
    }
  });

  worker.on("error", (error) => log.error("worker error", { error }));
}

async function recordAudit(
  audit: AuditRepository,
  log: Logger,
  job: Job,
  eventType: string,
  payload: Record<string, unknown>,
) {
  try {
    const data = (job.data ?? {}) as { correlationId?: string };
    await audit.record({
      eventType,
      actor: "WORKER",
      entityType: `queue:${job.queueName}`,
      entityId: job.id ?? "",
      correlationId: data.correlationId ?? "",
      payload: { job: job.name, attempts: job.attemptsMade, ...payload },
    });
  } catch (error) {
    log.error("audit write failed", { error });
  }
}
