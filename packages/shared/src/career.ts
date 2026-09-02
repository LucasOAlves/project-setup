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

export const JOB_SOURCES = ["manual", "linkedin", "greenhouse", "lever"] as const;
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

// Outreach message drafting (PREPARE level per ADR-012 — always a draft the user copies out
// and sends themselves; this codebase has no channel to send it through even if it wanted to).
export const outreachMessageSchema = z.object({
  connectionNote: z.string().trim().max(300),
  message: z.string().trim().max(2000),
});
export type OutreachMessage = z.infer<typeof outreachMessageSchema>;
