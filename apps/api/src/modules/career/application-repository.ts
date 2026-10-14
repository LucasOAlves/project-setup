import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { applicationEvents, applications } from "../../db/schema.js";

export type ApplicationRow = typeof applications.$inferSelect;
export type ApplicationEventRow = typeof applicationEvents.$inferSelect;

export type NewApplication = Pick<ApplicationRow, "jobId" | "status" | "mode" | "portal" | "destinationUrl">;
export type ApplicationPatch = Partial<Pick<ApplicationRow, "mode" | "portal" | "destinationUrl" | "lastError" | "formSnapshot">>;
export type TransitionRecord = { actor: string; reason: string };

// Every status write goes with its event in one transaction, and a transition only applies
// when the row is still in the status it was read in, so two writers cannot both win.
export class ApplicationRepository {
  constructor(private readonly db: Database) {}

  async get(id: string): Promise<ApplicationRow | null> {
    const [row] = await this.db.select().from(applications).where(eq(applications.id, id)).limit(1);
    return row ?? null;
  }

  async findByJob(jobId: string): Promise<ApplicationRow | null> {
    const [row] = await this.db.select().from(applications).where(eq(applications.jobId, jobId)).limit(1);
    return row ?? null;
  }

  // Returns null when another request created the job's application first.
  async create(input: NewApplication, record: TransitionRecord): Promise<ApplicationRow | null> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(applications)
        .values({ id: randomUUID(), ...input })
        .onConflictDoNothing({ target: applications.jobId })
        .returning();
      if (!row) return null;
      await tx.insert(applicationEvents).values({
        id: randomUUID(),
        applicationId: row.id,
        fromStatus: null,
        toStatus: row.status,
        actor: record.actor,
        reason: record.reason,
      });
      return row;
    });
  }

  // Returns null when the status changed since it was read.
  async transition(
    id: string,
    from: string,
    to: string,
    record: TransitionRecord,
    patch: ApplicationPatch = {},
  ): Promise<ApplicationRow | null> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(applications)
        .set({ ...patch, status: to, updatedAt: new Date() })
        .where(and(eq(applications.id, id), eq(applications.status, from)))
        .returning();
      if (!row) return null;
      await tx.insert(applicationEvents).values({
        id: randomUUID(),
        applicationId: id,
        fromStatus: from,
        toStatus: to,
        actor: record.actor,
        reason: record.reason,
      });
      return row;
    });
  }

  async events(applicationId: string): Promise<ApplicationEventRow[]> {
    return this.db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, applicationId))
      .orderBy(asc(applicationEvents.createdAt));
  }
}
