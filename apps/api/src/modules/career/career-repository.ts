import { randomUUID } from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import type { CompanyInput, JobInput, JobPatchInput, RecruiterInput, RecruiterPatchInput } from "@studio/shared";
import type { Database } from "../../db/client.js";
import type { DedupeKeys, ImportedJobFields } from "./job-import.js";
import { companies, jobEvaluations, jobStatusEvents, jobs, profiles, recruiters } from "../../db/schema.js";

export type CompanyRow = typeof companies.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type JobEvaluationRow = typeof jobEvaluations.$inferSelect;
export type RecruiterRow = typeof recruiters.$inferSelect;
export type JobStatusEventRow = typeof jobStatusEvents.$inferSelect;

export class CareerRepository {
  constructor(private readonly db: Database) {}

  async listCompanies(): Promise<CompanyRow[]> {
    return this.db.select().from(companies).orderBy(desc(companies.createdAt));
  }

  async getCompany(id: string): Promise<CompanyRow | null> {
    const [row] = await this.db.select().from(companies).where(eq(companies.id, id)).limit(1);
    return row ?? null;
  }

  // Case-insensitive match, in application code rather than SQL — the company list is small
  // (one workspace's own tracked companies), and this avoids depending on a dialect-specific
  // operator this drizzle-orm version doesn't export, the same pragmatic tradeoff
  // hasActiveJobAtCompany already makes just below.
  async findCompanyByName(name: string): Promise<CompanyRow | null> {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return null;
    const rows = await this.db.select().from(companies);
    return rows.find((row) => row.name.trim().toLowerCase() === normalized) ?? null;
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
    await this.recordJobStatusEvent(row.id, row.status);
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
    if (row) {
      await this.recordJobStatusEvent(row.id, row.status);
    }
    return row ?? null;
  }

  async getJobByExternalId(source: string, externalId: string): Promise<JobRow | null> {
    const [row] = await this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.source, source), eq(jobs.externalId, externalId)))
      .limit(1);
    return row ?? null;
  }

  // Cross-source duplicate lookup (JOB-006): the same posting seen through another source
  // shares its canonical URL, or, when the description is substantial, its content hash.
  async findJobByProvenance(keys: DedupeKeys): Promise<JobRow | null> {
    const conditions = [];
    if (keys.canonicalUrl) conditions.push(eq(jobs.canonicalUrl, keys.canonicalUrl));
    if (keys.contentHash) conditions.push(eq(jobs.contentHash, keys.contentHash));
    if (conditions.length === 0) return null;
    const [row] = await this.db
      .select()
      .from(jobs)
      .where(or(...conditions))
      .limit(1);
    return row ?? null;
  }

  async createImportedJob(input: ImportedJobFields & { companyId: string }): Promise<JobRow> {
    const [row] = await this.db
      .insert(jobs)
      .values({
        id: randomUUID(),
        ...input,
      })
      .returning();
    if (!row) {
      throw new Error("job insert failed");
    }
    await this.recordJobStatusEvent(row.id, row.status);
    return row;
  }

  // The single workspace profile's version (JOB-010); 1 before any profile is saved.
  async getProfileVersion(): Promise<number> {
    const [row] = await this.db.select({ version: profiles.version }).from(profiles).limit(1);
    return row?.version ?? 1;
  }

  async insertJobEvaluation(input: {
    jobId: string;
    profileVersion: number;
    eligibility: string;
    eligibilityReasons: unknown[];
    modelVersion: string;
    score?: number | null;
    confidence?: number | null;
    scoreBreakdown?: Record<string, unknown>;
  }): Promise<JobEvaluationRow> {
    const [row] = await this.db
      .insert(jobEvaluations)
      .values({ id: randomUUID(), ...input })
      .returning();
    if (!row) {
      throw new Error("job evaluation insert failed");
    }
    return row;
  }

  async getLatestJobEvaluation(jobId: string): Promise<JobEvaluationRow | null> {
    const [row] = await this.db
      .select()
      .from(jobEvaluations)
      .where(eq(jobEvaluations.jobId, jobId))
      .orderBy(desc(jobEvaluations.createdAt))
      .limit(1);
    return row ?? null;
  }

  private async recordJobStatusEvent(jobId: string, status: string): Promise<void> {
    await this.db.insert(jobStatusEvents).values({ id: randomUUID(), jobId, status });
  }

  // For analytics: every status a job has ever passed through, not just its current one —
  // Job.status alone can't tell you "did this job ever reach interview stage" once it later
  // moves to REJECTED.
  async listJobStatusEvents(): Promise<JobStatusEventRow[]> {
    return this.db.select().from(jobStatusEvents);
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

  async listRecruiters(): Promise<RecruiterRow[]> {
    return this.db.select().from(recruiters).orderBy(desc(recruiters.createdAt));
  }

  async getRecruiter(id: string): Promise<RecruiterRow | null> {
    const [row] = await this.db.select().from(recruiters).where(eq(recruiters.id, id)).limit(1);
    return row ?? null;
  }

  async hasActiveJobAtCompany(companyId: string): Promise<boolean> {
    const rows = await this.db.select().from(jobs).where(eq(jobs.companyId, companyId));
    return rows.some((row) => row.status !== "REJECTED" && row.status !== "WITHDRAWN");
  }

  async createRecruiter(input: RecruiterInput): Promise<RecruiterRow> {
    const [row] = await this.db
      .insert(recruiters)
      .values({
        id: randomUUID(),
        companyId: input.companyId,
        relatedJobId: input.relatedJobId,
        name: input.name,
        role: input.role,
        linkedinUrl: input.linkedinUrl,
        notes: input.notes,
        nextAction: input.nextAction,
      })
      .returning();
    if (!row) {
      throw new Error("recruiter insert failed");
    }
    return row;
  }

  async updateRecruiterConnectionStatus(
    id: string,
    connectionStatus: string,
  ): Promise<RecruiterRow | null> {
    const [row] = await this.db
      .update(recruiters)
      .set({ connectionStatus, updatedAt: new Date() })
      .where(eq(recruiters.id, id))
      .returning();
    return row ?? null;
  }

  async patchRecruiter(id: string, patch: RecruiterPatchInput): Promise<RecruiterRow | null> {
    const stampInteraction = patch.notes !== undefined;
    const [row] = await this.db
      .update(recruiters)
      .set({
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.nextAction !== undefined ? { nextAction: patch.nextAction } : {}),
        ...(stampInteraction ? { lastInteractionAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(recruiters.id, id))
      .returning();
    return row ?? null;
  }

  async setRecruiterRelevanceScore(id: string, relevanceScore: number): Promise<RecruiterRow | null> {
    const [row] = await this.db
      .update(recruiters)
      .set({ relevanceScore, updatedAt: new Date() })
      .where(eq(recruiters.id, id))
      .returning();
    return row ?? null;
  }

  async deleteRecruiter(id: string): Promise<void> {
    await this.db.delete(recruiters).where(eq(recruiters.id, id));
  }
}
