import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { CompanyInput, JobInput, JobPatchInput } from "@studio/shared";
import type { Database } from "../../db/client.js";
import { companies, jobs } from "../../db/schema.js";

export type CompanyRow = typeof companies.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;

export class CareerRepository {
  constructor(private readonly db: Database) {}

  async listCompanies(): Promise<CompanyRow[]> {
    return this.db.select().from(companies).orderBy(desc(companies.createdAt));
  }

  async getCompany(id: string): Promise<CompanyRow | null> {
    const [row] = await this.db.select().from(companies).where(eq(companies.id, id)).limit(1);
    return row ?? null;
  }

  async createCompany(input: CompanyInput): Promise<CompanyRow> {
    const [row] = await this.db
      .insert(companies)
      .values({
        id: randomUUID(),
        name: input.name,
        website: input.website,
        linkedinUrl: input.linkedinUrl,
        industry: input.industry,
        size: input.size,
        locations: input.locations,
        careerPageUrl: input.careerPageUrl,
        notes: input.notes,
      })
      .returning();
    if (!row) {
      throw new Error("company insert failed");
    }
    return row;
  }

  async listJobs(): Promise<JobRow[]> {
    return this.db.select().from(jobs).orderBy(desc(jobs.discoveredAt));
  }

  async getJob(id: string): Promise<JobRow | null> {
    const [row] = await this.db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    return row ?? null;
  }

  async createJob(input: JobInput): Promise<JobRow> {
    const [row] = await this.db
      .insert(jobs)
      .values({
        id: randomUUID(),
        companyId: input.companyId,
        source: "manual",
        title: input.title,
        url: input.url,
        location: input.location,
        workplaceType: input.workplaceType,
        employmentType: input.employmentType,
        salaryMin: input.salaryMin,
        salaryMax: input.salaryMax,
        salaryCurrency: input.salaryCurrency,
        description: input.description,
        requirements: input.requirements,
        preferredQualifications: input.preferredQualifications,
        technologies: input.technologies,
        seniority: input.seniority,
        notes: input.notes,
        nextAction: input.nextAction,
      })
      .returning();
    if (!row) {
      throw new Error("job insert failed");
    }
    return row;
  }

  async updateJobStatus(
    id: string,
    patch: { status: string; appliedAt?: Date | null },
  ): Promise<JobRow | null> {
    const [row] = await this.db
      .update(jobs)
      .set({
        status: patch.status,
        ...(patch.appliedAt !== undefined ? { appliedAt: patch.appliedAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, id))
      .returning();
    return row ?? null;
  }

  async patchJob(id: string, patch: JobPatchInput): Promise<JobRow | null> {
    const [row] = await this.db
      .update(jobs)
      .set({
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.nextAction !== undefined ? { nextAction: patch.nextAction } : {}),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, id))
      .returning();
    return row ?? null;
  }

  async deleteJob(id: string): Promise<void> {
    await this.db.delete(jobs).where(eq(jobs.id, id));
  }

  async setFitScore(id: string, fitScore: number): Promise<JobRow | null> {
    const [row] = await this.db
      .update(jobs)
      .set({ fitScore, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    return row ?? null;
  }
}
