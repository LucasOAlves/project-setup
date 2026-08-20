import type { FastifyInstance } from "fastify";
import type { OpportunityService } from "./opportunity-service.js";

export async function registerOpportunityRoutes(
  app: FastifyInstance,
  service: OpportunityService,
): Promise<void> {
  app.get("/api/opportunities", async () => {
    const opportunities = await service.getLatest();
    return { opportunities };
  });

  app.post("/api/opportunities/generate", async (_request, reply) => {
    const opportunities = await service.generate();
    return reply.code(201).send({ opportunities });
  });

  app.post("/api/opportunities/:opportunityId/select", async (request) => {
    const { opportunityId } = request.params as { opportunityId: string };
    const opportunities = await service.select(opportunityId);
    return { opportunities };
  });
}
