import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { ImageBriefPayload } from "@studio/shared";
import type { Database } from "../../db/client.js";
import { generatedImages } from "../../db/schema.js";

export class ImageRepository {
  constructor(private readonly db: Database) {}

  async getLatestForPost(postId: string) {
    const [row] = await this.db
      .select()
      .from(generatedImages)
      .where(eq(generatedImages.postId, postId))
      .orderBy(desc(generatedImages.createdAt))
      .limit(1);
    return row ?? null;
  }

  async getById(id: string) {
    const [row] = await this.db
      .select()
      .from(generatedImages)
      .where(eq(generatedImages.id, id))
      .limit(1);
    return row ?? null;
  }

  async create(input: {
    postId: string;
    briefPayload: ImageBriefPayload;
    prompt: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    model: string;
    promptVersion: string;
  }) {
    const [row] = await this.db
      .insert(generatedImages)
      .values({
        id: randomUUID(),
        postId: input.postId,
        briefPayload: input.briefPayload,
        prompt: input.prompt,
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        model: input.model,
        promptVersion: input.promptVersion,
      })
      .returning();
    return row ?? null;
  }
}
