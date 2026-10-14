export type TextGenerationRequest = {
  purpose: string;
  system: string;
  user: string;
};

export type TextGenerationResult = {
  text: string;
  model: string;
  // Token counts when the provider reports them, for cost tracking (spec: AI subsystem).
  usage?: { inputTokens: number; outputTokens: number };
};

export interface TextGenerationProvider {
  generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;
}
