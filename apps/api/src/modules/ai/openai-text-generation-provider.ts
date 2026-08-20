import OpenAI from "openai";
import { malformedAiOutput, providerUnavailable } from "../../app-error.js";
import { mapOpenAiError } from "./openai-error.js";
import type {
  TextGenerationProvider,
  TextGenerationRequest,
  TextGenerationResult,
} from "./text-generation-provider.js";

export class OpenAITextGenerationProvider implements TextGenerationProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    if (!this.apiKey) {
      throw providerUnavailable(
        "Text generation is not configured. Set OPENAI_API_KEY and retry.",
      );
    }

    const client = new OpenAI({
      apiKey: this.apiKey,
      timeout: 90_000,
      maxRetries: 1,
    });

    try {
      const completion = await client.chat.completions.create({
        model: this.model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
      });

      const text = completion.choices[0]?.message?.content;
      if (!text) {
        throw malformedAiOutput("The model returned an empty response.");
      }

      return {
        text,
        model: completion.model || this.model,
      };
    } catch (error) {
      throw mapOpenAiError(error);
    }
  }
}
