import Anthropic from "@anthropic-ai/sdk";
import { malformedAiOutput, providerUnavailable } from "../../app-error.js";
import { mapAnthropicError } from "./anthropic-error.js";
import type {
  TextGenerationProvider,
  TextGenerationRequest,
  TextGenerationResult,
} from "./text-generation-provider.js";

const JSON_ONLY_SUFFIX =
  "\n\nRespond with a single valid JSON object and nothing else: no prose, no markdown code fences.";

export class AnthropicTextGenerationProvider implements TextGenerationProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    if (!this.apiKey) {
      throw providerUnavailable(
        "Text generation is not configured. Set ANTHROPIC_API_KEY and retry.",
      );
    }

    const client = new Anthropic({
      apiKey: this.apiKey,
      maxRetries: 1,
    });

    try {
      const stream = client.messages.stream({
        model: this.model,
        max_tokens: 32000,
        system: request.system + JSON_ONLY_SUFFIX,
        messages: [{ role: "user", content: request.user }],
      });
      const response = await stream.finalMessage();

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (!text) {
        throw malformedAiOutput("The model returned an empty response.");
      }

      return {
        text,
        model: response.model || this.model,
      };
    } catch (error) {
      throw mapAnthropicError(error);
    }
  }
}
