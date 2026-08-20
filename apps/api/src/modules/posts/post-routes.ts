import {
  postAngleInputSchema,
  postRewriteInputSchema,
  postToneInputSchema,
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

  app.post("/api/posts/generate", async (_request, reply) => {
    const post = await service.generate();
    return reply.code(201).send({ post });
  });

  app.post("/api/posts/regenerate", async (_request, reply) => {
    const post = await service.generate();
    return reply.code(201).send({ post });
  });

  app.post("/api/posts/hook", async (_request, reply) => {
    const post = await service.edit({ action: "HOOK" });
    return reply.code(201).send({ post });
  });

  app.post("/api/posts/tone", async (request, reply) => {
    const parsed = postToneInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Choose a supported writing tone.");
    }
    const post = await service.edit({ action: "TONE", tone: parsed.data.tone });
    return reply.code(201).send({ post });
  });

  app.post("/api/posts/angle", async (request, reply) => {
    const parsed = postAngleInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Choose a supported angle.");
    }
    const post = await service.edit({ action: "ANGLE", angle: parsed.data.angle });
    return reply.code(201).send({ post });
  });

  app.post("/api/posts/rewrite", async (request, reply) => {
    const parsed = postRewriteInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Describe the section to rewrite.");
    }
    const post = await service.edit({ action: "REWRITE", section: parsed.data.section });
    return reply.code(201).send({ post });
  });
}
