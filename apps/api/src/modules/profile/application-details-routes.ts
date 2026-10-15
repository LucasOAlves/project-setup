import type { FastifyInstance } from "fastify";
import type { ApplicationDetailsService } from "./application-details-service.js";

export async function registerApplicationDetailsRoutes(
  app: FastifyInstance,
  service: ApplicationDetailsService,
): Promise<void> {
  app.get("/api/profile/application-details", async () => ({ details: await service.get() }));

  app.put("/api/profile/application-details", async (request) => ({ details: await service.save(request.body) }));
}
