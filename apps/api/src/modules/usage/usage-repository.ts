import { randomUUID } from "node:crypto";
import { gte, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { aiUsage } from "../../db/schema.js";

export type AiUsageRow = typeof aiUsage.$inferSelect;
export type NewAiUsage = Omit<AiUsageRow, "id" | "createdAt">;

export class UsageRepository {
  constructor(private readonly db: Database) {}

  async insert(input: NewAiUsage): Promise<void> {
    await this.db.insert(aiUsage).values({ id: randomUUID(), ...input });
  }

  async spentSince(since: Date): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${aiUsage.estimatedUsd}), 0)` })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, since));
    return Number(row?.total ?? 0);
  }
}
