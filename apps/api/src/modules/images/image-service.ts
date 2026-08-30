import {
  IMAGE_PROMPT_VERSION,
  imageBriefPayloadSchema,
  type ImageProviderName,
  type ImagePublic,
  type TextProviderName,
} from "@studio/shared";
import { malformedAiOutput, notFound } from "../../app-error.js";
import {
  buildImageBriefUserPrompt,
  IMAGE_BRIEF_SYSTEM_PROMPT,
} from "../ai/prompts/image-brief.v1.js";
import type {
  ImageGenerationProvider,
  ImageReference,
} from "../ai/image-generation-provider.js";
import { parseJsonObject } from "../ai/parse-json.js";
import { resolveImageProvider, resolveTextProvider } from "../ai/resolve-provider.js";
import type { TextGenerationProvider } from "../ai/text-generation-provider.js";
import type { PersonaService } from "../persona/persona-service.js";
import type { PostService } from "../posts/post-service.js";
import type { ProfileService } from "../profile/profile-service.js";
import type { StorageObject, StorageProvider } from "../uploads/storage-provider.js";
import type { ImageRepository } from "./image-repository.js";

const MIME_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export class ImageService {
  constructor(
    private readonly profiles: ProfileService,
    private readonly personas: PersonaService,
    private readonly posts: PostService,
    private readonly textProviders: Record<TextProviderName, TextGenerationProvider>,
    private readonly defaultTextProvider: TextProviderName,
    private readonly imageProviders: Record<ImageProviderName, ImageGenerationProvider>,
    private readonly defaultImageProvider: ImageProviderName,
    private readonly storage: StorageProvider,
    private readonly repo: ImageRepository,
  ) {}

  async generate(
    postId?: string,
    textProvider?: TextProviderName,
    imageProvider?: ImageProviderName,
  ): Promise<ImagePublic> {
    const post = postId ? await this.posts.getById(postId) : await this.posts.getLatest();
    if (!post) {
      throw notFound("Write a post before generating an image for it.");
    }

    const profile = await this.profiles.getProfile();
    const persona = await this.personas.getPersona();
    if (!profile || !persona) {
      throw notFound("Generate a persona before generating an image.");
    }

    const text = resolveTextProvider(this.textProviders, this.defaultTextProvider, textProvider);
    const generated = await text.generateText({
      purpose: IMAGE_PROMPT_VERSION,
      system: IMAGE_BRIEF_SYSTEM_PROMPT,
      user: buildImageBriefUserPrompt({ profile, persona: persona.persona, post }),
    });
    const parsed = imageBriefPayloadSchema.safeParse(parseJsonObject(generated.text));
    if (!parsed.success) {
      throw malformedAiOutput(
        "The model returned a creative brief that did not match the required structure.",
      );
    }
    const brief = parsed.data;

    // Reference photos are best-effort: a missing or unreadable file should not
    // block image generation, just fall back to no reference for that photo.
    const referenceImages: ImageReference[] = [];
    for (const photo of profile.photos) {
      try {
        const file = await this.profiles.getPhotoFile(photo.id);
        referenceImages.push({ bytes: file.bytes, mimeType: file.mimeType });
      } catch {
        continue;
      }
    }

    const images = resolveImageProvider(this.imageProviders, this.defaultImageProvider, imageProvider);
    const result = await images.generateImage({
      prompt: brief.imagePrompt,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    });

    const { key } = await this.storage.put({
      bytes: result.bytes,
      mimeType: result.mimeType,
      extension: MIME_EXTENSION[result.mimeType] ?? "png",
    });

    const row = await this.repo.create({
      postId: post.id,
      briefPayload: brief,
      prompt: brief.imagePrompt,
      storageKey: key,
      mimeType: result.mimeType,
      sizeBytes: result.bytes.byteLength,
      model: result.model,
      promptVersion: IMAGE_PROMPT_VERSION,
    });
    if (!row) {
      throw malformedAiOutput("The image could not be saved.");
    }
    return this.toPublic(row);
  }

  async getLatestForPost(postId: string): Promise<ImagePublic | null> {
    const row = await this.repo.getLatestForPost(postId);
    if (!row) {
      return null;
    }
    return this.toPublic(row);
  }

  async getImageFile(imageId: string): Promise<StorageObject | null> {
    const row = await this.repo.getById(imageId);
    if (!row) {
      return null;
    }
    return this.storage.get(row.storageKey);
  }

  private toPublic(row: NonNullable<Awaited<ReturnType<ImageRepository["getById"]>>>): ImagePublic {
    return {
      id: row.id,
      postId: row.postId,
      url: `/api/images/${row.id}`,
      model: row.model,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
