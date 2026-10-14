import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { Queue, Worker } from "bullmq";
import { loadEnv } from "./env.js";
import { createRedisConnection, QUEUE_NAMES, SYSTEM_JOBS } from "./worker/queues.js";

loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"),
});

// Background worker process (ADR-015): same codebase and modules as the API, separate
// entrypoint, so long-running or scheduled work (job discovery, evaluation, browser runs)
// never blocks a request. Right now it only runs a heartbeat that proves Redis, the queue
// and the scheduler are wired; Job Hunter pipelines register their processors here.
async function main() {
  const env = loadEnv();
  const connection = createRedisConnection(env.REDIS_URL);

  const systemQueue = new Queue(QUEUE_NAMES.system, { connection });
  await systemQueue.upsertJobScheduler(
    SYSTEM_JOBS.heartbeat,
    { every: env.WORKER_HEARTBEAT_MS },
    { name: SYSTEM_JOBS.heartbeat, opts: { removeOnComplete: 10, removeOnFail: 50 } },
  );

  const systemWorker = new Worker(
    QUEUE_NAMES.system,
    async (job) => {
      if (job.name === SYSTEM_JOBS.heartbeat) {
        return { ok: true, at: new Date().toISOString() };
      }
      throw new Error(`Unknown system job: ${job.name}`);
    },
    { connection, concurrency: 1 },
  );

  systemWorker.on("completed", (job) => {
    console.log(JSON.stringify({ level: "info", queue: job.queueName, job: job.name, msg: "completed" }));
  });
  systemWorker.on("failed", (job, error) => {
    console.error(
      JSON.stringify({ level: "error", queue: job?.queueName, job: job?.name, msg: error.message }),
    );
  });

  console.log(JSON.stringify({ level: "info", msg: "worker started", queues: Object.values(QUEUE_NAMES) }));

  const shutdown = async () => {
    await systemWorker.close();
    await systemQueue.close();
    await connection.quit();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
