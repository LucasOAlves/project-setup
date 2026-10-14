import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { notFound } from "../../app-error.js";
import type { ApplicationDocumentService } from "./application-document-service.js";

const idSchema = z.string().uuid();

function parseId(raw: unknown, what: string): string {
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) throw notFound(`${what} not found.`);
  return parsed.data;
}

// Application documents (Milestone 2). Documents are created by the generators for each
// document type; these routes list a job's versions and download a version's file.
export async function registerDocumentRoutes(app: FastifyInstance, documents: ApplicationDocumentService): Promise<void> {
  app.get("/api/career/jobs/:id/documents", async (request) => {
    const { id } = request.params as { id: string };
    return { documents: await documents.list(parseId(id, "Job")) };
  });

  app.get("/api/career/documents/:id/file", async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = await documents.getFile(parseId(id, "Document"));
    return reply
      .header("Content-Type", file.mimeType)
      .header("Content-Disposition", `attachment; filename="${file.filename}"`)
      .header("Cache-Control", "private, no-store")
      .send(file.bytes);
  });
}
