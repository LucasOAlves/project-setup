import { ERROR_CODES, type ImageProviderName, type TextProviderName } from "@studio/shared";
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
import { ProfileRepository } from "./modules/profile/profile-repository.js";
import { registerProfileRoutes } from "./modules/profile/profile-routes.js";
import { ProfileService } from "./modules/profile/profile-service.js";

export async function buildApp(env: Env, db: Database) {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: {
      fileSize: Math.max(env.MAX_PHOTO_BYTES, env.MAX_DOCUMENT_BYTES),
      files: 1,
    },
  });

  const storage = new LocalStorageProvider(env.STORAGE_DIR);
  const textProviders: Record<TextProviderName, TextGenerationProvider> = {
    openai: new OpenAITextGenerationProvider(env.OPENAI_API_KEY, env.OPENAI_TEXT_MODEL),
    anthropic: new AnthropicTextGenerationProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_TEXT_MODEL),
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
  const career = new CareerService(
    new CareerRepository(db),
    profiles,
    textProviders,
    defaultTextProvider,
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

  app.get("/health", async () => ({ ok: true }));

  await registerProfileRoutes(app, profiles, env.MAX_DOCUMENT_BYTES);
  await registerPersonaRoutes(app, personas);
  await registerResearchRoutes(app, research);
  await registerOpportunityRoutes(app, opportunities);
  await registerPostRoutes(app, posts);
  await registerContentPlanRoutes(app, contentPlan, env.MAX_DOCUMENT_BYTES);
  await registerCustomTopicRoutes(app, customTopics);
  await registerImageRoutes(app, images);
  await registerCareerRoutes(app, career);

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
