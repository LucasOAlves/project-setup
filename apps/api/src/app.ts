import {
  ERROR_CODES,
  type ImageProviderName,
  type TextProviderName,
} from "@studio/shared";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import type { Env } from "./env.js";
import { AppError } from "./app-error.js";
import type { Database } from "./db/client.js";
import { AnthropicTextGenerationProvider } from "./modules/ai/anthropic-text-generation-provider.js";
import { OpenAITextGenerationProvider } from "./modules/ai/openai-text-generation-provider.js";
import type { TextGenerationProvider } from "./modules/ai/text-generation-provider.js";
import { registerCareerRoutes } from "./modules/career/career-routes.js";
import { CareerRepository } from "./modules/career/career-repository.js";
import { CareerService } from "./modules/career/career-service.js";
import { SourceRegistry } from "./modules/career/source-registry.js";
import { createSearchProviders } from "./modules/career/search-providers.js";
import { registerDiscoveryRoutes } from "./modules/career/discovery-routes.js";
import { CompanyWatchService } from "./modules/career/company-watch-service.js";
import { createBoardProviders } from "./modules/career/board-providers.js";
import { registerContentPlanRoutes } from "./modules/content-plan/content-plan-routes.js";
import { ContentPlanRepository } from "./modules/content-plan/content-plan-repository.js";
import { ContentPlanService } from "./modules/content-plan/content-plan-service.js";
import { registerCustomTopicRoutes } from "./modules/custom-topics/custom-topic-routes.js";
import { CustomTopicRepository } from "./modules/custom-topics/custom-topic-repository.js";
import { CustomTopicService } from "./modules/custom-topics/custom-topic-service.js";
import { OpenAIImageGenerationProvider } from "./modules/ai/openai-image-generation-provider.js";
import { PollinationsImageGenerationProvider } from "./modules/ai/pollinations-image-generation-provider.js";
import type { ImageGenerationProvider } from "./modules/ai/image-generation-provider.js";
import { registerImageRoutes } from "./modules/images/image-routes.js";
import { ImageRepository } from "./modules/images/image-repository.js";
import { ImageService } from "./modules/images/image-service.js";
import { NewsApiNewsProvider } from "./modules/news/newsapi-adapter.js";
import { registerOpportunityRoutes } from "./modules/opportunities/opportunity-routes.js";
import { OpportunityRepository } from "./modules/opportunities/opportunity-repository.js";
import { OpportunityService } from "./modules/opportunities/opportunity-service.js";
import { registerPostRoutes } from "./modules/posts/post-routes.js";
import { PostRepository } from "./modules/posts/post-repository.js";
import { PostService } from "./modules/posts/post-service.js";
import { registerResearchRoutes } from "./modules/news/research-routes.js";
import { ResearchRepository } from "./modules/news/research-repository.js";
import { ResearchService } from "./modules/news/research-service.js";
import { registerPersonaRoutes } from "./modules/persona/persona-routes.js";
import { PersonaRepository } from "./modules/persona/persona-repository.js";
import { PersonaService } from "./modules/persona/persona-service.js";
import { LocalStorageProvider } from "./modules/uploads/local-storage.js";
import { ApplicationDetailsRepository } from "./modules/profile/application-details-repository.js";
import { registerApplicationDetailsRoutes } from "./modules/profile/application-details-routes.js";
import { ApplicationDetailsService } from "./modules/profile/application-details-service.js";
import { ProfileRepository } from "./modules/profile/profile-repository.js";
import { ApplicationDocumentRepository } from "./modules/career/application-document-repository.js";
import { ApplicationDocumentService } from "./modules/career/application-document-service.js";
import { registerDocumentRoutes } from "./modules/career/document-routes.js";
import { ApplicationRepository } from "./modules/career/application-repository.js";
import { ApplicationService } from "./modules/career/application-service.js";
import { submissionCheckFor } from "./modules/career/submission-permission.js";
import { registerApplicationRoutes } from "./modules/career/application-routes.js";
import { emailAccountServiceFromEnv, mailCheckQueue, recruiterMailServiceFromEnv } from "./modules/email/email-setup.js";
import { MeteredTextProvider } from "./modules/usage/metered-providers.js";
import { usageLedgerFromEnv } from "./modules/usage/usage-setup.js";
import { notifierFromEnv } from "./modules/notifications/notification-setup.js";
import { registerAttentionRoute } from "./modules/notifications/notification-routes.js";
import { registerUsageRoutes } from "./modules/usage/usage-routes.js";
import { registerOperationsRoutes } from "./modules/operations/operations-routes.js";
import { OperationsService } from "./modules/operations/operations-service.js";
import { OperationsRepository } from "./modules/operations/operations-repository.js";
import { ResponseTrackingService } from "./modules/email/response-tracking-service.js";
import { RecruiterMessageRepository } from "./modules/email/recruiter-message-repository.js";
import { registerEmailRoutes } from "./modules/email/email-routes.js";
import { ApplicationDispatcher } from "./modules/career/application-dispatcher.js";
import { ApplicationAnswerService } from "./modules/career/application-answer-service.js";
import { SavedAnswerRepository } from "./modules/career/saved-answer-repository.js";
import { AuditRepository } from "./modules/audit/audit-repository.js";
import { TailoredCvGenerator } from "./modules/career/tailored-cv-generator.js";
import { CoverLetterGenerator } from "./modules/career/cover-letter-generator.js";
import { ApplicationAnswersGenerator } from "./modules/career/application-answers-generator.js";
import { evaluationSettingsFromEnv } from "./modules/career/job-intake.js";
import { authConfigFromEnv, registerAuth } from "./modules/auth/auth-routes.js";
import { registerProfileRoutes } from "./modules/profile/profile-routes.js";
import { retentionPolicyFromEnv } from "./modules/backup/retention-service.js";
import { ProfileService } from "./modules/profile/profile-service.js";

export async function buildApp(env: Env, db: Database) {
  const app = Fastify({ logger: true });

  // The web app reaches the API through its own /api proxy, so only listed origins get CORS.
  await app.register(cors, { origin: env.APP_ORIGINS.length > 0 ? env.APP_ORIGINS : false, credentials: true });
  await app.register(multipart, {
    limits: {
      fileSize: Math.max(env.MAX_PHOTO_BYTES, env.MAX_DOCUMENT_BYTES),
      files: 1,
    },
  });

  const storage = new LocalStorageProvider(env.STORAGE_DIR);
  // Telegram notifications (Milestone 5, ticket 6), and the cost ledger every model call goes
  // through (ticket 7).
  const notifier = notifierFromEnv(env, db);
  const usage = usageLedgerFromEnv(env, db, (crossing) => notifier.budgetCrossed(crossing));
  const textProviders: Record<TextProviderName, TextGenerationProvider> = {
    openai: new MeteredTextProvider(new OpenAITextGenerationProvider(env.OPENAI_API_KEY, env.OPENAI_TEXT_MODEL), "openai", usage),
    anthropic: new MeteredTextProvider(new AnthropicTextGenerationProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_TEXT_MODEL), "anthropic", usage),
  };
  const defaultTextProvider: TextProviderName = env.TEXT_PROVIDER;
  const imageProviders: Record<ImageProviderName, ImageGenerationProvider> = {
    openai: new OpenAIImageGenerationProvider(env.OPENAI_API_KEY, env.OPENAI_IMAGE_MODEL),
    pollinations: new PollinationsImageGenerationProvider(),
  };
  const defaultImageProvider: ImageProviderName = env.IMAGE_PROVIDER;
  const profiles = new ProfileService(
    new ProfileRepository(db),
    storage,
    env.MAX_PHOTO_BYTES,
    textProviders,
    defaultTextProvider,
  );

  const personas = new PersonaService(
    profiles,
    new PersonaRepository(db),
    textProviders,
    defaultTextProvider,
  );
  const research = new ResearchService(
    profiles,
    personas,
    new ResearchRepository(db),
    new NewsApiNewsProvider(env.NEWS_API_KEY),
    env.NEWS_LOOKBACK_DAYS,
  );
  const opportunities = new OpportunityService(
    profiles,
    personas,
    new ResearchRepository(db),
    new OpportunityRepository(db),
    textProviders,
    defaultTextProvider,
  );
  const posts = new PostService(
    profiles,
    personas,
    opportunities,
    new PostRepository(db),
    textProviders,
    defaultTextProvider,
  );
  const contentPlan = new ContentPlanService(
    profiles,
    personas,
    new ResearchRepository(db),
    new OpportunityRepository(db),
    opportunities,
    new ContentPlanRepository(db),
    textProviders,
    defaultTextProvider,
  );
  const customTopics = new CustomTopicService(
    profiles,
    personas,
    new ResearchRepository(db),
    new OpportunityRepository(db),
    opportunities,
    new CustomTopicRepository(db),
  );
  const boardProviders = createBoardProviders();
  const searchProviders = createSearchProviders(env);
  const sourceRegistry = new SourceRegistry(db);
  const career = new CareerService(
    new CareerRepository(db),
    profiles,
    textProviders,
    defaultTextProvider,
    boardProviders,
    searchProviders,
    sourceRegistry,
    evaluationSettingsFromEnv(env),
  );
  const images = new ImageService(
    profiles,
    personas,
    posts,
    textProviders,
    defaultTextProvider,
    imageProviders,
    defaultImageProvider,
    storage,
    new ImageRepository(db),
  );

  const careerRepository = new CareerRepository(db);
  const documents = new ApplicationDocumentService(
    new ApplicationDocumentRepository(db),
    storage,
    async (jobId) => (await careerRepository.getJob(jobId)) !== null,
  );
  const applicationDetails = new ApplicationDetailsService(new ApplicationDetailsRepository(db));
  const materialsDeps = {
    careerRepo: careerRepository,
    getProfile: () => profiles.getProfile(),
    getApplicationDetails: () => applicationDetails.get(),
    textProviders,
    defaultTextProvider,
    documents,
  };
  const cvGenerator = new TailoredCvGenerator(materialsDeps);
  const coverLetters = new CoverLetterGenerator(materialsDeps);
  const answers = new ApplicationAnswersGenerator(materialsDeps);
  const applicationRepo = new ApplicationRepository(db);
  const applications = new ApplicationService(
    applicationRepo,
    new AuditRepository(db),
    async (jobId) => {
      const job = await careerRepository.getJob(jobId);
      return job ? { id: job.id, url: job.url } : null;
    },
    () => new Date(),
    submissionCheckFor(env.APPLICATION_SUBMISSION_ENABLED, (portal) => sourceRegistry.applicationPolicy(portal)),
    (jobId, at) => careerRepository.markApplied(jobId, at),
    (change) => notifier.applicationChanged(change),
  );

  const authConfig = authConfigFromEnv(env);
  await registerAuth(app, authConfig, new AuditRepository(db));

  app.get("/health", async () => ({ ok: true }));

  await registerProfileRoutes(app, profiles, env.MAX_DOCUMENT_BYTES);
  await registerApplicationDetailsRoutes(app, applicationDetails);
  await registerPersonaRoutes(app, personas);
  await registerResearchRoutes(app, research);
  await registerOpportunityRoutes(app, opportunities);
  await registerPostRoutes(app, posts);
  await registerContentPlanRoutes(app, contentPlan, env.MAX_DOCUMENT_BYTES);
  await registerCustomTopicRoutes(app, customTopics);
  await registerImageRoutes(app, images);
  await registerCareerRoutes(app, career, sourceRegistry, documents);
  await registerDocumentRoutes(app, documents, { cv: cvGenerator, coverLetters, answers });
  await registerApplicationRoutes(
    app,
    applications,
    new ApplicationDispatcher(env.REDIS_URL, applications),
    storage,
    new ApplicationAnswerService({
      applications,
      saveAnswers: (saved) => new SavedAnswerRepository(db).upsert(saved),
      setAgreed: (id, agreed) => applicationRepo.setAgreed(id, agreed),
      audit: new AuditRepository(db),
    }),
    env.APPLICATION_SUBMISSION_ENABLED,
  );
  const responses = new ResponseTrackingService(new RecruiterMessageRepository(db), (jobId, status) => career.updateJobStatus(jobId, status), new AuditRepository(db), env.FOLLOW_UP_AFTER_DAYS);
  await registerDiscoveryRoutes(app, env, new CompanyWatchService(new CareerRepository(db)));
  await registerEmailRoutes(app, emailAccountServiceFromEnv(env, db), recruiterMailServiceFromEnv(env, db, usage, notifier), mailCheckQueue(env.REDIS_URL), authConfig.secureCookie,
    responses,
  );
  await registerAttentionRoute(app, applications, responses);

  await registerUsageRoutes(app, usage);
  const dataSafety = {
    retention: retentionPolicyFromEnv(env),
    backups: { enabled: Boolean(env.BACKUP_DIR && env.BACKUP_ENCRYPTION_KEY), keep: env.BACKUP_KEEP },
  };
  await registerOperationsRoutes(app, new OperationsService(new OperationsRepository(db), usage, () => career.getFeedbackSummary(), dataSafety));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    const code = (error as { code?: string }).code;
    if (code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.code(413).send({
        error: {
          code: ERROR_CODES.PAYLOAD_TOO_LARGE,
          message: "The uploaded file is too large.",
        },
      });
    }

    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({
        error: {
          code: ERROR_CODES.VALIDATION,
          message: "The request is invalid.",
        },
      });
    }

    app.log.error(error);
    return reply.code(500).send({
      error: {
        code: "INTERNAL",
        message: "Something went wrong.",
      },
    });
  });

  return app;
}
