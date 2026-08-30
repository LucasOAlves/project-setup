import { personaGenerateInputSchema } from "@studio/shared";
import type { FastifyInstance } from "fastify";
import { validationError } from "../../app-error.js";
import type { PersonaService } from "./persona-service.js";

export async function registerPersonaRoutes(
  app: FastifyInstance,
  service: PersonaService,
): Promise<void> {
  app.get("/api/persona", async () => {
    const persona = await service.getPersona();
    return { persona };
  });

  app.post("/api/persona/generate", async (request, reply) => {
    const parsed = personaGenerateInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw validationError("Invalid generate request.");
    }
    const persona = await service.generatePersona(parsed.data.provider);
    return reply.code(201).send({ persona });
  });
}
