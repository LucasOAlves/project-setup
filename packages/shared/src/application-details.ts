import { z } from "zod";

// What application forms ask for beyond the professional profile (Job Hunter, Milestone 2):
// contact details, education, certifications, spoken languages and the practical answers
// (work authorization, notice period, time zone, salary expectation). Stored apart from the
// profile so contact details can never reach a model prompt: prompts are built from the
// profile, and only the deterministic answer mapper and the document renderer read these.

export const SPOKEN_LANGUAGE_LEVELS = ["NATIVE", "FLUENT", "ADVANCED", "INTERMEDIATE", "BASIC"] as const;
export type SpokenLanguageLevel = (typeof SPOKEN_LANGUAGE_LEVELS)[number];

export const SALARY_PERIODS = ["MONTH", "YEAR"] as const;

const text = (max: number) => z.string().trim().max(max).default("");
const year = z.number().int().min(1950).max(2100).nullable().default(null);

export const contactDetailsSchema = z.object({
  email: z.union([z.literal(""), z.string().trim().email().max(200)]).default(""),
  phone: text(40),
  city: text(100),
  country: text(100),
  linkedinUrl: text(300),
  githubUrl: text(300),
  portfolioUrl: text(300),
});

export const educationEntrySchema = z.object({
  institution: z.string().trim().min(1).max(200),
  degree: text(200),
  field: text(200),
  startYear: year,
  endYear: year,
});

export const certificationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  issuer: text(200),
  year,
});

export const spokenLanguageSchema = z.object({
  language: z.string().trim().min(1).max(60),
  level: z.enum(SPOKEN_LANGUAGE_LEVELS),
});

export const salaryExpectationSchema = z.object({
  amount: z.number().int().positive().max(10_000_000),
  currency: z.string().trim().length(3).toUpperCase(),
  period: z.enum(SALARY_PERIODS),
});

export const applicationDetailsInputSchema = z.object({
  contact: contactDetailsSchema.default({}),
  education: z.array(educationEntrySchema).max(10).default([]),
  certifications: z.array(certificationSchema).max(20).default([]),
  spokenLanguages: z.array(spokenLanguageSchema).max(10).default([]),
  // In the user's own words, e.g. "Brazilian citizen, works as a contractor; no US work permit".
  workAuthorization: text(500),
  // null: not answered yet.
  requiresVisaSponsorship: z.boolean().nullable().default(null),
  noticePeriod: text(200),
  timeZone: text(100),
  salaryExpectation: salaryExpectationSchema.nullable().default(null),
});
export type ApplicationDetailsInput = z.infer<typeof applicationDetailsInputSchema>;

export const applicationDetailsPublicSchema = applicationDetailsInputSchema.extend({
  version: z.number().int(),
  updatedAt: z.string(),
});
export type ApplicationDetailsPublic = z.infer<typeof applicationDetailsPublicSchema>;
