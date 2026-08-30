import type { ImageProviderName, TextProviderName } from "@studio/shared";
import type { ImageGenerationProvider } from "./image-generation-provider.js";
import type { TextGenerationProvider } from "./text-generation-provider.js";

export function resolveTextProvider(
  providers: Record<TextProviderName, TextGenerationProvider>,
  fallback: TextProviderName,
  requested?: TextProviderName,
): TextGenerationProvider {
  return providers[requested ?? fallback];
}

export function resolveImageProvider(
  providers: Record<ImageProviderName, ImageGenerationProvider>,
  fallback: ImageProviderName,
  requested?: ImageProviderName,
): ImageGenerationProvider {
  return providers[requested ?? fallback];
}
