import { sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { savedFormAnswers } from "../../db/schema.js";

export type SavedAnswer = { questionKey: string; label: string; answer: string };

// Answers the user gave to form questions, one per normalized question.
export class SavedAnswerRepository {
  constructor(private readonly db: Database) {}

  async all(): Promise<Record<string, string>> {
    const rows = await this.db.select().from(savedFormAnswers);
    return Object.fromEntries(rows.map((row) => [row.questionKey, row.answer]));
  }

  async upsert(answers: SavedAnswer[]): Promise<void> {
    if (answers.length === 0) return;
    await this.db
      .insert(savedFormAnswers)
      .values(answers.map((answer) => ({ ...answer, updatedAt: new Date() })))
      .onConflictDoUpdate({
        target: savedFormAnswers.questionKey,
        set: { label: sql`excluded.label`, answer: sql`excluded.answer`, updatedAt: sql`excluded.updated_at` },
      });
  }

  async remove(questionKey: string): Promise<void> {
    await this.db.delete(savedFormAnswers).where(sql`${savedFormAnswers.questionKey} = ${questionKey}`);
  }
}
