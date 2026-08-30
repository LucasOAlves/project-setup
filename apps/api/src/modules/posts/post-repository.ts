import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type {
  AngleType,
  FactReview,
  PostHistorySortField,
  PostOutcome,
  PostStatus,
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

  async getById(id: string) {
    const [post] = await this.db
      .select()
      .from(generatedPosts)
      .where(
        and(eq(generatedPosts.id, id), eq(generatedPosts.profileId, WORKSPACE_PROFILE_ID)),
      )
      .limit(1);
    return post ?? null;
  }

  async listAll(params: {
    page: number;
    pageSize: number;
    search?: string;
    sortBy: PostHistorySortField;
    sortDir: "asc" | "desc";
    opportunityId?: string;
  }) {
    const conditions = [eq(generatedPosts.profileId, WORKSPACE_PROFILE_ID)];
    if (params.search) {
      const term = `%${params.search}%`;
      conditions.push(
        or(ilike(generatedPosts.hook, term), ilike(generatedPosts.body, term)) as SQL,
      );
    }
    if (params.opportunityId) {
      conditions.push(eq(generatedPosts.opportunityId, params.opportunityId));
    }
    const where = and(...conditions);

    const orderColumn =
      params.sortBy === "score"
        ? sql`(${generatedPosts.quality}->>'score')::int`
        : params.sortBy === "status"
          ? generatedPosts.status
          : generatedPosts.createdAt;
    const orderExpr = params.sortDir === "asc" ? asc(orderColumn) : desc(orderColumn);

    const rows = await this.db
      .select()
      .from(generatedPosts)
      .where(where)
      .orderBy(orderExpr)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize);

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(generatedPosts)
      .where(where);

    return { rows, total: countRow?.count ?? 0 };
  }

  async updateTracking(
    id: string,
    patch: {
      status?: PostStatus;
      outcome?: PostOutcome | null;
      outcomeNotes?: string | null;
      publishedAt?: Date | null;
    },
  ) {
    const [post] = await this.db
      .update(generatedPosts)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.outcome !== undefined ? { outcome: patch.outcome } : {}),
        ...(patch.outcomeNotes !== undefined ? { outcomeNotes: patch.outcomeNotes } : {}),
        ...(patch.publishedAt !== undefined ? { publishedAt: patch.publishedAt } : {}),
      })
      .where(
        and(eq(generatedPosts.id, id), eq(generatedPosts.profileId, WORKSPACE_PROFILE_ID)),
      )
      .returning();
    return post ?? null;
  }
}
