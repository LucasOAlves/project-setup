import type { FastifyInstance } from "fastify";
import type { ResearchService } from "./research-service.js";

export async function registerResearchRoutes(
  app: FastifyInstance,
  service: ResearchService,
): Promise<void> {
  app.get("/api/research", async () => {
    const research = await service.getLatest();
    return { research };
  });

  app.post("/api/research/discover", async (_request, reply) => {
    const research = await service.discover();
    return reply.code(201).send({ research });
  });
}
