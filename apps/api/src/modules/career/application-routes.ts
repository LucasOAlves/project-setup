import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { notFound } from "../../app-error.js";
import type { ApplicationService } from "./application-service.js";

const idSchema = z.string().uuid();

function parseId(raw: unknown, what: string): string {
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) throw notFound(`${what} not found.`);
  return parsed.data;
}

// Applications (Milestone 3): read one job's application and its history, and reject it.
export async function registerApplicationRoutes(app: FastifyInstance, applications: ApplicationService): Promise<void> {
  app.get("/api/career/jobs/:id/application", async (request) => {
    const { id } = request.params as { id: string };
    return { application: await applications.getForJob(parseId(id, "Job")) };
  });

  app.post("/api/career/applications/:id/reject", async (request) => {
    const { id } = request.params as { id: string };
    return { application: await applications.reject(parseId(id, "Application")) };
  });
}
