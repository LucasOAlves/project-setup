import { z } from "zod";
import { POST_LENGTHS, POSITIONING_OPTIONS, WRITING_TONES } from "./constants.js";

const stringList = (maxItems: number, maxLength: number) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems);

export const experienceInputSchema = z.object({
  id: z.string().uuid().optional(),
  role: z.string().trim().max(200).default(""),
  company: z.string().trim().max(200).default(""),
  startPeriod: z.string().trim().max(40).default(""),
  endPeriod: z.string().trim().max(40).default(""),
  description: z.string().trim().max(4000).default(""),
  responsibilities: z.string().trim().max(4000).default(""),
  achievements: z.string().trim().max(4000).default(""),
  technologies: stringList(40, 80).default([]),
  measurableOutcomes: z.string().trim().max(2000).default(""),
});

export const writingSampleInputSchema = z.object({
  id: z.string().uuid().optional(),
  body: z.string().trim().max(8000).default(""),
});

export const profileInputSchema = z.object({
  fullName: z.string().trim().max(200).default(""),
  headline: z.string().trim().max(300).default(""),
  currentJobTitle: z.string().trim().max(200).default(""),
  currentCompany: z.string().trim().max(200).default(""),
  about: z.string().trim().max(8000).default(""),
  topSkills: stringList(30, 80).default([]),
  technologies: stringList(50, 80).default([]),
  industries: stringList(20, 80).default([]),
  yearsOfExperience: z.number().int().min(0).max(60).nullable().default(null),
  architectureExperience: z.string().trim().max(4000).default(""),
  leadershipExperience: z.string().trim().max(4000).default(""),
  businessImpact: z.string().trim().max(4000).default(""),
  subjectsOfInterest: stringList(30, 80).default([]),
  subjectsToAvoid: stringList(30, 80).default([]),
  targetAudience: z.string().trim().max(1000).default(""),
  preferredLanguage: z.string().trim().max(40).default("English"),
  positioning: z.array(z.enum(POSITIONING_OPTIONS)).max(8).default([]),
  desiredPerception: z.string().trim().max(1000).default(""),
  writingTones: z.array(z.enum(WRITING_TONES)).max(4).default([]),
  postLength: z.enum(POST_LENGTHS).default("MEDIUM"),
  experiences: z.array(experienceInputSchema).max(20).default([]),
  writingSamples: z.array(writingSampleInputSchema).max(3).default([]),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;
export type ExperienceInput = z.infer<typeof experienceInputSchema>;

export const photoPublicSchema = z.object({
  id: z.string().uuid(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  url: z.string(),
  createdAt: z.string(),
});

export const experiencePublicSchema = experienceInputSchema.extend({
  id: z.string().uuid(),
});

export const writingSamplePublicSchema = writingSampleInputSchema.extend({
  id: z.string().uuid(),
});

export const profilePublicSchema = profileInputSchema.extend({
  id: z.string().uuid(),
  photos: z.array(photoPublicSchema),
  experiences: z.array(experiencePublicSchema),
  writingSamples: z.array(writingSamplePublicSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  evidenceWarning: z.string().nullable(),
});

export type ProfilePublic = z.infer<typeof profilePublicSchema>;
export type PhotoPublic = z.infer<typeof photoPublicSchema>;

export const ALLOWED_PHOTO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const MAX_PROFILE_PHOTOS = 3;

export function profileEvidenceFlags(profile: ProfileInput): {
  hasIdentity: boolean;
  hasProof: boolean;
} {
  const hasIdentity = Boolean(
    profile.headline || profile.about || profile.currentJobTitle,
  );
  const hasProof =
    profile.experiences.some((item) => item.role || item.description || item.achievements) ||
    profile.topSkills.length > 0 ||
    profile.technologies.length > 0;
  return { hasIdentity, hasProof };
}

export function assessProfileEvidence(profile: ProfileInput): string | null {
  const { hasIdentity, hasProof } = profileEvidenceFlags(profile);

  if (!hasIdentity && !hasProof) {
    return "The profile does not yet contain enough professional evidence to ground authority. Add a headline, about section, or at least one real experience.";
  }

  if (!hasProof) {
    return "Identity is present, but there is little evidence of skills or experience. Persona quality will stay limited until that exists.";
  }

  return null;
}
