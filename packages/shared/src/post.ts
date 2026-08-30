import { z } from "zod";
import { WRITING_TONES } from "./constants.js";
import { ANGLE_TYPES } from "./opportunity.js";
import { experienceInputSchema } from "./profile.js";
import { textProviderSchema } from "./provider.js";

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
  postId: z.string().uuid().optional(),
  provider: textProviderSchema.optional(),
});

export const postAngleInputSchema = z.object({
  angle: z.enum(ANGLE_TYPES),
  postId: z.string().uuid().optional(),
  provider: textProviderSchema.optional(),
});

export const postSectionCommentSchema = z.object({
  excerpt: z.string().trim().min(1).max(2000),
  comment: z.string().trim().min(1).max(1000),
});

export type PostSectionComment = z.infer<typeof postSectionCommentSchema>;

export const postRewriteInputSchema = z.object({
  sectionComments: z.array(postSectionCommentSchema).min(1).max(10),
  postId: z.string().uuid().optional(),
  provider: textProviderSchema.optional(),
});

export const sectionCommentReviewSchema = z.object({
  index: z.number().int().min(0),
  hasNewExperience: z.boolean(),
  draftExperience: experienceInputSchema.nullish(),
});

export type SectionCommentReview = z.infer<typeof sectionCommentReviewSchema>;

export const sectionCommentReviewResultSchema = z.object({
  reviews: z.array(sectionCommentReviewSchema),
});

export const sectionCommentReviewInputSchema = z.object({
  sectionComments: z.array(postSectionCommentSchema).min(1).max(10),
  provider: textProviderSchema.optional(),
});

export const postHookInputSchema = z.object({
  postId: z.string().uuid().optional(),
  provider: textProviderSchema.optional(),
});

export const postGenerateInputSchema = z.object({
  opportunityId: z.string().uuid().optional(),
  provider: textProviderSchema.optional(),
});

export const POST_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_OUTCOMES = ["GOOD", "NEUTRAL", "POOR"] as const;
export type PostOutcome = (typeof POST_OUTCOMES)[number];

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
  status: z.enum(POST_STATUSES),
  publishedAt: z.string().nullable(),
  outcome: z.enum(POST_OUTCOMES).nullable(),
  outcomeNotes: z.string().nullable(),
});

export type PostPublic = z.infer<typeof postPublicSchema>;

export const postTrackingInputSchema = z.object({
  status: z.enum(POST_STATUSES).optional(),
  outcome: z.enum(POST_OUTCOMES).nullable().optional(),
  outcomeNotes: z.string().trim().max(500).nullable().optional(),
});

export type PostTrackingInput = z.infer<typeof postTrackingInputSchema>;

export const POST_HISTORY_SORT_FIELDS = ["createdAt", "score", "status"] as const;
export type PostHistorySortField = (typeof POST_HISTORY_SORT_FIELDS)[number];

export const postHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  q: z.string().trim().max(200).optional(),
  sortBy: z.enum(POST_HISTORY_SORT_FIELDS).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  opportunityId: z.string().uuid().optional(),
});

export type PostHistoryQuery = z.infer<typeof postHistoryQuerySchema>;

export const postHistoryPublicSchema = z.object({
  posts: z.array(postPublicSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type PostHistoryPublic = z.infer<typeof postHistoryPublicSchema>;
