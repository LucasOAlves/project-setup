import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type {
  AngleType,
  FactReview,
  QualityScore,
  SeoReview,
  StoryStrategy,
  WritingReview,
  WritingTone,
} from "@studio/shared";
import type { Database } from "../../db/client.js";
import { generatedPosts } from "../../db/schema.js";
import { WORKSPACE_PROFILE_ID } from "../profile/profile-repository.js";

export class PostRepository {
  constructor(private readonly db: Database) {}

  async getLatest() {
    const [post] = await this.db
      .select()
      .from(generatedPosts)
      .where(eq(generatedPosts.profileId, WORKSPACE_PROFILE_ID))
      .orderBy(desc(generatedPosts.createdAt))
      .limit(1);
    return post ?? null;
  }

  async create(input: {
    opportunityId: string;
    promptVersion: string;
    model: string;
    tone: WritingTone;
    angle: AngleType;
    hook: string;
    body: string;
    storyStrategy: StoryStrategy;
    writingReview: WritingReview;
    factReview: FactReview;
    seoReview: SeoReview;
    quality: QualityScore;
  }) {
    const [post] = await this.db
      .insert(generatedPosts)
      .values({
        id: randomUUID(),
        profileId: WORKSPACE_PROFILE_ID,
        opportunityId: input.opportunityId,
        promptVersion: input.promptVersion,
        model: input.model,
        tone: input.tone,
        angle: input.angle,
        hook: input.hook,
        body: input.body,
        storyStrategy: input.storyStrategy,
        writingReview: input.writingReview,
        factReview: input.factReview,
        seoReview: input.seoReview,
        quality: input.quality,
      })
      .returning();
    return post ?? null;
  }
}
