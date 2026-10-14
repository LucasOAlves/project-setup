import { z } from "zod";

export const JOB_WORKPLACE_TYPES = ["REMOTE", "HYBRID", "ON_SITE"] as const;
export type JobWorkplaceType = (typeof JOB_WORKPLACE_TYPES)[number];

export const JOB_EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERNSHIP",
  "OTHER",
] as const;
export type JobEmploymentType = (typeof JOB_EMPLOYMENT_TYPES)[number];

// Job.status doubles as the pursuit/application funnel (see ADR-011: Application is not a
// separate table in Slice 1). Order matters only for display; transitions are not enforced
// as a strict state machine, since a real search moves backward too (e.g. REJECTED after
// SCREENING).
export const JOB_STATUSES = [
  "SAVED",
  "SHORTLISTED",
  "PREPARING",
  "APPLIED",
  "RECRUITER_CONTACTED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL_INTERVIEW",
  "FINAL_INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

// Board sources: a per-company job board you import from by giving the company's own board
// token/slug (see ADR-011's update note, and the follow-up note below for the newer three).
export const JOB_BOARD_SOURCES = ["greenhouse", "lever", "ashby", "workable", "smartrecruiters"] as const;
export type JobBoardSource = (typeof JOB_BOARD_SOURCES)[number];

// Search sources: an aggregator you query by keyword — results span many companies, so
// importing one may need to create a new Company on the fly (see CareerService.importSearchResult).
export const JOB_SEARCH_SOURCES = ["remoteok", "arbeitnow", "adzuna", "remotive", "himalayas"] as const;
export type JobSearchSource = (typeof JOB_SEARCH_SOURCES)[number];

export const JOB_SOURCES = [
  "manual",
  "linkedin",
  ...JOB_BOARD_SOURCES,
  ...JOB_SEARCH_SOURCES,
] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

const stringList = (maxItems: number, maxLength: number) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems);

export const companyInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  website: z.string().trim().max(300).default(""),
  linkedinUrl: z.string().trim().max(300).default(""),
  industry: z.string().trim().max(120).default(""),
  size: z.string().trim().max(60).default(""),
  locations: stringList(20, 120).default([]),
  careerPageUrl: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(2000).default(""),
});
export type CompanyInput = z.infer<typeof companyInputSchema>;

export const companyPublicSchema = companyInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CompanyPublic = z.infer<typeof companyPublicSchema>;

export const jobInputSchema = z.object({
  companyId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().max(500).default(""),
  location: z.string().trim().max(160).default(""),
  workplaceType: z.enum(JOB_WORKPLACE_TYPES).nullable().default(null),
  employmentType: z.enum(JOB_EMPLOYMENT_TYPES).nullable().default(null),
  salaryMin: z.number().int().min(0).nullable().default(null),
  salaryMax: z.number().int().min(0).nullable().default(null),
  salaryCurrency: z.string().trim().max(10).default(""),
  description: z.string().trim().max(20000).default(""),
  requirements: stringList(40, 300).default([]),
  preferredQualifications: stringList(40, 300).default([]),
  technologies: stringList(40, 80).default([]),
  seniority: z.string().trim().max(60).default(""),
  notes: z.string().trim().max(4000).default(""),
  nextAction: z.string().trim().max(300).default(""),
});
export type JobInput = z.infer<typeof jobInputSchema>;

export const jobPublicSchema = jobInputSchema.extend({
  id: z.string().uuid(),
  source: z.enum(JOB_SOURCES),
  externalId: z.string(),
  status: z.enum(JOB_STATUSES),
  fitScore: z.number().int().min(0).max(100).nullable(),
  discoveredAt: z.string(),
  appliedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobPublic = z.infer<typeof jobPublicSchema>;

export const boardImportInputSchema = z.object({
  source: z.enum(JOB_BOARD_SOURCES),
  boardToken: z.string().trim().min(1).max(100),
});
export type BoardImportInput = z.infer<typeof boardImportInputSchema>;

export const jobSearchInputSchema = z.object({
  source: z.enum(JOB_SEARCH_SOURCES),
  keywords: z.string().trim().min(1).max(200),
  location: z.string().trim().max(120).optional(),
});
export type JobSearchInput = z.infer<typeof jobSearchInputSchema>;

// A search result is shown to the user before anything is saved — the same draft-review
// posture as everywhere else (ADR-010) — then round-tripped back via jobSearchImportInputSchema
// once they pick one to track, the same "client hands back what it was given, server re-derives
// the rest" shape as the résumé tailoring plan.
export const jobSearchResultSchema = z.object({
  externalId: z.string(),
  title: z.string(),
  url: z.string(),
  location: z.string(),
  description: z.string(),
  companyName: z.string(),
  // Normalization inputs some sources report (JOB-006), round-tripped through the client
  // between search and import.
  salary: z
    .object({
      min: z.number().nullable().optional(),
      max: z.number().nullable().optional(),
      currency: z.string().nullable().optional(),
      period: z.string().nullable().optional(),
      text: z.string().nullable().optional(),
    })
    .optional(),
  employmentType: z.string().nullable().optional(),
  postedAt: z.string().nullable().optional(),
});
export type JobSearchResult = z.infer<typeof jobSearchResultSchema>;

export const jobSearchImportInputSchema = z.object({
  source: z.enum(JOB_SEARCH_SOURCES),
  posting: jobSearchResultSchema,
});
export type JobSearchImportInput = z.infer<typeof jobSearchImportInputSchema>;

export const jobStatusInputSchema = z.object({
  status: z.enum(JOB_STATUSES),
});

export const jobPatchInputSchema = z.object({
  notes: z.string().trim().max(4000).optional(),
  nextAction: z.string().trim().max(300).optional(),
});
export type JobPatchInput = z.infer<typeof jobPatchInputSchema>;

// Job Fit: deterministic, explainable scoring (see .skills/ai-vs-deterministic and the
// content-relevance-scoring precedent). No AI call is involved — every dimension is a rule
// over two structured records (Job, Profile), so the result is exact and reproducible rather
// than a model's opinion.
export const JOB_FIT_RECOMMENDATIONS = ["STRONG_APPLY", "APPLY", "STRETCH", "WEAK_FIT"] as const;
export type JobFitRecommendation = (typeof JOB_FIT_RECOMMENDATIONS)[number];

export const jobFitDimensionsSchema = z.object({
  technical: z.number().int().min(0).max(100),
  seniority: z.number().int().min(0).max(100),
  architecture: z.number().int().min(0).max(100),
  leadership: z.number().int().min(0).max(100),
});
export type JobFitDimensions = z.infer<typeof jobFitDimensionsSchema>;

// Resume tailoring: the model only ever RE-ORDERS existing profile content (which experience
// leads, which skills are emphasized) — it never writes new prose. See
// apps/api/src/modules/career/resume-tailoring.ts for the grounding step that enforces this
// regardless of what the model returns (unknown ids are dropped; anything real the model
// forgot to mention is appended, never silently hidden).
export const resumeTailoringPlanSchema = z.object({
  rationale: z.string().trim().max(600),
  // Deliberately not `.uuid()` — a model that hallucinates an id can return any string shape;
  // the grounding step (resume-tailoring.ts) is what actually enforces membership in the real
  // profile, so the schema only needs to guard size/type, not format.
  experienceOrder: z.array(z.string().min(1).max(100)).max(20),
  topSkillsOrder: z.array(z.string().trim().max(80)).max(30),
  technologiesOrder: z.array(z.string().trim().max(80)).max(50),
});
export type ResumeTailoringPlan = z.infer<typeof resumeTailoringPlanSchema>;

export const jobFitResultSchema = z.object({
  overall: z.number().int().min(0).max(100),
  dimensions: jobFitDimensionsSchema,
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  recommendation: z.enum(JOB_FIT_RECOMMENDATIONS),
});
export type JobFitResult = z.infer<typeof jobFitResultSchema>;

// Networking / recruiter CRM (Slice 4). A Recruiter always belongs to a Company (the CRM
// shape the mission asked for: Company -> Recruiters), and may optionally be tied to one
// specific tracked Job. No separate interaction-log table yet — `notes` is an append-only
// free-text log the same way Job.notes already works, and `lastInteractionAt` is stamped
// automatically whenever notes are saved (see career-service.ts). A discrete interaction
// table is a reasonable future split if that turns out to be too coarse — not built ahead of
// that need, per ADR-011's standing bias against speculative modeling.
export const RECRUITER_CONNECTION_STATUSES = ["NOT_CONNECTED", "REQUESTED", "CONNECTED"] as const;
export type RecruiterConnectionStatus = (typeof RECRUITER_CONNECTION_STATUSES)[number];

export const recruiterInputSchema = z.object({
  companyId: z.string().uuid(),
  relatedJobId: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().max(160).default(""),
  linkedinUrl: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(4000).default(""),
  nextAction: z.string().trim().max(300).default(""),
});
export type RecruiterInput = z.infer<typeof recruiterInputSchema>;

export const recruiterPublicSchema = recruiterInputSchema.extend({
  id: z.string().uuid(),
  connectionStatus: z.enum(RECRUITER_CONNECTION_STATUSES),
  relevanceScore: z.number().int().min(0).max(100).nullable(),
  lastInteractionAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RecruiterPublic = z.infer<typeof recruiterPublicSchema>;

export const recruiterConnectionStatusInputSchema = z.object({
  connectionStatus: z.enum(RECRUITER_CONNECTION_STATUSES),
});

export const recruiterPatchInputSchema = z.object({
  notes: z.string().trim().max(4000).optional(),
  nextAction: z.string().trim().max(300).optional(),
});
export type RecruiterPatchInput = z.infer<typeof recruiterPatchInputSchema>;

// Career Analytics (Slice 6): everything here is a deterministic aggregate over Job/Company/
// Recruiter records already in the database — no AI call, no new user-facing input. A metric
// only appears here if this app can measure it truthfully from data it actually has; see
// career-service.ts's computeAnalytics() for what's deliberately left out (e.g. "recruiter
// responses" isn't measurable without a real messaging channel, so it isn't reported).
export const careerAnalyticsSchema = z.object({
  totalJobs: z.number().int(),
  jobsByStatus: z.record(z.enum(JOB_STATUSES), z.number().int()),
  applications: z.number().int(),
  interviewsReached: z.number().int(),
  offers: z.number().int(),
  applicationToInterviewRate: z.number().min(0).max(100).nullable(),
  rejectionRate: z.number().min(0).max(100).nullable(),
  averageFitScore: z.number().min(0).max(100).nullable(),
  companiesTargeted: z.number().int(),
  recruiterContacts: z.number().int(),
  recruitersConnected: z.number().int(),
  topTechnologies: z.array(z.object({ technology: z.string(), count: z.number().int() })).max(10),
  topGaps: z.array(z.object({ skill: z.string(), count: z.number().int() })).max(10),
  jobsBySource: z.record(z.enum(JOB_SOURCES), z.number().int()),
});
export type CareerAnalytics = z.infer<typeof careerAnalyticsSchema>;

// Content <-> Career intelligence loop (Slice 7), Career -> Content direction only — see
// ADR-013 for why the reverse direction (post engagement -> networking suggestions) is
// deliberately deferred rather than faked. Fully deterministic: a technology is only ever
// suggested when the profile has real, matchable evidence for it (career-analytics.ts's
// tally combined with job-fit.ts's skillsMatch), so this can't nudge toward fabricated
// content the way an ungrounded model call could.
export const contentTopicSuggestionSchema = z.object({
  technology: z.string(),
  jobCount: z.number().int(),
  totalJobs: z.number().int(),
  demandPercent: z.number().min(0).max(100),
  evidence: z.string(),
  hook: z.string(),
});
export type ContentTopicSuggestion = z.infer<typeof contentTopicSuggestionSchema>;

// Outreach message drafting (PREPARE level per ADR-012 — always a draft the user copies out
// and sends themselves; this codebase has no channel to send it through even if it wanted to).
export const outreachMessageSchema = z.object({
  connectionNote: z.string().trim().max(300),
  message: z.string().trim().max(2000),
});
export type OutreachMessage = z.infer<typeof outreachMessageSchema>;

// Per-source permission registry (Job Hunter, spec §6). Mirrors the `sources` table: whether
// the source may be queried at all, and how far application automation may go through it.
export const SOURCE_APPLICATION_MODES = ["MANUAL", "ASSISTED", "AUTOMATED"] as const;
export type SourceApplicationMode = (typeof SOURCE_APPLICATION_MODES)[number];

export const sourcePublicSchema = z.object({
  id: z.string(),
  domain: z.string(),
  adapterType: z.enum(["BOARD", "SEARCH"]),
  discoveryAllowed: z.boolean(),
  applicationMode: z.enum(SOURCE_APPLICATION_MODES),
  termsUrl: z.string(),
  enabled: z.boolean(),
  notes: z.string(),
});
export type SourcePublic = z.infer<typeof sourcePublicSchema>;

export const sourcePatchInputSchema = z.object({ enabled: z.boolean() });
export type SourcePatchInput = z.infer<typeof sourcePatchInputSchema>;

// Hard eligibility (Job Hunter, spec A03). UNKNOWN is never presented as ELIGIBLE.
export const JOB_ELIGIBILITY_STATUSES = ["ELIGIBLE", "EXCLUDED", "UNKNOWN"] as const;
export type JobEligibilityStatus = (typeof JOB_ELIGIBILITY_STATUSES)[number];

export const eligibilityReasonSchema = z.object({
  rule: z.string(),
  effect: z.enum(["EXCLUDES", "CONFIRMS", "SUPPORTS"]),
  field: z.enum(["title", "location", "description"]),
  quote: z.string(),
});
export type EligibilityReasonPublic = z.infer<typeof eligibilityReasonSchema>;

// Matching v2 (JOB-011): six weighted dimensions, each saying whether the posting gave
// enough to score it. Confidence is the share of weight that was known.
export const MATCH_DIMENSIONS = [
  "technical",
  "seniority",
  "experience",
  "geography",
  "compensation",
  "preferences",
] as const;
export type MatchDimensionName = (typeof MATCH_DIMENSIONS)[number];

export const matchDimensionResultSchema = z.object({
  score: z.number(),
  known: z.boolean(),
  weight: z.number(),
  notes: z.array(z.string()),
});

export const matchBreakdownSchema = z.object({
  version: z.string(),
  dimensions: z.record(z.enum(MATCH_DIMENSIONS), matchDimensionResultSchema),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  flags: z.array(z.string()),
});
export type MatchBreakdown = z.infer<typeof matchBreakdownSchema>;

// Explanation agent (spec A05, JOB-012/013). Every claim says whether it is a confirmed FACT
// or an INFERENCE and quotes its evidence. The server checks each quote against the job's
// own text or the saved profile before storing it (job-explanation-grounding.ts).
export const EXPLANATION_EVIDENCE_SOURCES = ["JOB", "PROFILE"] as const;
export const EXPLANATION_CLAIM_KINDS = ["FACT", "INFERENCE"] as const;
export const EXPLANATION_ACTIONS = ["APPLY", "CONSIDER", "SKIP"] as const;
export const EXPLANATION_CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;

export const explanationEvidenceSchema = z.object({
  source: z.enum(EXPLANATION_EVIDENCE_SOURCES),
  quote: z.string().trim().min(1).max(400),
});
export type ExplanationEvidence = z.infer<typeof explanationEvidenceSchema>;

export const explanationClaimSchema = z.object({
  statement: z.string().trim().min(1).max(600),
  kind: z.enum(EXPLANATION_CLAIM_KINDS),
  evidence: z.array(explanationEvidenceSchema).max(4).default([]),
});
export type ExplanationClaim = z.infer<typeof explanationClaimSchema>;

const claimList = (max: number) => z.array(explanationClaimSchema).max(max).default([]);

export const jobExplanationSchema = z.object({
  executiveSummary: z.string().trim().min(1).max(800),
  whyShortlisted: claimList(6),
  matchedRequirements: claimList(10),
  gaps: claimList(10),
  geographicEligibility: claimList(4),
  compensation: claimList(4),
  technicalRelevance: claimList(4),
  applicationRisks: claimList(6),
  cvEmphasis: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
  interviewTopics: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  recommendedAction: z.enum(EXPLANATION_ACTIONS),
  confidence: z.enum(EXPLANATION_CONFIDENCE_LEVELS),
});
export type JobExplanation = z.infer<typeof jobExplanationSchema>;

export const groundedJobExplanationSchema = jobExplanationSchema.extend({
  grounding: z.object({ droppedClaims: z.number(), downgradedClaims: z.number(), droppedQuotes: z.number() }),
});
export type GroundedJobExplanation = z.infer<typeof groundedJobExplanationSchema>;

export const jobEvaluationPublicSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  profileVersion: z.number(),
  eligibility: z.enum(JOB_ELIGIBILITY_STATUSES),
  eligibilityReasons: z.array(eligibilityReasonSchema),
  // Null when the job was excluded by the rules or no profile was saved yet.
  score: z.number().nullable(),
  confidence: z.number().nullable(),
  match: matchBreakdownSchema.nullable(),
  // Null unless the job was shortlisted and explained (JOB-012).
  explanation: groundedJobExplanationSchema.nullable(),
  modelVersion: z.string(),
  promptVersion: z.string(),
  createdAt: z.string(),
});
export type JobEvaluationPublic = z.infer<typeof jobEvaluationPublicSchema>;

// Ranked job feed (JOB-008): each tracked job with its latest evaluation and, separately, its
// latest explanation, so a later re-score that was not explained does not hide it.
export const FEED_ELIGIBILITY_FILTERS = [...JOB_ELIGIBILITY_STATUSES, "NOT_EVALUATED"] as const;
export type FeedEligibilityFilter = (typeof FEED_ELIGIBILITY_FILTERS)[number];

export const jobFeedQuerySchema = z.object({
  eligibility: z
    .string()
    .default("ELIGIBLE,UNKNOWN,NOT_EVALUATED")
    .transform((value) => value.split(",").map((item) => item.trim()).filter(Boolean))
    .pipe(z.array(z.enum(FEED_ELIGIBILITY_FILTERS)).min(1)),
  // Jobs without a score are left out once this is above 0.
  minScore: z.coerce.number().int().min(0).max(100).default(0),
  source: z.enum(JOB_SOURCES).optional(),
  q: z.string().trim().max(120).default(""),
  postedWithinDays: z.coerce.number().int().positive().max(365).optional(),
});
export type JobFeedQuery = z.infer<typeof jobFeedQuerySchema>;

// Relevance feedback (JOB-014): the user's verdict on one evaluation, used to calibrate the
// match weights. Reasons are a fixed list so they can be counted.
export const FEEDBACK_VERDICTS = ["RELEVANT", "NOT_RELEVANT"] as const;
export const FEEDBACK_REASONS = [
  "GREAT_MATCH",
  "WRONG_STACK",
  "WRONG_SENIORITY",
  "PAY_TOO_LOW",
  "LOCATION",
  "ROLE_TYPE",
  "COMPANY",
  "OTHER",
] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export const jobFeedbackInputSchema = z.object({
  evaluationId: z.string().uuid(),
  verdict: z.enum(FEEDBACK_VERDICTS),
  reasons: z.array(z.enum(FEEDBACK_REASONS)).max(FEEDBACK_REASONS.length).default([]),
  note: z.string().trim().max(500).default(""),
});
export type JobFeedbackInput = z.infer<typeof jobFeedbackInputSchema>;

export const jobFeedbackPublicSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  evaluationId: z.string(),
  verdict: z.enum(FEEDBACK_VERDICTS),
  reasons: z.array(z.enum(FEEDBACK_REASONS)),
  note: z.string(),
  createdAt: z.string(),
});
export type JobFeedbackPublic = z.infer<typeof jobFeedbackPublicSchema>;

// How the user's verdicts line up with the match score. agreementRate is the share of rated,
// scored jobs where "relevant" sits at or above the threshold and "not relevant" below it.
export const feedbackSummarySchema = z.object({
  threshold: z.number(),
  rated: z.number(),
  relevant: z.number(),
  notRelevant: z.number(),
  agreementRate: z.number().nullable(),
  dimensions: z.record(
    z.enum(MATCH_DIMENSIONS),
    z.object({ relevantAverage: z.number().nullable(), notRelevantAverage: z.number().nullable() }),
  ),
  reasons: z.array(z.object({ reason: z.enum(FEEDBACK_REASONS), count: z.number() })),
});
export type FeedbackSummary = z.infer<typeof feedbackSummarySchema>;

export const jobFeedItemSchema = z.object({
  job: jobPublicSchema,
  companyName: z.string(),
  // When the source says it was posted, else when it was discovered.
  postedAt: z.string(),
  evaluation: jobEvaluationPublicSchema.nullable(),
  explanation: groundedJobExplanationSchema.nullable(),
  explainedAt: z.string().nullable(),
  feedback: jobFeedbackPublicSchema.nullable(),
});
export type JobFeedItem = z.infer<typeof jobFeedItemSchema>;


// Target-company watchlist (Milestone 1.5): a company's ATS board polled daily.
export const COMPANY_WATCH_STATUSES = ["NEVER", "OK", "FAILED"] as const;
export type CompanyWatchStatus = (typeof COMPANY_WATCH_STATUSES)[number];

export const companyWatchInputSchema = z.object({
  source: z.enum(JOB_BOARD_SOURCES),
  boardToken: z.string().trim().min(1).max(100),
});
export type CompanyWatchInput = z.infer<typeof companyWatchInputSchema>;

export const companyWatchPublicSchema = z.object({
  companyId: z.string().uuid(),
  companyName: z.string(),
  source: z.enum(JOB_BOARD_SOURCES),
  boardToken: z.string(),
  lastPolledAt: z.string().nullable(),
  lastStatus: z.enum(COMPANY_WATCH_STATUSES),
  lastError: z.string(),
  // From the last successful poll: postings on the board, how many were published in the last
  // 30 days, and how many were new to the tracker.
  openPostings: z.number().nullable(),
  recentPostings: z.number().nullable(),
  newPostings: z.number().nullable(),
  hiringFast: z.boolean(),
});
export type CompanyWatchPublic = z.infer<typeof companyWatchPublicSchema>;
