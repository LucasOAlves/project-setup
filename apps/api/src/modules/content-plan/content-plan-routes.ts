import { contentPlanStatusInputSchema } from "@studio/shared";
import type { FastifyInstance } from "fastify";
import type { ContentPlanService } from "./content-plan-service.js";

export async function registerContentPlanRoutes(
  app: FastifyInstance,
  service: ContentPlanService,
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
}
