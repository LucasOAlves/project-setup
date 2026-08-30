import {
  postAngleInputSchema,
  postGenerateInputSchema,
  postHistoryQuerySchema,
  postHookInputSchema,
  postRewriteInputSchema,
  postToneInputSchema,
  postTrackingInputSchema,
  sectionCommentReviewInputSchema,
} from "@studio/shared";
import type { FastifyInstance } from "fastify";
import { validationError } from "../../app-error.js";
import type { PostService } from "./post-service.js";

export async function registerPostRoutes(
  app: FastifyInstance,
  service: PostService,
): Promise<void> {
  app.get("/api/posts", async () => {
    const post = await service.getLatest();
    return { post };
  });

  app.get("/api/posts/history", async (request) => {
    const parsed = postHistoryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw validationError("Invalid history query.");
    }
    return service.list(parsed.data);
  });

  app.get("/api/posts/:id", async (request) => {
    const { id } = request.params as { id: string };
    const post = await service.getById(id);
    return { post };
  });

  app.patch("/api/posts/:id/tracking", async (request) => {
    const { id } = request.params as { id: string };
    const parsed = postTrackingInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Invalid tracking update.");
    }
    const post = await service.updateTracking(id, parsed.data);
    return { post };
  });

  app.post("/api/posts/generate", async (request, reply) => {
    const parsed = postGenerateInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw validationError("Invalid generate request.");
    }
    const post = await service.generate(parsed.data.opportunityId, parsed.data.provider);
    return reply.code(201).send({ post });
  });

  app.post("/api/posts/regenerate", async (_request, reply) => {
    const post = await service.generate();
    return reply.code(201).send({ post });
  });

  app.post("/api/posts/hook", async (request, reply) => {
    const parsed = postHookInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw validationError("Invalid hook request.");
    }
    const post = await service.edit({
      action: "HOOK",
      postId: parsed.data.postId,
      provider: parsed.data.provider,
    });
    return reply.code(201).send({ post });
  });

  app.post("/api/posts/tone", async (request, reply) => {
    const parsed = postToneInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Choose a supported writing tone.");
    }
    const post = await service.edit({
      action: "TONE",
      tone: parsed.data.tone,
      postId: parsed.data.postId,
      provider: parsed.data.provider,
    });
    return reply.code(201).send({ post });
  });

  app.post("/api/posts/angle", async (request, reply) => {
    const parsed = postAngleInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Choose a supported angle.");
    }
    const post = await service.edit({
      action: "ANGLE",
      angle: parsed.data.angle,
      postId: parsed.data.postId,
      provider: parsed.data.provider,
    });
    return reply.code(201).send({ post });
  });

  app.post("/api/posts/section-comments/review", async (request, reply) => {
    const parsed = sectionCommentReviewInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Add at least one comment before reviewing.");
    }
    const reviews = await service.reviewSectionComments(
      parsed.data.sectionComments,
      parsed.data.provider,
    );
    return reply.code(200).send({ reviews });
  });

  app.post("/api/posts/rewrite", async (request, reply) => {
    const parsed = postRewriteInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Add at least one comment before applying.");
    }
    const post = await service.edit({
      action: "REWRITE",
      sectionComments: parsed.data.sectionComments,
      postId: parsed.data.postId,
      provider: parsed.data.provider,
    });
    return reply.code(201).send({ post });
  });
}
