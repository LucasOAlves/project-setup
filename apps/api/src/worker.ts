import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { Worker, type Processor, type Queue } from "bullmq";
import postgres from "postgres";
import { createDb } from "./db/client.js";
import { waitForDatabase } from "./db/wait.js";
import { loadEnv, type Env } from "./env.js";
import { CareerRepository } from "./modules/career/career-repository.js";
import { DiscoveryService } from "./modules/career/discovery.js";
import { JobIntake } from "./modules/career/job-intake.js";
import { createSearchProviders } from "./modules/career/search-providers.js";
import { SourceRegistry } from "./modules/career/source-registry.js";
import { AuditRepository } from "./modules/audit/audit-repository.js";
import { createLogger, type Logger } from "./observability/logger.js";
import { attachObservability } from "./worker/observability.js";
import {
  createQueue,
  createRedisConnection,
  enqueueEvaluation,
  type DiscoveryJobData,
  QUEUE_NAMES,
  SYSTEM_JOBS,
  type QueueName,
} from "./worker/queues.js";

loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"),
});

// Background worker process (ADR-015): same codebase and modules as the API, separate
// entrypoint, so long-running or scheduled work (job discovery, evaluation, browser runs)
// never blocks a request. The API owns migrations; the worker only waits for the database.
//
// Processors are registered per queue below. Discovery (JOB-009) runs daily per configured
// source; evaluation (JOB-011/012) registers its processor when it lands, until then queued
// evaluations wait in Redis (their ids are deterministic, so they never pile up twice).
async function main() {
  const env = loadEnv();
  const logger = createLogger({ service: "worker" });

  const sql = postgres(env.DATABASE_URL, { max: 5 });
  await waitForDatabase(sql);
  const db = createDb(sql);
  const audit = new AuditRepository(db);

  const connection = createRedisConnection(env.REDIS_URL);

  const systemQueue = createQueue(QUEUE_NAMES.system, connection);
  await systemQueue.upsertJobScheduler(
    SYSTEM_JOBS.heartbeat,
    { every: env.WORKER_HEARTBEAT_MS },
    { name: SYSTEM_JOBS.heartbeat, opts: { attempts: 1, removeOnComplete: 10, removeOnFail: 50 } },
  );

  const evaluationQueue = createQueue(QUEUE_NAMES.evaluation, connection);
  const discoveryQueue = createQueue(QUEUE_NAMES.discovery, connection);
  await scheduleDiscovery(discoveryQueue, env, logger);

  const discovery = new DiscoveryService({
    intake: new JobIntake(new CareerRepository(db)),
    providers: createSearchProviders(env),
    sourceGate: new SourceRegistry(db),
    queueEvaluation: async (jobId, profileVersion) => {
      await enqueueEvaluation(evaluationQueue, { jobId, profileVersion, correlationId: "discovery" });
    },
  });

  const processors: Partial<Record<QueueName, Processor>> = {
    [QUEUE_NAMES.discovery]: async (job) => {
      const data = job.data as DiscoveryJobData;
      return discovery.runSource(data.sourceId, env.DISCOVERY_KEYWORDS);
    },
    [QUEUE_NAMES.system]: async (job) => {
      if (job.name === SYSTEM_JOBS.heartbeat) {
        return { ok: true, at: new Date().toISOString() };
      }
      throw new Error(`Unknown system job: ${job.name}`);
    },
  };

  const workers = Object.entries(processors).map(([queueName, processor]) => {
    const worker = new Worker(queueName, processor, { connection, concurrency: 1 });
    attachObservability(worker, queueName as QueueName, logger, audit);
    return worker;
  });

  logger.info("worker started", { queues: Object.keys(processors) });

  const shutdown = async () => {
    await Promise.all(workers.map((worker) => worker.close()));
    await Promise.all([systemQueue.close(), discoveryQueue.close(), evaluationQueue.close()]);
    await connection.quit();
    await sql.end();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// One daily job scheduler per configured source (DISCOVERY_SOURCES, DISCOVERY_CRON in
// DISCOVERY_TZ). Schedulers for sources no longer configured are removed, so editing the env
// list and restarting the worker is the whole change.
async function scheduleDiscovery(queue: Queue, env: Env, logger: Logger) {
  const wanted = new Set(env.DISCOVERY_SOURCES.map((sourceId) => `discovery-${sourceId}`));
  for (const scheduler of await queue.getJobSchedulers()) {
    if (scheduler.key.startsWith("discovery-") && !wanted.has(scheduler.key)) {
      await queue.removeJobScheduler(scheduler.key);
    }
  }
  for (const sourceId of env.DISCOVERY_SOURCES) {
    await queue.upsertJobScheduler(
      `discovery-${sourceId}`,
      { pattern: env.DISCOVERY_CRON, tz: env.DISCOVERY_TZ },
      { name: "discover", data: { sourceId, correlationId: `scheduled.${sourceId}` } },
    );
  }
  logger.info("discovery scheduled", {
    sources: env.DISCOVERY_SOURCES,
    cron: env.DISCOVERY_CRON,
    tz: env.DISCOVERY_TZ,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
