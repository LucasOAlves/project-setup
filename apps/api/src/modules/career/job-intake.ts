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
import type { JobExplainer } from "./job-explanation.js";

// Recorded on each evaluation so a verdict can be traced to the rule set that produced it.
export const ELIGIBILITY_RULES_VERSION = "eligibility-rules@2";

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
export type EvaluationSettings = {
  matchPreferences: MatchPreferences;
  // A job is shortlisted for an explanation from this match score up (JOB-012).
  explanationMinScore: number;
  // At most this many explanations per UTC day, the model-cost limit (spec criterion 12).
  explanationDailyLimit: number;
};

export const DEFAULT_EVALUATION_SETTINGS: EvaluationSettings = {
  matchPreferences: DEFAULT_MATCH_PREFERENCES,
  explanationMinScore: 60,
  explanationDailyLimit: 25,
};

export function evaluationSettingsFromEnv(env: {
  MATCH_TARGET_USD_MONTHLY: number;
  MATCH_TARGET_ROLES?: string[];
  EXPLANATION_MIN_SCORE: number;
  EXPLANATION_DAILY_LIMIT: number;
}): EvaluationSettings {
  const roles = env.MATCH_TARGET_ROLES ?? [];
  return {
    matchPreferences: {
      ...DEFAULT_MATCH_PREFERENCES,
      targetUsdMonthly: env.MATCH_TARGET_USD_MONTHLY,
      targetRoleKeywords: roles.length > 0 ? roles : DEFAULT_MATCH_PREFERENCES.targetRoleKeywords,
    },
    explanationMinScore: env.EXPLANATION_MIN_SCORE,
    explanationDailyLimit: env.EXPLANATION_DAILY_LIMIT,
  };
}

export type ExplanationStatus =
  | "EXPLAINED"
  | "NOT_SHORTLISTED"
  | "DAILY_LIMIT_REACHED"
  | "DISABLED"
  | "FAILED";

export type EvaluateOptions = {
  now?: Date;
  explainer?: JobExplainer | null;
  // "throw" lets a queue retry a failed model call; "skip" stores the evaluation without an
  // explanation (the API, and a worker job on its last attempt).
  onExplanationFailure?: "throw" | "skip";
};

export class JobIntake {
  constructor(
    private readonly repo: CareerRepository,
    private readonly settings: EvaluationSettings = DEFAULT_EVALUATION_SETTINGS,
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

  // A posting from one company's own board (board import and the watchlist): the company is
  // already known, so nothing is created on the fly.
  async importBoardPosting(
    source: string,
    posting: NormalizedJobPosting,
    company: { id: string; name: string },
  ): Promise<IntakeOutcome> {
    const existing = await this.repo.getJobByExternalId(source, posting.externalId);
    if (existing) {
      return { job: existing, outcome: "ALREADY_IMPORTED" };
    }
    const { fields, dedupe } = prepareImportedJob(source, posting, company.name);
    const duplicate = await this.repo.findJobByProvenance(dedupe);
    if (duplicate) {
      return { job: duplicate, outcome: "DUPLICATE" };
    }
    const job = await this.repo.createImportedJob({ companyId: company.id, ...fields });
    return { job, outcome: "CREATED" };
  }

  // ANALYZE-level per ADR-012: deterministic rules, no model call. Each run appends a
  // job_evaluations row, so earlier verdicts stay inspectable. Rules read the source's own
  // text (rawDescription) when present, not a description the user may have edited.
  async evaluateEligibility(job: JobRow): Promise<JobEvaluationRow> {
    return (await this.evaluateJob(job, null)).evaluation;
  }

  // Eligibility, then matching v2 (JOB-011) for jobs the rules did not exclude, hard
  // exclusions before ranking (spec A03). A job scoring at least explanationMinScore is
  // shortlisted and explained (JOB-012), within the daily limit. Without a saved profile
  // there is nothing to match against, so only the eligibility verdict is recorded.
  async evaluateJob(
    job: JobRow,
    profile: MatchProfile | null,
    options: EvaluateOptions = {},
  ): Promise<{ evaluation: JobEvaluationRow; explanation: ExplanationStatus }> {
    const now = options.now ?? new Date();
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
            eligibilitySupported: eligibility.reasons.some((reason) => reason.effect === "SUPPORTS"),
            preferences: this.settings.matchPreferences,
            now,
          })
        : null;

    let status: ExplanationStatus = "NOT_SHORTLISTED";
    let explained: Awaited<ReturnType<JobExplainer["explain"]>> | null = null;
    if (profile && match && match.score >= this.settings.explanationMinScore) {
      if (!options.explainer) {
        status = "DISABLED";
      } else if ((await this.repo.countExplanationsSince(startOfUtcDay(now))) >= this.settings.explanationDailyLimit) {
        status = "DAILY_LIMIT_REACHED";
      } else {
        try {
          explained = await options.explainer.explain({
            job: { title: job.title, location: job.location, description },
            profile,
            eligibility,
            match,
          });
          status = "EXPLAINED";
        } catch (error) {
          if (options.onExplanationFailure !== "skip") throw error;
          status = "FAILED";
        }
      }
    }

    const versions = [ELIGIBILITY_RULES_VERSION];
    if (match) versions.push(MATCHING_VERSION);
    if (explained) versions.push(explained.model);

    const evaluation = await this.repo.insertJobEvaluation({
      jobId: job.id,
      profileVersion: await this.repo.getProfileVersion(),
      eligibility: eligibility.status,
      eligibilityReasons: eligibility.reasons,
      modelVersion: versions.join("+"),
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
      ...(explained && {
        explanation: explained.explanation,
        evidence: explained.evidence,
        promptVersion: explained.promptVersion,
        inputTokens: explained.inputTokens,
        outputTokens: explained.outputTokens,
      }),
    });
    return { evaluation, explanation: status };
  }
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
