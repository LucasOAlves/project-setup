import type { CompanyInput, CompanyPublic, JobInput, JobPatchInput, JobPublic } from "@studio/shared";
import { notFound, validationError } from "../../app-error.js";
import type { CareerRepository, CompanyRow, JobRow } from "./career-repository.js";

const APPLIED_OR_LATER = new Set<string>([
  "APPLIED",
  "RECRUITER_CONTACTED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL_INTERVIEW",
  "FINAL_INTERVIEW",
  "OFFER",
]);

export class CareerService {
  constructor(private readonly repo: CareerRepository) {}

  async listCompanies(): Promise<CompanyPublic[]> {
    const rows = await this.repo.listCompanies();
    return rows.map((row) => this.companyToPublic(row));
  }

  async createCompany(input: CompanyInput): Promise<CompanyPublic> {
    const row = await this.repo.createCompany(input);
    return this.companyToPublic(row);
  }

  async listJobs(): Promise<JobPublic[]> {
    const rows = await this.repo.listJobs();
    return rows.map((row) => this.jobToPublic(row));
  }

  async createJob(input: JobInput): Promise<JobPublic> {
    const company = await this.repo.getCompany(input.companyId);
    if (!company) {
      throw validationError("Add the company before adding a job for it.");
    }
    const row = await this.repo.createJob(input);
    return this.jobToPublic(row);
  }

  async updateJobStatus(id: string, status: string): Promise<JobPublic> {
    const existing = await this.repo.getJob(id);
    if (!existing) {
      throw notFound("That job does not exist.");
    }

    // Mirrors PostService.updateTracking's publishedAt stamping: appliedAt is stamped the
    // first time status reaches APPLIED-or-later, and cleared if the job moves back to an
    // earlier, pre-application stage (e.g. a status set by mistake).
    const appliedAtPatch = APPLIED_OR_LATER.has(status)
      ? { appliedAt: existing.appliedAt ?? new Date() }
      : { appliedAt: null };

    const row = await this.repo.updateJobStatus(id, { status, ...appliedAtPatch });
    if (!row) {
      throw notFound("That job does not exist.");
    }
    return this.jobToPublic(row);
  }

  async patchJob(id: string, patch: JobPatchInput): Promise<JobPublic> {
    const row = await this.repo.patchJob(id, patch);
    if (!row) {
      throw notFound("That job does not exist.");
    }
    return this.jobToPublic(row);
  }

  async removeJob(id: string): Promise<void> {
    await this.repo.deleteJob(id);
  }

  private companyToPublic(row: CompanyRow): CompanyPublic {
    return {
      id: row.id,
      name: row.name,
      website: row.website,
      linkedinUrl: row.linkedinUrl,
      industry: row.industry,
      size: row.size,
      locations: row.locations,
      careerPageUrl: row.careerPageUrl,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private jobToPublic(row: JobRow): JobPublic {
    return {
      id: row.id,
      companyId: row.companyId,
      source: row.source as JobPublic["source"],
      externalId: row.externalId,
      title: row.title,
      url: row.url,
      location: row.location,
      workplaceType: row.workplaceType as JobPublic["workplaceType"],
      employmentType: row.employmentType as JobPublic["employmentType"],
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      salaryCurrency: row.salaryCurrency,
      description: row.description,
      requirements: row.requirements,
      preferredQualifications: row.preferredQualifications,
      technologies: row.technologies,
      seniority: row.seniority,
      status: row.status as JobPublic["status"],
      fitScore: row.fitScore,
      discoveredAt: row.discoveredAt.toISOString(),
      appliedAt: row.appliedAt?.toISOString() ?? null,
      notes: row.notes,
      nextAction: row.nextAction,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
