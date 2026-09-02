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

export const jobFitResultSchema = z.object({
  overall: z.number().int().min(0).max(100),
  dimensions: jobFitDimensionsSchema,
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  recommendation: z.enum(JOB_FIT_RECOMMENDATIONS),
});
export type JobFitResult = z.infer<typeof jobFitResultSchema>;
