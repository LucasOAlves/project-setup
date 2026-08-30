import { z } from "zod";
import { imageProviderSchema, textProviderSchema } from "./provider.js";

export const IMAGE_PROMPT_VERSION = "image-brief.v1";

export const imageBriefPayloadSchema = z.object({
  visualConcept: z.string().trim().min(1).max(600),
  style: z.string().trim().min(1).max(500),
  composition: z.string().trim().min(1).max(600),
  colorPalette: z.string().trim().min(1).max(300),
  avoid: z.array(z.string().trim().min(1).max(200)).max(8),
  imagePrompt: z.string().trim().min(1).max(2200),
});

export type ImageBriefPayload = z.infer<typeof imageBriefPayloadSchema>;

export const imagePublicSchema = z.object({
  id: z.string().uuid(),
  postId: z.string().uuid(),
  url: z.string(),
  model: z.string(),
  createdAt: z.string(),
});

export type ImagePublic = z.infer<typeof imagePublicSchema>;

export const imageGenerateInputSchema = z.object({
  postId: z.string().uuid().optional(),
  textProvider: textProviderSchema.optional(),
  imageProvider: imageProviderSchema.optional(),
});
