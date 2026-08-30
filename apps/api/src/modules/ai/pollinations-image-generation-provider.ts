import { randomInt } from "node:crypto";
import { providerUnavailable } from "../../app-error.js";
import type {
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageGenerationResult,
} from "./image-generation-provider.js";

const POLLINATIONS_MODEL = "flux";

export class PollinationsImageGenerationProvider implements ImageGenerationProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    // Pollinations has no image-to-image endpoint in its free tier, so reference
    // photos cannot be honored here — image generation still succeeds, just without
    // identity preservation. A random seed avoids the provider's response cache
    // returning the same image on every retry for an identical prompt.
    const url = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(request.prompt)}`);
    url.searchParams.set("width", "1024");
    url.searchParams.set("height", "1024");
    url.searchParams.set("model", POLLINATIONS_MODEL);
    url.searchParams.set("nologo", "true");
    url.searchParams.set("seed", String(randomInt(0, 2 ** 31)));

    let response: Response;
    try {
      response = await this.fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
    } catch {
      throw providerUnavailable("The image provider is unavailable.");
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw providerUnavailable(
          "The image provider is rate-limited. Retry in a moment.",
          503,
        );
      }
      throw providerUnavailable("The image provider is unavailable.");
    }

    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw providerUnavailable("The image provider returned an empty response.");
    }

    return { bytes, mimeType, model: `pollinations/${POLLINATIONS_MODEL}` };
  }
}
