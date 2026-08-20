export type TextGenerationRequest = {
  purpose: string;
  system: string;
  user: string;
};

export type TextGenerationResult = {
  text: string;
  model: string;
};

export interface TextGenerationProvider {
  generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;
}
