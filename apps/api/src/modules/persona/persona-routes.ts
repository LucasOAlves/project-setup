import type { FastifyInstance } from "fastify";
import type { PersonaService } from "./persona-service.js";

export async function registerPersonaRoutes(
  app: FastifyInstance,
  service: PersonaService,
): Promise<void> {
  app.get("/api/persona", async () => {
    const persona = await service.getPersona();
    return { persona };
  });

  app.post("/api/persona/generate", async (_request, reply) => {
    const persona = await service.generatePersona();
    return reply.code(201).send({ persona });
  });
}
