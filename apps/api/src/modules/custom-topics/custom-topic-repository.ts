import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { CustomTopicInput } from "@studio/shared";
import type { Database } from "../../db/client.js";
import { customTopics } from "../../db/schema.js";

export class CustomTopicRepository {
  constructor(private readonly db: Database) {}

  async list() {
    return this.db.select().from(customTopics).orderBy(desc(customTopics.createdAt));
  }

  async getById(id: string) {
    const [row] = await this.db.select().from(customTopics).where(eq(customTopics.id, id)).limit(1);
    return row ?? null;
  }

  async create(input: CustomTopicInput) {
    const [row] = await this.db
      .insert(customTopics)
      .values({
        id: randomUUID(),
        title: input.title,
        hook: input.hook,
        objective: input.objective ?? "",
        keyPoints: input.keyPoints,
        cta: input.cta ?? "",
        angle: input.angle,
        pillar: input.pillar ?? "",
        sourceUrl: input.sourceUrl ?? null,
      })
      .returning();
    if (!row) {
      throw new Error("custom topic insert failed");
    }
    return row;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(customTopics).where(eq(customTopics.id, id));
  }

  async updateStatus(
    id: string,
    patch: { status: string; contentOpportunityId?: string | null },
  ) {
    const [row] = await this.db
      .update(customTopics)
      .set({
        status: patch.status,
        ...(patch.contentOpportunityId !== undefined
          ? { contentOpportunityId: patch.contentOpportunityId }
          : {}),
      })
      .where(eq(customTopics.id, id))
      .returning();
    return row ?? null;
  }
}

export type CustomTopicRow = Awaited<ReturnType<CustomTopicRepository["getById"]>>;
