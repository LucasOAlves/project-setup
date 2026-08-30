import { z } from "zod";
import { newsArticlePublicSchema } from "./news.js";
import { textProviderSchema } from "./provider.js";

export const opportunityGenerateInputSchema = z.object({
  provider: textProviderSchema.optional(),
});

export const ANGLE_TYPES = [
  "EXPERIENCE_DRIVEN",
  "CONTRARIAN",
  "EDUCATIONAL",
  "PRODUCTION_REALITY",
  "ARCHITECTURAL",
  "LEADERSHIP",
  "CAREER",
  "BUSINESS_IMPACT",
  "PREDICTION",
] as const;

export type AngleType = (typeof ANGLE_TYPES)[number];

export const ANGLE_LABELS: Record<AngleType, string> = {
  EXPERIENCE_DRIVEN: "Experience-driven",
  CONTRARIAN: "Contrarian",
  EDUCATIONAL: "Educational",
  PRODUCTION_REALITY: "Production reality",
  ARCHITECTURAL: "Architectural",
  LEADERSHIP: "Leadership",
  CAREER: "Career",
  BUSINESS_IMPACT: "Business impact",
  PREDICTION: "Prediction",
};

export const OPPORTUNITY_PROMPT_VERSION = "opportunity.v1";

export const opportunityPayloadSchema = z.object({
  topic: z.string().trim().min(1).max(160),
  sourceEvent: z.string().trim().min(1).max(200),
  whyItMatters: z.string().trim().min(1).max(400),
  whyItFits: z.string().trim().min(1).max(400),
  audienceCare: z.string().trim().min(1).max(400),
  targetAudience: z.string().trim().min(1).max(300),
  thesis: z.string().trim().min(1).max(400),
  pointOfView: z.string().trim().min(1).max(400),
  storytellingDirection: z.string().trim().min(1).max(300),
  readerTakeaway: z.string().trim().min(1).max(300),
  credibilityRisk: z.string().trim().min(1).max(300),
  evidence: z.array(z.string().trim().min(1).max(200)).min(1).max(6),
  angle: z.enum(ANGLE_TYPES),
});

export type OpportunityPayload = z.infer<typeof opportunityPayloadSchema>;

export const modelOpportunityEvaluationSchema = z.object({
  articleId: z.string().uuid(),
  keep: z.boolean(),
  rejectReason: z.string().trim().max(300).nullish(),
  semanticMatch: z.number().int().min(0).max(100),
  opportunity: opportunityPayloadSchema.nullish(),
});

export const modelOpportunitySetSchema = z.object({
  evaluations: z.array(modelOpportunityEvaluationSchema).max(8),
});

export type ModelOpportunityEvaluation = z.infer<typeof modelOpportunityEvaluationSchema>;

export const opportunityPublicSchema = z.object({
  id: z.string().uuid(),
  matchScore: z.number().int().min(0).max(100),
  selected: z.boolean(),
  article: newsArticlePublicSchema,
  payload: opportunityPayloadSchema,
});

export type OpportunityPublic = z.infer<typeof opportunityPublicSchema>;

export const opportunitySetPublicSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  promptVersion: z.string(),
  model: z.string(),
  emptyReason: z.enum(["NO_RELEVANT_TOPICS"]).nullable(),
  selectedOpportunityId: z.string().uuid().nullable(),
  opportunities: z.array(opportunityPublicSchema),
});

export type OpportunitySetPublic = z.infer<typeof opportunitySetPublicSchema>;
