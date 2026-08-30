import OpenAI, { toFile } from "openai";
import { malformedAiOutput, providerUnavailable } from "../../app-error.js";
import { mapOpenAiError } from "./openai-error.js";
import type {
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageGenerationResult,
} from "./image-generation-provider.js";

const MIME_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export class OpenAIImageGenerationProvider implements ImageGenerationProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    if (!this.apiKey) {
      throw providerUnavailable(
        "Image generation is not configured. Set OPENAI_API_KEY and retry.",
      );
    }

    const client = new OpenAI({
      apiKey: this.apiKey,
      timeout: 120_000,
      maxRetries: 1,
    });

    try {
      const response =
        request.referenceImages && request.referenceImages.length > 0
          ? await client.images.edit({
              model: this.model,
              prompt: request.prompt,
              size: "1024x1024",
              image: await Promise.all(
                request.referenceImages.map((reference, index) =>
                  toFile(
                    reference.bytes,
                    `reference-${index}.${MIME_EXTENSION[reference.mimeType] ?? "png"}`,
                    { type: reference.mimeType },
                  ),
                ),
              ),
            })
          : await client.images.generate({
              model: this.model,
              prompt: request.prompt,
              size: "1024x1024",
            });

      const b64 = response.data?.[0]?.b64_json;
      if (!b64) {
        throw malformedAiOutput("The image provider returned no image data.");
      }

      return {
        bytes: Buffer.from(b64, "base64"),
        mimeType: "image/png",
        model: this.model,
      };
    } catch (error) {
      throw mapOpenAiError(error);
    }
  }
}
