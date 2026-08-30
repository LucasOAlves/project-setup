import { customTopicInputSchema, customTopicStatusInputSchema } from "@studio/shared";
import type { FastifyInstance } from "fastify";
import { validationError } from "../../app-error.js";
import type { CustomTopicService } from "./custom-topic-service.js";

export async function registerCustomTopicRoutes(
  app: FastifyInstance,
  service: CustomTopicService,
): Promise<void> {
  app.get("/api/custom-topics", async () => {
    const topics = await service.list();
    return { topics };
  });

  app.post("/api/custom-topics", async (request, reply) => {
    const parsed = customTopicInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Give the topic a title, a hook, and at least one key point.");
    }
    const topic = await service.create(parsed.data);
    return reply.code(201).send({ topic });
  });

  app.delete("/api/custom-topics/:id", async (request) => {
    const { id } = request.params as { id: string };
    await service.remove(id);
    const topics = await service.list();
    return { topics };
  });

  app.post("/api/custom-topics/:id/select", async (request) => {
    const { id } = request.params as { id: string };
    const opportunities = await service.selectTopic(id);
    return { opportunities };
  });

  app.patch("/api/custom-topics/:id/status", async (request) => {
    const { id } = request.params as { id: string };
    const parsed = customTopicStatusInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Invalid status.");
    }
    const topics = await service.updateStatus(id, parsed.data.status);
    return { topics };
  });
}
