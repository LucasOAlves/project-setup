import { imageGenerateInputSchema } from "@studio/shared";
import type { FastifyInstance } from "fastify";
import { notFound, validationError } from "../../app-error.js";
import type { ImageService } from "./image-service.js";

export async function registerImageRoutes(
  app: FastifyInstance,
  service: ImageService,
): Promise<void> {
  app.post("/api/images/generate", async (request, reply) => {
    const parsed = imageGenerateInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw validationError("Invalid image generate request.");
    }
    const image = await service.generate(
      parsed.data.postId,
      parsed.data.textProvider,
      parsed.data.imageProvider,
    );
    return reply.code(201).send({ image });
  });

  app.get("/api/posts/:postId/image", async (request) => {
    const { postId } = request.params as { postId: string };
    const image = await service.getLatestForPost(postId);
    return { image };
  });

  app.get("/api/images/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const object = await service.getImageFile(id);
    if (!object) {
      throw notFound("Image not found.");
    }
    return reply
      .header("Content-Type", object.mimeType)
      .header("Cache-Control", "private, max-age=3600")
      .send(object.bytes);
  });
}
