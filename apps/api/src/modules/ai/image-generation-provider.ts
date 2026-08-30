export type ImageReference = {
  bytes: Buffer;
  mimeType: string;
};

export type ImageGenerationRequest = {
  prompt: string;
  referenceImages?: ImageReference[];
};

export type ImageGenerationResult = {
  bytes: Buffer;
  mimeType: string;
  model: string;
};

export interface ImageGenerationProvider {
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}
