import { z } from "zod";
import { CONTENT_PLAN_STATUSES } from "./content-plan.js";
import { ANGLE_TYPES } from "./opportunity.js";

export const customTopicInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  hook: z.string().trim().min(1).max(300),
  objective: z.string().trim().max(400).optional(),
  keyPoints: z.array(z.string().trim().min(1).max(200)).min(1).max(6),
  cta: z.string().trim().max(300).optional(),
  angle: z.enum(ANGLE_TYPES).default("EDUCATIONAL"),
  pillar: z.string().trim().max(120).optional(),
  sourceUrl: z.string().trim().url().optional(),
});

export type CustomTopicInput = z.infer<typeof customTopicInputSchema>;

export const customTopicPublicSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  hook: z.string(),
  objective: z.string(),
  keyPoints: z.array(z.string()),
  cta: z.string(),
  angle: z.enum(ANGLE_TYPES),
  pillar: z.string(),
  sourceUrl: z.string().nullable(),
  status: z.enum(CONTENT_PLAN_STATUSES),
  contentOpportunityId: z.string().uuid().nullable(),
  createdAt: z.string(),
});

export type CustomTopicPublic = z.infer<typeof customTopicPublicSchema>;

export const customTopicStatusInputSchema = z.object({
  status: z.enum(CONTENT_PLAN_STATUSES),
});
