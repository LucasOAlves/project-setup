import { z } from "zod";

const shortList = (maxItems: number, maxLength: number) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems);

export const SENIORITY_BANDS = [
  "Individual Contributor",
  "Senior IC",
  "Staff-plus",
  "Lead",
  "Manager",
  "Director+",
  "Founder",
  "Unclear",
] as const;

export const topicBandItemSchema = z.object({
  topic: z.string().trim().min(1).max(120),
  evidence: z.string().trim().min(1).max(500),
});

export const proofPointSchema = z.object({
  claim: z.string().trim().min(1).max(200),
  evidence: z.string().trim().min(1).max(400),
});

export const personaPayloadSchema = z.object({
  positioningStatement: z.string().trim().min(1).max(400),
  coreExpertise: shortList(8, 80),
  supportingExpertise: shortList(8, 80),
  technologies: shortList(20, 80),
  industries: shortList(10, 80),
  careerNarrative: z.string().trim().min(1).max(1200),
  seniority: z.enum(SENIORITY_BANDS),
  technicalDepth: z.string().trim().min(1).max(400),
  leadershipExposure: z.string().trim().min(1).max(400),
  differentiators: shortList(6, 160),
  proofPoints: z.array(proofPointSchema).max(8),
  targetAudience: z.string().trim().min(1).max(400),
  desiredPerception: z.string().trim().min(1).max(400),
  contentPillars: shortList(6, 80),
  strongAuthorityTopics: z.array(topicBandItemSchema).max(8),
  credibleTopics: z.array(topicBandItemSchema).max(8),
  adjacentTopics: z.array(topicBandItemSchema).max(8),
  riskyTopics: z.array(topicBandItemSchema).max(8),
  professionalKeywords: shortList(20, 60),
  businessImpactThemes: shortList(8, 120),
  repeatedCareerPatterns: shortList(6, 160),
});

export type PersonaPayload = z.infer<typeof personaPayloadSchema>;
export type TopicBandItem = z.infer<typeof topicBandItemSchema>;

export const personaPublicSchema = z.object({
  id: z.string().uuid(),
  promptVersion: z.string(),
  model: z.string(),
  createdAt: z.string(),
  stale: z.boolean(),
  evidenceWarning: z.string().nullable(),
  persona: personaPayloadSchema,
});

export type PersonaPublic = z.infer<typeof personaPublicSchema>;

export const PERSONA_PROMPT_VERSION = "persona.v1";
