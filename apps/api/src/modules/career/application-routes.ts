import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { notFound } from "../../app-error.js";
import type { ApplicationDispatcher } from "./application-dispatcher.js";
import type { ApplicationService } from "./application-service.js";
import type { StorageProvider } from "../uploads/storage-provider.js";

const idSchema = z.string().uuid();

function parseId(raw: unknown, what: string): string {
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) throw notFound(`${what} not found.`);
  return parsed.data;
}

// Applications (Milestone 3): prepare one job's application, read it with its history, and
// reject it. Preparing never submits anything.
export async function registerApplicationRoutes(
  app: FastifyInstance,
  applications: ApplicationService,
  dispatcher: Pick<ApplicationDispatcher, "dispatch" | "close">,
  storage: Pick<StorageProvider, "get">,
): Promise<void> {
  app.addHook("onClose", async () => {
    await dispatcher.close();
  });

  app.post("/api/career/jobs/:id/application/prepare", async (request, reply) => {
    const { id } = request.params as { id: string };
    const started = await applications.startPreparation(parseId(id, "Job"));
    return reply.code(202).send({ application: await dispatcher.dispatch(started) });
  });

  app.get("/api/career/jobs/:id/application", async (request) => {
    const { id } = request.params as { id: string };
    return { application: await applications.getForJob(parseId(id, "Job")) };
  });

  // The last preview's screenshot, with every typed value masked. Kept for 30 days.
  app.get("/api/career/applications/:id/preview.png", async (request, reply) => {
    const { id } = request.params as { id: string };
    const key = await applications.screenshotKey(parseId(id, "Application"));
    const file = key ? await storage.get(key) : null;
    if (!file) throw notFound("No preview screenshot is kept for this application.");
    return reply.header("content-type", "image/png").header("cache-control", "no-store").send(file.bytes);
  });

  app.post("/api/career/applications/:id/reject", async (request) => {
    const { id } = request.params as { id: string };
    return { application: await applications.reject(parseId(id, "Application")) };
  });
}
