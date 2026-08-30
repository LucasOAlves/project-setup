import { z } from "zod";

export const CONTENT_PLAN_FORMATS = [
  "NARRATIVE",
  "CHECKLIST",
  "DOCUMENT",
  "DIAGRAM",
  "CAROUSEL",
] as const;

export type ContentPlanFormat = (typeof CONTENT_PLAN_FORMATS)[number];

export const CONTENT_PLAN_STATUSES = [
  "PLANNED",
  "SELECTED",
  "DRAFTED",
  "PUBLISHED",
  "SKIPPED",
] as const;

export type ContentPlanStatus = (typeof CONTENT_PLAN_STATUSES)[number];

export const contentPlanSourceSchema = z.object({
  id: z.string().trim().min(1).max(20),
  author: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  url: z.string().url(),
});

export type ContentPlanSource = z.infer<typeof contentPlanSourceSchema>;

export const contentPlanTopicSchema = z.object({
  id: z.string().trim().min(1).max(10),
  week: z.number().int().min(1).max(52),
  date: z.string(),
  title: z.string().trim().min(1).max(200),
  format: z.enum(CONTENT_PLAN_FORMATS),
  priority: z.number().min(0).max(100),
  pillar: z.string().trim().min(1).max(120),
  pillarValue: z.string().trim().min(1).max(300),
  objective: z.string().trim().min(1).max(400),
  hook: z.string().trim().min(1).max(300),
  keyPoints: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  cta: z.string().trim().min(1).max(300),
  evidenceNote: z.string().trim().min(1).max(300),
  confidentiality: z.string().trim().min(1).max(300),
  sources: z.array(contentPlanSourceSchema).min(1).max(6),
});

export type ContentPlanTopic = z.infer<typeof contentPlanTopicSchema>;

export const contentPlanTopicPublicSchema = contentPlanTopicSchema.extend({
  status: z.enum(CONTENT_PLAN_STATUSES),
  contentOpportunityId: z.string().uuid().nullable(),
  generatedPostId: z.string().uuid().nullable(),
});

export type ContentPlanTopicPublic = z.infer<typeof contentPlanTopicPublicSchema>;

export const contentPlanStatusInputSchema = z.object({
  status: z.enum(CONTENT_PLAN_STATUSES),
});
