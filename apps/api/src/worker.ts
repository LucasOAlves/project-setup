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
import { CompanyWatchPoller } from "./modules/career/company-watch-service.js";
import { createBoardProviders } from "./modules/career/board-providers.js";
import { BraveSearchClient } from "./modules/career/brave-search-client.js";
import { discoverySourceIds, WEB_SEARCH_SOURCE, WebDiscoveryService } from "./modules/career/web-discovery-service.js";
import { JobIntake } from "./modules/career/job-intake.js";
import { evaluationSettingsFromEnv } from "./modules/career/job-intake.js";
import { JobExplainer } from "./modules/career/job-explanation.js";
import type { MatchProfile } from "./modules/career/job-matching.js";
import { ProfileRepository } from "./modules/profile/profile-repository.js";
import { createSearchProviders } from "./modules/career/search-providers.js";
import { SourceRegistry } from "./modules/career/source-registry.js";
import { AuditRepository } from "./modules/audit/audit-repository.js";
import { createLogger, type Logger } from "./observability/logger.js";
import { attachObservability } from "./worker/observability.js";
import {
  createQueue,
  createRedisConnection,
  enqueueEvaluation,
  enqueueWatchCompany,
  type DiscoveryJobData,
  type WatchCompanyJobData,
  WATCH_JOBS,
  type EvaluationJobData,
  MONITORING_JOBS,
  QUEUE_NAMES,
  SYSTEM_JOBS,
  type QueueName,
} from "./worker/queues.js";

import { defaultTextProvider, recruiterMailServiceFromEnv } from "./modules/email/email-setup.js";
import { MeteredSearchClient } from "./modules/usage/metered-providers.js";
import type { UsageLedger } from "./modules/usage/usage-ledger.js";
import { usageLedgerFromEnv } from "./modules/usage/usage-setup.js";
loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"),
});

// Background worker process (ADR-015): same codebase and modules as the API, separate
// entrypoint, so long-running or scheduled work (job discovery, evaluation, browser runs)
// never blocks a request. The API owns migrations; the worker only waits for the database.
//
// Processors are registered per queue below. Discovery (JOB-009) runs daily per configured
// source and queues each new, non-excluded job on `evaluation`, which runs the eligibility
// rules and matching v2 (JOB-011) against the current profile.
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
  await discoveryQueue.upsertJobScheduler(
    WATCH_JOBS.run,
    { pattern: env.DISCOVERY_CRON, tz: env.DISCOVERY_TZ },
    { name: WATCH_JOBS.run, data: { correlationId: "scheduled.watchlist" } },
  );

  // Recruiter replies (Milestone 5): Gmail is read hourly when a mailbox is connected.
  const monitoringQueue = createQueue(QUEUE_NAMES.monitoring, connection);
  await monitoringQueue.upsertJobScheduler(
    MONITORING_JOBS.emailCheck,
    { pattern: "15 * * * *", tz: env.DISCOVERY_TZ },
    { name: MONITORING_JOBS.emailCheck, data: { correlationId: "scheduled.email-check" }, opts: { attempts: 1 } },
  );
  // Every model call and search query goes through the cost ledger (ticket 7).
  const usage = usageLedgerFromEnv(env, db);
  const recruiterMail = recruiterMailServiceFromEnv(env, db, usage);

  const careerRepo = new CareerRepository(db);
  const profileRepo = new ProfileRepository(db);
  const intake = new JobIntake(careerRepo, evaluationSettingsFromEnv(env));
  const explainer = createExplainer(env, usage);
  if (!explainer) {
    logger.warn("explanations disabled", { reason: `no API key for TEXT_PROVIDER=${env.TEXT_PROVIDER}` });
  }
  const discovery = new DiscoveryService({
    intake,
    providers: createSearchProviders(env),
    sourceGate: new SourceRegistry(db),
    queueEvaluation: async (jobId, profileVersion) => {
      await enqueueEvaluation(evaluationQueue, { jobId, profileVersion, correlationId: "discovery" });
    },
  });

  const watchPoller = new CompanyWatchPoller({
    repo: careerRepo,
    intake,
    providers: createBoardProviders(),
    sourceGate: new SourceRegistry(db),
    queueEvaluation: async (jobId, profileVersion) => {
      await enqueueEvaluation(evaluationQueue, { jobId, profileVersion, correlationId: "watchlist" });
    },
  });

  const webDiscovery = env.BRAVE_SEARCH_API_KEY
    ? new WebDiscoveryService({
        search: new MeteredSearchClient(new BraveSearchClient(env.BRAVE_SEARCH_API_KEY), "brave", usage),
        intake,
        providers: createBoardProviders(),
        sourceGate: new SourceRegistry(db),
        queueEvaluation: async (jobId, profileVersion) => {
          await enqueueEvaluation(evaluationQueue, { jobId, profileVersion, correlationId: "web-search" });
        },
      })
    : null;
  if (!webDiscovery) {
    logger.warn("web search discovery disabled", { reason: "no BRAVE_SEARCH_API_KEY" });
  }

  const processors: Partial<Record<QueueName, Processor>> = {
    [QUEUE_NAMES.discovery]: async (job) => {
      if (job.name === WATCH_JOBS.run) {
        // Fan out: one poll per watched company, a few seconds apart.
        const now = new Date();
        const companyIds = await watchPoller.watchedCompanyIds();
        for (const [index, companyId] of companyIds.entries()) {
          await enqueueWatchCompany(
            discoveryQueue,
            { companyId, correlationId: "scheduled.watchlist" },
            now,
            index * WATCH_SPACING_MS,
          );
        }
        return { queued: companyIds.length };
      }
      if (job.name === WATCH_JOBS.company) {
        return watchPoller.poll((job.data as WatchCompanyJobData).companyId);
      }
      const data = job.data as DiscoveryJobData;
      if (data.sourceId === WEB_SEARCH_SOURCE) {
        if (!webDiscovery) return { skipped: "NO_BRAVE_SEARCH_API_KEY" };
        return webDiscovery.run(env.WEB_SEARCH_TITLES);
      }
      return discovery.runSource(data.sourceId, env.DISCOVERY_KEYWORDS);
    },
    [QUEUE_NAMES.evaluation]: async (job) => {
      const data = job.data as EvaluationJobData;
      const jobRow = await careerRepo.getJob(data.jobId);
      if (!jobRow) {
        // Deleted since it was queued: nothing to evaluate, and retrying would not help.
        return { jobId: data.jobId, skipped: "JOB_NOT_FOUND" };
      }
      // A failed model call is retried by the queue; on the last attempt the score is
      // stored without an explanation instead of losing the evaluation.
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      const { evaluation, explanation } = await intake.evaluateJob(jobRow, await loadMatchProfile(profileRepo), {
        explainer,
        onExplanationFailure: lastAttempt ? "skip" : "throw",
      });
      return {
        jobId: data.jobId,
        evaluationId: evaluation.id,
        eligibility: evaluation.eligibility,
        score: evaluation.score,
        confidence: evaluation.confidence,
        explanation,
        inputTokens: evaluation.inputTokens,
        outputTokens: evaluation.outputTokens,
      };
    },
    [QUEUE_NAMES.monitoring]: async (job) => {
      if (job.name === MONITORING_JOBS.emailCheck) return recruiterMail.check();
      throw new Error(`Unknown monitoring job: ${job.name}`);
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
    await Promise.all([systemQueue.close(), discoveryQueue.close(), evaluationQueue.close(), monitoringQueue.close()]);
    await connection.quit();
    await sql.end();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

const WATCH_SPACING_MS = 5_000;

// Explanations use the configured default text provider. Without its API key they are off,
// and evaluations store the score alone.
function createExplainer(env: Env, usage: UsageLedger): JobExplainer | null {
  const text = defaultTextProvider(env, usage);
  return text ? new JobExplainer(text) : null;
}

// The worker reads the profile straight from the repository: the API's ProfileService also
// wires storage and text providers the worker does not need.
async function loadMatchProfile(repo: ProfileRepository): Promise<MatchProfile | null> {
  const record = await repo.getWorkspaceProfile();
  if (!record) return null;
  return { ...record.profile, experiences: record.experiences };
}

// One daily job scheduler per configured source (DISCOVERY_SOURCES, plus web search when
// BRAVE_SEARCH_API_KEY is set; DISCOVERY_CRON in DISCOVERY_TZ). Schedulers for sources no
// longer configured are removed, so editing the env list and restarting the worker is the
// whole change.
async function scheduleDiscovery(queue: Queue, env: Env, logger: Logger) {
  const sourceIds = discoverySourceIds(env);
  const wanted = new Set(sourceIds.map((sourceId) => `discovery-${sourceId}`));
  for (const scheduler of await queue.getJobSchedulers()) {
    if (scheduler.key.startsWith("discovery-") && !wanted.has(scheduler.key)) {
      await queue.removeJobScheduler(scheduler.key);
    }
  }
  for (const sourceId of sourceIds) {
    await queue.upsertJobScheduler(
      `discovery-${sourceId}`,
      { pattern: env.DISCOVERY_CRON, tz: env.DISCOVERY_TZ },
      { name: "discover", data: { sourceId, correlationId: `scheduled.${sourceId}` } },
    );
  }
  logger.info("discovery scheduled", {
    sources: sourceIds,
    cron: env.DISCOVERY_CRON,
    tz: env.DISCOVERY_TZ,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
