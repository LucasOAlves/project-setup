import { contentPlanStatusInputSchema, textProviderSchema } from "@studio/shared";
import type { FastifyInstance } from "fastify";
import { ERROR_CODES } from "@studio/shared";
import { AppError } from "../../app-error.js";
import type { ContentPlanService } from "./content-plan-service.js";

export async function registerContentPlanRoutes(
  app: FastifyInstance,
  service: ContentPlanService,
  maxDocumentBytes: number,
): Promise<void> {
  app.get("/api/content-plan", async () => {
    const topics = await service.list();
    return { topics };
  });

  app.post("/api/content-plan/:topicId/select", async (request) => {
    const { topicId } = request.params as { topicId: string };
    const opportunities = await service.selectTopic(topicId);
    return { opportunities };
  });

  app.patch("/api/content-plan/:topicId/status", async (request) => {
    const { topicId } = request.params as { topicId: string };
    const { status } = contentPlanStatusInputSchema.parse(request.body);
    const topics = await service.updateStatus(topicId, status);
    return { topics };
  });

  app.post("/api/content-plan/upload/extract", async (request, reply) => {
    const file = await request.file({ limits: { fileSize: maxDocumentBytes } });
    if (!file) {
      throw new AppError(ERROR_CODES.VALIDATION, "A content plan PDF is required.", 400);
    }
    if (file.mimetype !== "application/pdf") {
      throw new AppError(ERROR_CODES.UNSUPPORTED_MEDIA, "The content plan must be a PDF file.", 415);
    }
    const bytes = await file.toBuffer();
    const query = request.query as { provider?: string };
    const provider = textProviderSchema.safeParse(query.provider);
    const topics = await service.extractFromDocument(
      bytes,
      provider.success ? provider.data : undefined,
    );
    return reply.code(200).send({ topics });
  });

  app.post("/api/content-plan/upload/save", async (request) => {
    const body = request.body as { topics?: unknown; sourceFilename?: string };
    const topics = await service.saveUploadedTopics(
      body.topics,
      body.sourceFilename ?? "uploaded-plan.pdf",
    );
    return { topics };
  });
}
