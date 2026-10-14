import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { notFound } from "../../app-error.js";
import { textProviderSchema } from "@studio/shared";
import type { ApplicationDocumentService } from "./application-document-service.js";
import type { TailoredCvGenerator } from "./tailored-cv-generator.js";

const idSchema = z.string().uuid();

function parseId(raw: unknown, what: string): string {
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) throw notFound(`${what} not found.`);
  return parsed.data;
}

// Application documents (Milestone 2). Documents are created by the generators for each
// document type; these routes list a job's versions and download a version's file.
export async function registerDocumentRoutes(
  app: FastifyInstance,
  documents: ApplicationDocumentService,
  cv: Pick<TailoredCvGenerator, "generate">,
): Promise<void> {
  app.get("/api/career/jobs/:id/documents", async (request) => {
    const { id } = request.params as { id: string };
    return { documents: await documents.list(parseId(id, "Job")) };
  });

  // Generates a tailored CV; returns 201 with a new version, or 200 when it matches the latest.
  app.post("/api/career/jobs/:id/documents/cv", async (request, reply) => {
    const { id } = request.params as { id: string };
    const provider = textProviderSchema.safeParse((request.body as { provider?: unknown } | undefined)?.provider);
    const result = await cv.generate(parseId(id, "Job"), provider.success ? provider.data : undefined);
    return reply.code(result.created ? 201 : 200).send(result);
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
