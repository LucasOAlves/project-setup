import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { applicationDocuments } from "../../db/schema.js";

export type ApplicationDocumentRow = typeof applicationDocuments.$inferSelect;
export type NewApplicationDocument = Omit<ApplicationDocumentRow, "id" | "createdAt">;

// Insert and read only: a saved version is never changed.
export class ApplicationDocumentRepository {
  constructor(private readonly db: Database) {}

  async latest(jobId: string, type: string): Promise<ApplicationDocumentRow | null> {
    const [row] = await this.db
      .select()
      .from(applicationDocuments)
      .where(and(eq(applicationDocuments.jobId, jobId), eq(applicationDocuments.type, type)))
      .orderBy(desc(applicationDocuments.version))
      .limit(1);
    return row ?? null;
  }

  async insert(input: NewApplicationDocument): Promise<ApplicationDocumentRow> {
    const [row] = await this.db
      .insert(applicationDocuments)
      .values({ id: randomUUID(), ...input })
      .returning();
    if (!row) {
      throw new Error("application document insert failed");
    }
    return row;
  }

  async listForJob(jobId: string): Promise<ApplicationDocumentRow[]> {
    return this.db
      .select()
      .from(applicationDocuments)
      .where(eq(applicationDocuments.jobId, jobId))
      .orderBy(asc(applicationDocuments.type), desc(applicationDocuments.version));
  }

  async get(id: string): Promise<ApplicationDocumentRow | null> {
    const [row] = await this.db.select().from(applicationDocuments).where(eq(applicationDocuments.id, id)).limit(1);
    return row ?? null;
  }
}
