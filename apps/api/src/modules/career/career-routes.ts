import {
  companyInputSchema,
  jobInputSchema,
  jobPatchInputSchema,
  jobStatusInputSchema,
} from "@studio/shared";
import type { FastifyInstance } from "fastify";
import { validationError } from "../../app-error.js";
import type { CareerService } from "./career-service.js";

export async function registerCareerRoutes(
  app: FastifyInstance,
  service: CareerService,
): Promise<void> {
  app.get("/api/career/companies", async () => {
    const companies = await service.listCompanies();
    return { companies };
  });

  app.post("/api/career/companies", async (request, reply) => {
    const parsed = companyInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Give the company at least a name.");
    }
    const company = await service.createCompany(parsed.data);
    return reply.code(201).send({ company });
  });

  app.get("/api/career/jobs", async () => {
    const jobs = await service.listJobs();
    return { jobs };
  });

  app.post("/api/career/jobs", async (request, reply) => {
    const parsed = jobInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Give the job a company and a title.");
    }
    const job = await service.createJob(parsed.data);
    return reply.code(201).send({ job });
  });

  app.patch("/api/career/jobs/:id/status", async (request) => {
    const { id } = request.params as { id: string };
    const parsed = jobStatusInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Invalid status.");
    }
    const job = await service.updateJobStatus(id, parsed.data.status);
    return { job };
  });

  app.patch("/api/career/jobs/:id", async (request) => {
    const { id } = request.params as { id: string };
    const parsed = jobPatchInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Invalid job update.");
    }
    const job = await service.patchJob(id, parsed.data);
    return { job };
  });

  app.delete("/api/career/jobs/:id", async (request) => {
    const { id } = request.params as { id: string };
    await service.removeJob(id);
    const jobs = await service.listJobs();
    return { jobs };
  });
}
