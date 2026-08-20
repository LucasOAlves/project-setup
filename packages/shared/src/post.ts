import { z } from "zod";
import { WRITING_TONES } from "./constants.js";
import { ANGLE_TYPES } from "./opportunity.js";

export const POST_PROMPT_VERSION = "post.v1";
export const POST_EDIT_PROMPT_VERSION = "post.edit.v1";

export const POST_EDIT_ACTIONS = ["HOOK", "TONE", "ANGLE", "REWRITE"] as const;
export type PostEditAction = (typeof POST_EDIT_ACTIONS)[number];

export const storyStrategySchema = z.object({
  structure: z.string().trim().min(1).max(120),
  hookApproach: z.string().trim().min(1).max(300),
  narrativeArc: z.string().trim().min(1).max(500),
  evidenceToUse: z.array(z.string().trim().min(1).max(200)).min(1).max(6),
  claimsToAvoid: z.array(z.string().trim().min(1).max(200)).max(8),
  takeaway: z.string().trim().min(1).max(300),
});

export type StoryStrategy = z.infer<typeof storyStrategySchema>;

export const writingReviewSchema = z.object({
  summary: z.string().trim().min(1).max(400),
  revisedSections: z.array(z.string().trim().min(1).max(200)).max(8),
  remainingRisks: z.array(z.string().trim().min(1).max(200)).max(8),
});

export type WritingReview = z.infer<typeof writingReviewSchema>;

export const factClaimSchema = z.object({
  claim: z.string().trim().min(1).max(300),
  kind: z.enum(["ARTICLE", "PROFILE", "INTERPRETATION"]),
  source: z.string().trim().min(1).max(400),
  supported: z.boolean(),
});

export type FactClaim = z.infer<typeof factClaimSchema>;

export const factReviewSchema = z.object({
  summary: z.string().trim().min(1).max(400),
  claims: z.array(factClaimSchema).max(20),
  unsupportedClaims: z.array(z.string().trim().min(1).max(300)).max(12),
});

export type FactReview = z.infer<typeof factReviewSchema>;

export const seoReviewSchema = z.object({
  summary: z.string().trim().min(1).max(400),
  keywordsUsed: z.array(z.string().trim().min(1).max(80)).max(12),
  stuffingRisk: z.string().trim().min(1).max(200),
});

export type SeoReview = z.infer<typeof seoReviewSchema>;

export const qualityScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  explanation: z.string().trim().min(1).max(400),
  strengths: z.array(z.string().trim().min(1).max(200)).max(6),
  improvements: z.array(z.string().trim().min(1).max(200)).max(6),
});

export type QualityScore = z.infer<typeof qualityScoreSchema>;

export const modelDraftSchema = z.object({
  storyStrategy: storyStrategySchema,
  hook: z.string().trim().min(1).max(280),
  body: z.string().trim().min(1).max(5000),
});

export type ModelDraft = z.infer<typeof modelDraftSchema>;

export const modelReviewSchema = z.object({
  hook: z.string().trim().min(1).max(280),
  body: z.string().trim().min(1).max(5000),
  writingReview: writingReviewSchema,
  factReview: factReviewSchema,
  seoReview: seoReviewSchema,
  quality: qualityScoreSchema,
});

export type ModelReview = z.infer<typeof modelReviewSchema>;

export const modelEditSchema = z.object({
  hook: z.string().trim().min(1).max(280),
  body: z.string().trim().min(1).max(5000),
});

export type ModelEdit = z.infer<typeof modelEditSchema>;

export const postToneInputSchema = z.object({
  tone: z.enum(WRITING_TONES),
});

export const postAngleInputSchema = z.object({
  angle: z.enum(ANGLE_TYPES),
});

export const postRewriteInputSchema = z.object({
  section: z.string().trim().min(1).max(2000),
});

export const postPublicSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  promptVersion: z.string(),
  model: z.string(),
  tone: z.enum(WRITING_TONES),
  angle: z.enum(ANGLE_TYPES),
  opportunityId: z.string().uuid(),
  sourceTitle: z.string(),
  sourceUrl: z.string(),
  hook: z.string(),
  body: z.string(),
  storyStrategy: storyStrategySchema,
  writingReview: writingReviewSchema,
  factReview: factReviewSchema,
  seoReview: seoReviewSchema,
  quality: qualityScoreSchema,
});

export type PostPublic = z.infer<typeof postPublicSchema>;
