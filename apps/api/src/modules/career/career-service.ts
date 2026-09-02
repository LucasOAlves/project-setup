import type {
  CareerAnalytics,
  CompanyInput,
  CompanyPublic,
  JobFitResult,
  JobInput,
  JobPatchInput,
  JobPublic,
  JobStatus,
  OutreachMessage,
  RecruiterInput,
  RecruiterPatchInput,
  RecruiterPublic,
  ResumeTailoringPlan,
  TextProviderName,
} from "@studio/shared";
import { outreachMessageSchema, resumeTailoringPlanSchema } from "@studio/shared";
import { malformedAiOutput, notFound, validationError } from "../../app-error.js";
import { parseJsonObject } from "../ai/parse-json.js";
import {
  OUTREACH_MESSAGE_PROMPT_VERSION,
  OUTREACH_MESSAGE_SYSTEM_PROMPT,
  buildOutreachMessageUserPrompt,
} from "../ai/prompts/outreach-message.v1.js";
import {
  RESUME_TAILORING_PROMPT_VERSION,
  RESUME_TAILORING_SYSTEM_PROMPT,
  buildResumeTailoringUserPrompt,
} from "../ai/prompts/resume-tailoring.v1.js";
import { resolveTextProvider } from "../ai/resolve-provider.js";
import type { TextGenerationProvider } from "../ai/text-generation-provider.js";
import { buildResumePdf } from "../profile/resume-pdf.js";
import type { ProfileService } from "../profile/profile-service.js";
import { computeCareerAnalytics } from "./career-analytics.js";
import type { CareerRepository, CompanyRow, JobRow, RecruiterRow } from "./career-repository.js";
import type { JobProvider } from "./job-provider.js";
import { computeJobFit } from "./job-fit.js";
import { scoreRecruiterRelevance } from "./recruiter-scoring.js";
import { applyTailoringPlan, groundTailoringPlan } from "./resume-tailoring.js";

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
  constructor(
    private readonly repo: CareerRepository,
    private readonly profiles: ProfileService,
    private readonly textProviders: Record<TextProviderName, TextGenerationProvider>,
    private readonly defaultTextProvider: TextProviderName,
    private readonly greenhouseProvider: JobProvider,
  ) {}

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

  // SEARCH-level per ADR-012: pulling public job postings is read-only and non-consequential,
  // so it runs automatically, no approval step. Postings already imported (matched by
  // source + externalId) are skipped, never re-created or overwritten — a re-sync only adds
  // what's new.
  async importFromGreenhouse(
    companyId: string,
    boardToken: string,
  ): Promise<{ imported: JobPublic[]; skipped: number }> {
    const company = await this.repo.getCompany(companyId);
    if (!company) {
      throw notFound("That company does not exist.");
    }

    const postings = await this.greenhouseProvider.listJobs(boardToken);
    const imported: JobPublic[] = [];
    let skipped = 0;
    for (const posting of postings) {
      const existing = await this.repo.getJobByExternalId("greenhouse", posting.externalId);
      if (existing) {
        skipped += 1;
        continue;
      }
      const row = await this.repo.createImportedJob({
        companyId,
        source: "greenhouse",
        externalId: posting.externalId,
        title: posting.title,
        url: posting.url,
        location: posting.location,
        description: posting.description,
      });
      imported.push(this.jobToPublic(row));
    }
    return { imported, skipped };
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

  async generateResumeTailoringPlan(
    id: string,
    provider?: TextProviderName,
  ): Promise<ResumeTailoringPlan> {
    const jobRow = await this.repo.getJob(id);
    if (!jobRow) {
      throw notFound("That job does not exist.");
    }
    const profile = await this.profiles.getProfile();
    if (!profile) {
      throw notFound("Save a professional profile before tailoring a résumé.");
    }

    const job = this.jobToPublic(jobRow);
    const prompt = {
      purpose: RESUME_TAILORING_PROMPT_VERSION,
      system: RESUME_TAILORING_SYSTEM_PROMPT,
      user: buildResumeTailoringUserPrompt(job, profile),
    };
    const text = resolveTextProvider(this.textProviders, this.defaultTextProvider, provider);
    const generated = await text.generateText(prompt);
    const parsed = resumeTailoringPlanSchema.safeParse(parseJsonObject(generated.text));
    if (!parsed.success) {
      throw malformedAiOutput(
        "The model returned a résumé tailoring plan that did not match the required structure.",
      );
    }

    return groundTailoringPlan(parsed.data, profile);
  }

  async exportTailoredResume(id: string, plan: ResumeTailoringPlan): Promise<Buffer> {
    const jobRow = await this.repo.getJob(id);
    if (!jobRow) {
      throw notFound("That job does not exist.");
    }
    const profile = await this.profiles.getProfile();
    if (!profile) {
      throw notFound("Save a professional profile before exporting a résumé.");
    }

    const parsed = resumeTailoringPlanSchema.safeParse(plan);
    if (!parsed.success) {
      throw validationError("The résumé tailoring plan payload is invalid.");
    }

    // Never trust the client's copy of the plan blindly — re-ground it against the current
    // profile the same way the plan was grounded when it was first generated, in case the
    // profile changed since, or the payload was tampered with.
    const grounded = groundTailoringPlan(parsed.data, profile);
    const tailoredProfile = applyTailoringPlan(profile, grounded);
    return buildResumePdf(tailoredProfile);
  }

  async computeFit(id: string): Promise<JobFitResult> {
    const jobRow = await this.repo.getJob(id);
    if (!jobRow) {
      throw notFound("That job does not exist.");
    }
    const profile = await this.profiles.getProfile();
    if (!profile) {
      throw notFound("Save a professional profile before scoring job fit.");
    }

    const result = computeJobFit(this.jobToPublic(jobRow), profile);
    await this.repo.setFitScore(id, result.overall);
    return result;
  }

  async listRecruiters(): Promise<RecruiterPublic[]> {
    const rows = await this.repo.listRecruiters();
    return rows.map((row) => this.recruiterToPublic(row));
  }

  async createRecruiter(input: RecruiterInput): Promise<RecruiterPublic> {
    const company = await this.repo.getCompany(input.companyId);
    if (!company) {
      throw validationError("Add the company before adding a recruiter for it.");
    }
    if (input.relatedJobId) {
      const job = await this.repo.getJob(input.relatedJobId);
      if (!job) {
        throw validationError("The related job does not exist.");
      }
    }
    const row = await this.repo.createRecruiter(input);
    return this.recruiterToPublic(row);
  }

  async updateRecruiterConnectionStatus(
    id: string,
    connectionStatus: string,
  ): Promise<RecruiterPublic> {
    const row = await this.repo.updateRecruiterConnectionStatus(id, connectionStatus);
    if (!row) {
      throw notFound("That recruiter does not exist.");
    }
    return this.recruiterToPublic(row);
  }

  async patchRecruiter(id: string, patch: RecruiterPatchInput): Promise<RecruiterPublic> {
    const row = await this.repo.patchRecruiter(id, patch);
    if (!row) {
      throw notFound("That recruiter does not exist.");
    }
    return this.recruiterToPublic(row);
  }

  async removeRecruiter(id: string): Promise<void> {
    await this.repo.deleteRecruiter(id);
  }

  async scoreRecruiter(id: string): Promise<RecruiterPublic> {
    const recruiterRow = await this.repo.getRecruiter(id);
    if (!recruiterRow) {
      throw notFound("That recruiter does not exist.");
    }
    const companyHasTrackedJob = await this.repo.hasActiveJobAtCompany(recruiterRow.companyId);
    const score = scoreRecruiterRelevance({
      role: recruiterRow.role,
      companyHasTrackedJob,
      linkedToJob: recruiterRow.relatedJobId !== null,
    });
    const row = await this.repo.setRecruiterRelevanceScore(id, score);
    if (!row) {
      throw notFound("That recruiter does not exist.");
    }
    return this.recruiterToPublic(row);
  }

  async generateOutreachMessage(
    id: string,
    provider?: TextProviderName,
  ): Promise<OutreachMessage> {
    const recruiterRow = await this.repo.getRecruiter(id);
    if (!recruiterRow) {
      throw notFound("That recruiter does not exist.");
    }
    const [company, profile, job] = await Promise.all([
      this.repo.getCompany(recruiterRow.companyId),
      this.profiles.getProfile(),
      recruiterRow.relatedJobId ? this.repo.getJob(recruiterRow.relatedJobId) : null,
    ]);
    if (!profile) {
      throw notFound("Save a professional profile before preparing outreach.");
    }

    const prompt = {
      purpose: OUTREACH_MESSAGE_PROMPT_VERSION,
      system: OUTREACH_MESSAGE_SYSTEM_PROMPT,
      user: buildOutreachMessageUserPrompt({
        recruiterName: recruiterRow.name,
        recruiterRole: recruiterRow.role,
        companyName: company?.name ?? "",
        job: job ? this.jobToPublic(job) : null,
        profile,
      }),
    };
    const text = resolveTextProvider(this.textProviders, this.defaultTextProvider, provider);
    const generated = await text.generateText(prompt);
    const parsed = outreachMessageSchema.safeParse(parseJsonObject(generated.text));
    if (!parsed.success) {
      throw malformedAiOutput(
        "The model returned an outreach message that did not match the required structure.",
      );
    }
    return parsed.data;
  }

  async getAnalytics(): Promise<CareerAnalytics> {
    const [jobRows, recruiterRows, statusEventRows, profile] = await Promise.all([
      this.repo.listJobs(),
      this.repo.listRecruiters(),
      this.repo.listJobStatusEvents(),
      this.profiles.getProfile(),
    ]);

    const jobs = jobRows.map((row) => this.jobToPublic(row));
    const recruiters = recruiterRows.map((row) => this.recruiterToPublic(row));

    const statusEventsByJobId = new Map<string, Set<JobStatus>>();
    for (const event of statusEventRows) {
      const set = statusEventsByJobId.get(event.jobId) ?? new Set<JobStatus>();
      set.add(event.status as JobStatus);
      statusEventsByJobId.set(event.jobId, set);
    }

    // Gaps aren't persisted (only the overall fitScore is — see job-fit.ts's own docs) so
    // they're recomputed here the same cheap, deterministic way the UI does on demand.
    const gapsByJobId = new Map<string, string[]>();
    if (profile) {
      for (const job of jobs) {
        if (job.fitScore !== null) {
          gapsByJobId.set(job.id, computeJobFit(job, profile).gaps);
        }
      }
    }

    return computeCareerAnalytics({ jobs, recruiters, statusEventsByJobId, gapsByJobId });
  }

  private recruiterToPublic(row: RecruiterRow): RecruiterPublic {
    return {
      id: row.id,
      companyId: row.companyId,
      relatedJobId: row.relatedJobId,
      name: row.name,
      role: row.role,
      linkedinUrl: row.linkedinUrl,
      connectionStatus: row.connectionStatus as RecruiterPublic["connectionStatus"],
      relevanceScore: row.relevanceScore,
      notes: row.notes,
      nextAction: row.nextAction,
      lastInteractionAt: row.lastInteractionAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
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
