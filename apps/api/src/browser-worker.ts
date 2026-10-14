import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { Worker } from "bullmq";
import postgres from "postgres";
import { createDb } from "./db/client.js";
import { waitForDatabase } from "./db/wait.js";
import { loadEnv } from "./env.js";
import { AuditRepository } from "./modules/audit/audit-repository.js";
import { ApplicationRepository } from "./modules/career/application-repository.js";
import { ApplicationService } from "./modules/career/application-service.js";
import { CareerRepository } from "./modules/career/career-repository.js";
import { ApplicationPrepProcessor, type ApplicationPrepJob } from "./modules/browser/application-prep-processor.js";
import { BrowserApplicationPreparer } from "./modules/browser/application-preparer.js";
import { mockPortalResponse } from "./modules/browser/mock-portals.js";
import { ApplicationDocumentRepository } from "./modules/career/application-document-repository.js";
import { ApplicationDocumentService } from "./modules/career/application-document-service.js";
import { ApplicationFillPlanner } from "./modules/career/application-fill-context.js";
import { SavedAnswerRepository } from "./modules/career/saved-answer-repository.js";
import { ApplicationDetailsRepository } from "./modules/profile/application-details-repository.js";
import { ApplicationDetailsService } from "./modules/profile/application-details-service.js";
import { ProfileRepository } from "./modules/profile/profile-repository.js";
import { LocalStorageProvider } from "./modules/uploads/local-storage.js";
import { createLogger } from "./observability/logger.js";
import { attachObservability } from "./worker/observability.js";
import { createRedisConnection, QUEUE_NAMES } from "./worker/queues.js";

loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"),
});

// Browser worker process (Milestone 3, ADR-020): the only process that runs Chromium. It
// consumes `application-prep` one run at a time, with no access to the model providers or
// the API's routes, and records each run's outcome on the application. It never submits.
async function main() {
  const env = loadEnv();
  const logger = createLogger({ service: "browser-worker" });

  const sql = postgres(env.DATABASE_URL, { max: 3 });
  await waitForDatabase(sql);
  const db = createDb(sql);
  const audit = new AuditRepository(db);
  const careerRepo = new CareerRepository(db);
  const applications = new ApplicationService(new ApplicationRepository(db), audit, async (jobId) => {
    const job = await careerRepo.getJob(jobId);
    return job ? { id: job.id, url: job.url } : null;
  });
  if (env.BROWSER_MOCK_PORTALS && env.NODE_ENV === "production") {
    throw new Error("BROWSER_MOCK_PORTALS is for local development only.");
  }
  if (env.BROWSER_MOCK_PORTALS) {
    logger.warn("mock portals on", { reason: "BROWSER_MOCK_PORTALS=true: no request reaches the network" });
  }
  // The worker reads the user's details to fill forms. None of it goes to a model: this
  // process has no model keys.
  const documents = new ApplicationDocumentService(
    new ApplicationDocumentRepository(db),
    new LocalStorageProvider(env.STORAGE_DIR),
    async (jobId) => (await careerRepo.getJob(jobId)) !== null,
  );
  const profileRepo = new ProfileRepository(db);
  const details = new ApplicationDetailsService(new ApplicationDetailsRepository(db));
  const savedAnswers = new SavedAnswerRepository(db);
  const planner = new ApplicationFillPlanner({
    getProfile: async () => {
      const record = await profileRepo.getWorkspaceProfile();
      return record ? { fullName: record.profile.fullName, experiences: record.experiences } : null;
    },
    getDetails: () => details.get(),
    latestDocument: (jobId, type) => documents.latest(jobId, type),
    savedAnswers: () => savedAnswers.all(),
  });
  const processor = new ApplicationPrepProcessor(
    applications,
    new BrowserApplicationPreparer({
      executablePath: env.BROWSER_EXECUTABLE_PATH,
      runTimeoutMs: env.BROWSER_RUN_TIMEOUT_MS,
      ...(env.BROWSER_MOCK_PORTALS ? { mockResponse: mockPortalResponse } : {}),
    }),
    planner,
  );

  const connection = createRedisConnection(env.REDIS_URL);
  const worker = new Worker(QUEUE_NAMES.applicationPrep, (job) => processor.process(job.data as ApplicationPrepJob), {
    connection,
    concurrency: 1,
  });
  attachObservability(worker, QUEUE_NAMES.applicationPrep, logger, audit);
  logger.info("browser worker started", { queue: QUEUE_NAMES.applicationPrep, runTimeoutMs: env.BROWSER_RUN_TIMEOUT_MS });

  const shutdown = async () => {
    await worker.close();
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
