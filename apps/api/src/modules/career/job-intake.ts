import type { CareerRepository, JobEvaluationRow, JobRow } from "./career-repository.js";
import { BRAZIL_REMOTE_CANDIDATE, evaluateEligibility } from "./job-eligibility.js";
import { prepareImportedJob, type JobNormalizedData } from "./job-import.js";
import {
  DEFAULT_MATCH_PREFERENCES,
  matchJob,
  MATCHING_VERSION,
  type MatchJob,
  type MatchPreferences,
  type MatchProfile,
} from "./job-matching.js";
import type { NormalizedJobPosting } from "./job-provider.js";

// Recorded on each evaluation so a verdict can be traced to the rule set that produced it.
export const ELIGIBILITY_RULES_VERSION = "eligibility-rules@1";

export type IntakePosting = Omit<NormalizedJobPosting, "companyNameFromSource" | "updatedAt"> & {
  companyName: string;
};

export type IntakeOutcome = {
  job: JobRow;
  // CREATED: new row. ALREADY_IMPORTED: same source + external id seen before.
  // DUPLICATE: the same role already tracked through another source (JOB-006).
  outcome: "CREATED" | "ALREADY_IMPORTED" | "DUPLICATE";
};

// The one path by which a posting from a search source becomes a tracked job, shared by the
// user's "Add to tracker" (CareerService) and scheduled discovery in the worker, so both
// apply the same normalization, dedupe and eligibility rules.
export class JobIntake {
  constructor(
    private readonly repo: CareerRepository,
    private readonly matchPreferences: MatchPreferences = DEFAULT_MATCH_PREFERENCES,
  ) {}

  async importSearchPosting(source: string, posting: IntakePosting): Promise<IntakeOutcome> {
    const existing = await this.repo.getJobByExternalId(source, posting.externalId);
    if (existing) {
      return { job: existing, outcome: "ALREADY_IMPORTED" };
    }

    const companyName = posting.companyName.trim() || "Unknown company";
    const { fields, dedupe } = prepareImportedJob(source, posting, companyName);
    const duplicate = await this.repo.findJobByProvenance(dedupe);
    if (duplicate) {
      return { job: duplicate, outcome: "DUPLICATE" };
    }

    let company = await this.repo.findCompanyByName(companyName);
    if (!company) {
      company = await this.repo.createCompany({
        name: companyName,
        website: "",
        linkedinUrl: "",
        industry: "",
        size: "",
        locations: [],
        careerPageUrl: "",
        notes: "",
      });
    }

    const job = await this.repo.createImportedJob({ companyId: company.id, ...fields });
    return { job, outcome: "CREATED" };
  }

  // ANALYZE-level per ADR-012: deterministic rules, no model call. Each run appends a
  // job_evaluations row, so earlier verdicts stay inspectable. Rules read the source's own
  // text (rawDescription) when present, not a description the user may have edited.
  async evaluateEligibility(job: JobRow): Promise<JobEvaluationRow> {
    return this.evaluateJob(job, null);
  }

  // Eligibility, then matching v2 (JOB-011) for jobs the rules did not exclude: hard
  // exclusions are applied before ranking (spec A03). Without a saved profile there is
  // nothing to match against, so only the eligibility verdict is recorded.
  async evaluateJob(job: JobRow, profile: MatchProfile | null, now = new Date()): Promise<JobEvaluationRow> {
    const description = job.rawDescription || job.description;
    const eligibility = evaluateEligibility(
      { title: job.title, location: job.location, description },
      BRAZIL_REMOTE_CANDIDATE,
    );
    const match =
      profile && eligibility.status !== "EXCLUDED"
        ? matchJob({
            job: toMatchJob(job, description),
            profile,
            eligibility: eligibility.status,
            preferences: this.matchPreferences,
            now,
          })
        : null;

    return this.repo.insertJobEvaluation({
      jobId: job.id,
      profileVersion: await this.repo.getProfileVersion(),
      eligibility: eligibility.status,
      eligibilityReasons: eligibility.reasons,
      modelVersion: match ? `${ELIGIBILITY_RULES_VERSION}+${MATCHING_VERSION}` : ELIGIBILITY_RULES_VERSION,
      ...(match && {
        score: match.score,
        confidence: match.confidence,
        scoreBreakdown: {
          version: match.version,
          dimensions: match.dimensions,
          matchedSkills: match.matchedSkills,
          missingSkills: match.missingSkills,
          flags: match.flags,
        },
      }),
    });
  }
}

function toMatchJob(job: JobRow, description: string): MatchJob {
  const normalized = (job.normalizedData ?? {}) as Partial<JobNormalizedData>;
  return {
    title: job.title,
    description,
    seniority: job.seniority,
    technologies: job.technologies,
    requirements: job.requirements,
    preferredQualifications: job.preferredQualifications,
    employmentType: (job.employmentType as MatchJob["employmentType"]) ?? normalized.employmentType ?? null,
    // Jobs imported before migration 0018 have no normalized salary: compensation is unknown.
    salary: normalized.salary ?? null,
    postedAt: job.sourcePostedAt ?? null,
  };
}
