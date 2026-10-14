import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { Worker, type Processor } from "bullmq";
import postgres from "postgres";
import { createDb } from "./db/client.js";
import { waitForDatabase } from "./db/wait.js";
import { loadEnv } from "./env.js";
import { AuditRepository } from "./modules/audit/audit-repository.js";
import { createLogger } from "./observability/logger.js";
import { attachObservability } from "./worker/observability.js";
import {
  createQueue,
  createRedisConnection,
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
// Processors are registered per queue below. Discovery (JOB-009) and evaluation (JOB-011/012)
// register theirs when they land; until then those queues exist (so the API can enqueue)
// but nothing consumes them.
async function main() {
  const env = loadEnv();
  const logger = createLogger({ service: "worker" });

  const sql = postgres(env.DATABASE_URL, { max: 5 });
  await waitForDatabase(sql);
  const audit = new AuditRepository(createDb(sql));

  const connection = createRedisConnection(env.REDIS_URL);

  const systemQueue = createQueue(QUEUE_NAMES.system, connection);
  await systemQueue.upsertJobScheduler(
    SYSTEM_JOBS.heartbeat,
    { every: env.WORKER_HEARTBEAT_MS },
    { name: SYSTEM_JOBS.heartbeat, opts: { attempts: 1, removeOnComplete: 10, removeOnFail: 50 } },
  );

  const processors: Partial<Record<QueueName, Processor>> = {
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
    await systemQueue.close();
    await connection.quit();
    await sql.end();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
