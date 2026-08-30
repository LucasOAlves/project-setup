import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ContentPlanStatus } from "@studio/shared";
import type { Database } from "../../db/client.js";
import { contentPlanTopics } from "../../db/schema.js";

export type ContentPlanStatusRow = typeof contentPlanTopics.$inferSelect;

export class ContentPlanRepository {
  constructor(private readonly db: Database) {}

  async listStatuses(): Promise<Map<string, ContentPlanStatusRow>> {
    const rows = await this.db.select().from(contentPlanTopics);
    return new Map(rows.map((row) => [row.topicId, row]));
  }

  async upsertStatus(
    topicId: string,
    patch: {
      status: ContentPlanStatus;
      contentOpportunityId?: string | null;
      generatedPostId?: string | null;
    },
  ): Promise<ContentPlanStatusRow> {
    const [existing] = await this.db
      .select()
      .from(contentPlanTopics)
      .where(eq(contentPlanTopics.topicId, topicId))
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(contentPlanTopics)
        .set({
          status: patch.status,
          ...(patch.contentOpportunityId !== undefined
            ? { contentOpportunityId: patch.contentOpportunityId }
            : {}),
          ...(patch.generatedPostId !== undefined
            ? { generatedPostId: patch.generatedPostId }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(contentPlanTopics.id, existing.id))
        .returning();
      if (!updated) {
        throw new Error("content plan topic update failed");
      }
      return updated;
    }

    const [created] = await this.db
      .insert(contentPlanTopics)
      .values({
        id: randomUUID(),
        topicId,
        status: patch.status,
        contentOpportunityId: patch.contentOpportunityId ?? null,
        generatedPostId: patch.generatedPostId ?? null,
      })
      .returning();
    if (!created) {
      throw new Error("content plan topic insert failed");
    }
    return created;
  }
}
