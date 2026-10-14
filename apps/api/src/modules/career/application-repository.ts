import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { applicationEvents, applications, approvals } from "../../db/schema.js";

export type ApplicationRow = typeof applications.$inferSelect;
export type ApplicationEventRow = typeof applicationEvents.$inferSelect;
export type ApprovalRow = typeof approvals.$inferSelect;
export type NewApproval = Pick<ApprovalRow, "payloadHash" | "destinationUrl" | "documentIds" | "formRevision" | "decidedAt" | "expiresAt">;

export type NewApplication = Pick<ApplicationRow, "jobId" | "status" | "mode" | "portal" | "destinationUrl">;
export type ApplicationPatch = Partial<Pick<ApplicationRow, "mode" | "portal" | "destinationUrl" | "lastError" | "formSnapshot" | "fieldPlan" | "preview" | "payloadHash">>;
export type TransitionRecord = { actor: string; reason: string };

// Every status write goes with its event in one transaction, and a transition only applies
// when the row is still in the status it was read in, so two writers cannot both win.
//
// Approvals (Milestone 4): any transition to a state other than the submission's own
// (SUBMITTING, SUBMITTED, SUBMISSION_UNKNOWN) invalidates the live approval in the same
// transaction, so preparing again, rejecting, withdrawing or a mismatch found before the
// click can never leave an approval behind that a later run could use.
const KEEPS_APPROVAL = new Set(["SUBMITTING", "SUBMITTED", "SUBMISSION_UNKNOWN"]);
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
      if (!KEEPS_APPROVAL.has(to)) {
        await tx
          .update(approvals)
          .set({ invalidatedAt: new Date(), invalidationReason: record.reason })
          .where(and(eq(approvals.applicationId, id), isNull(approvals.invalidatedAt)));
      }
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

  // READY_FOR_REVIEW to APPROVED and the approval row, together. Returns null when the
  // application left READY_FOR_REVIEW in the meantime.
  async approve(id: string, record: TransitionRecord, approval: NewApproval): Promise<{ row: ApplicationRow; approval: ApprovalRow } | null> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(applications)
        .set({ status: "APPROVED", updatedAt: new Date() })
        .where(and(eq(applications.id, id), eq(applications.status, "READY_FOR_REVIEW")))
        .returning();
      if (!row) return null;
      const [created] = await tx.insert(approvals).values({ id: randomUUID(), applicationId: id, ...approval }).returning();
      await tx.insert(applicationEvents).values({
        id: randomUUID(),
        applicationId: id,
        fromStatus: "READY_FOR_REVIEW",
        toStatus: "APPROVED",
        actor: record.actor,
        reason: record.reason,
      });
      return { row, approval: created! };
    });
  }

  // The approval not yet invalidated, if any.
  async liveApproval(applicationId: string): Promise<ApprovalRow | null> {
    const [row] = await this.db
      .select()
      .from(approvals)
      .where(and(eq(approvals.applicationId, applicationId), isNull(approvals.invalidatedAt)))
      .orderBy(desc(approvals.decidedAt))
      .limit(1);
    return row ?? null;
  }

  // Not a status change: consent the user gave for this application's next run.
  async setAgreed(id: string, agreed: string[]): Promise<void> {
    await this.db.update(applications).set({ agreed }).where(eq(applications.id, id));
  }

  async agreedForJob(jobId: string): Promise<string[]> {
    const [row] = await this.db.select({ agreed: applications.agreed }).from(applications).where(eq(applications.jobId, jobId)).limit(1);
    return row?.agreed ?? [];
  }

  // Applications whose preview screenshot was taken before the cutoff (retention).
  async withScreenshotsBefore(cutoff: Date): Promise<ApplicationRow[]> {
    return this.db
      .select()
      .from(applications)
      .where(
        and(
          isNotNull(applications.preview),
          sql`${applications.preview}->>'screenshotKey' IS NOT NULL`,
          sql`(${applications.preview}->>'capturedAt')::timestamptz < ${cutoff.toISOString()}::timestamptz`,
        ),
      );
  }

  // Not a status change: only the screenshot reference goes, the preview's counts stay.
  async clearScreenshot(id: string): Promise<void> {
    await this.db
      .update(applications)
      .set({ preview: sql`jsonb_set(${applications.preview}, '{screenshotKey}', 'null'::jsonb)` })
      .where(eq(applications.id, id));
  }

  async events(applicationId: string): Promise<ApplicationEventRow[]> {
    return this.db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, applicationId))
      .orderBy(asc(applicationEvents.createdAt));
  }
}
