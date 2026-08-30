import { z } from "zod";

export const TEXT_PROVIDERS = ["openai", "anthropic"] as const;
export type TextProviderName = (typeof TEXT_PROVIDERS)[number];
export const TEXT_PROVIDER_LABELS: Record<TextProviderName, string> = {
  openai: "OpenAI (gpt-4.1)",
  anthropic: "Anthropic (Claude)",
};

export const IMAGE_PROVIDERS = ["openai", "pollinations"] as const;
export type ImageProviderName = (typeof IMAGE_PROVIDERS)[number];
export const IMAGE_PROVIDER_LABELS: Record<ImageProviderName, string> = {
  openai: "OpenAI (gpt-image-1)",
  pollinations: "Pollinations (free)",
};

export const textProviderSchema = z.enum(TEXT_PROVIDERS);
export const imageProviderSchema = z.enum(IMAGE_PROVIDERS);
