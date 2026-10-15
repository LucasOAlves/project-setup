import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { notFound } from "../../app-error.js";
import { textProviderSchema } from "@studio/shared";
import type { ApplicationDocumentService } from "./application-document-service.js";
import type { ApplicationAnswersGenerator } from "./application-answers-generator.js";
import type { CoverLetterGenerator } from "./cover-letter-generator.js";
import type { TailoredCvGenerator } from "./tailored-cv-generator.js";

const idSchema = z.string().uuid();

function parseId(raw: unknown, what: string): string {
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) throw notFound(`${what} not found.`);
  return parsed.data;
}

function providerFrom(body: unknown) {
  const provider = textProviderSchema.safeParse((body as { provider?: unknown } | undefined)?.provider);
  return provider.success ? provider.data : undefined;
}

// Application documents (Milestone 2). Documents are created by the generators for each
// document type; these routes list a job's versions and download a version's file.
export async function registerDocumentRoutes(
  app: FastifyInstance,
  documents: ApplicationDocumentService,
  generators: {
    cv: Pick<TailoredCvGenerator, "generate">;
    coverLetters: Pick<CoverLetterGenerator, "generate" | "saveEdit">;
    answers: Pick<ApplicationAnswersGenerator, "generate" | "saveEdit">;
  },
): Promise<void> {
  app.get("/api/career/jobs/:id/documents", async (request) => {
    const { id } = request.params as { id: string };
    return { documents: await documents.list(parseId(id, "Job")) };
  });

  // Generates a tailored CV; returns 201 with a new version, or 200 when it matches the latest.
  app.post("/api/career/jobs/:id/documents/cv", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await generators.cv.generate(parseId(id, "Job"), providerFrom(request.body));
    return reply.code(result.created ? 201 : 200).send(result);
  });

  // Generated only when asked for.
  app.post("/api/career/jobs/:id/documents/cover-letter", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await generators.coverLetters.generate(parseId(id, "Job"), providerFrom(request.body));
    return reply.code(result.created ? 201 : 200).send(result);
  });

  // The user's edited letter, saved as a new EDITED version.
  app.post("/api/career/jobs/:id/documents/cover-letter/edits", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await generators.coverLetters.saveEdit(parseId(id, "Job"), request.body);
    return reply.code(result.created ? 201 : 200).send(result);
  });

  app.post("/api/career/jobs/:id/documents/answers", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await generators.answers.generate(parseId(id, "Job"), providerFrom(request.body));
    return reply.code(result.created ? 201 : 200).send(result);
  });

  app.post("/api/career/jobs/:id/documents/answers/edits", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await generators.answers.saveEdit(parseId(id, "Job"), request.body);
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
