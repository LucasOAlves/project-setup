import { opportunityGenerateInputSchema } from "@studio/shared";
import type { FastifyInstance } from "fastify";
import { validationError } from "../../app-error.js";
import type { OpportunityService } from "./opportunity-service.js";

export async function registerOpportunityRoutes(
  app: FastifyInstance,
  service: OpportunityService,
): Promise<void> {
  app.get("/api/opportunities", async () => {
    const opportunities = await service.getLatest();
    return { opportunities };
  });

  app.get("/api/opportunities/selected", async () => {
    const opportunities = await service.getCurrentSelection();
    return { opportunities };
  });

  app.post("/api/opportunities/generate", async (request, reply) => {
    const parsed = opportunityGenerateInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw validationError("Invalid generate request.");
    }
    const opportunities = await service.generate(parsed.data.provider);
    return reply.code(201).send({ opportunities });
  });

  app.post("/api/opportunities/:opportunityId/select", async (request) => {
    const { opportunityId } = request.params as { opportunityId: string };
    const opportunities = await service.select(opportunityId);
    return { opportunities };
  });
}
