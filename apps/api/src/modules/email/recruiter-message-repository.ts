import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { applications, companies, jobs, recruiterMessages } from "../../db/schema.js";

export type RecruiterMessageRow = typeof recruiterMessages.$inferSelect;
export type NewRecruiterMessage = Pick<RecruiterMessageRow, "source" | "providerMessageId" | "applicationId" | "senderDomain" | "subject" | "body" | "receivedAt" | "matchConfidence" | "matchReason">;

// Applications whose replies are followed: the ones that went out, or may have.
const FOLLOWED = ["SUBMITTED", "SUBMISSION_UNKNOWN"];

export class RecruiterMessageRepository {
  constructor(private readonly db: Database) {}

  async followedApplications(): Promise<Array<{ applicationId: string; jobTitle: string; company: string; website: string; submittedAt: Date }>> {
    const rows = await this.db
      .select({
        applicationId: applications.id,
        jobTitle: jobs.title,
        company: companies.name,
        website: companies.website,
        submittedAt: applications.submittedAt,
        updatedAt: applications.updatedAt,
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(inArray(applications.status, FOLLOWED));
    return rows.map(({ updatedAt, submittedAt, ...row }) => ({ ...row, submittedAt: submittedAt ?? updatedAt }));
  }

  async knownProviderIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ id: recruiterMessages.providerMessageId })
      .from(recruiterMessages)
      .where(inArray(recruiterMessages.providerMessageId, ids));
    return new Set(rows.map((row) => row.id).filter((id): id is string => Boolean(id)));
  }

  // A second insert of the same Gmail message is ignored.
  async insert(input: NewRecruiterMessage): Promise<RecruiterMessageRow | null> {
    const [row] = await this.db
      .insert(recruiterMessages)
      .values({ id: randomUUID(), ...input })
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  async forApplication(applicationId: string): Promise<RecruiterMessageRow[]> {
    return this.db
      .select()
      .from(recruiterMessages)
      .where(eq(recruiterMessages.applicationId, applicationId))
      .orderBy(asc(recruiterMessages.receivedAt));
  }

  async setClassification(
    id: string,
    result: { classification: string; evidence: string; classifiedBy: string; suggestedStatus: string },
  ): Promise<RecruiterMessageRow | null> {
    const [row] = await this.db
      .update(recruiterMessages)
      .set({ classification: result.classification, evidence: result.evidence, classifiedBy: result.classifiedBy, suggestedStatus: result.suggestedStatus })
      .where(eq(recruiterMessages.id, id))
      .returning();
    return row ?? null;
  }

  // The job behind an application, with its pursuit status.
  async jobFor(applicationId: string): Promise<{ jobId: string; status: string } | null> {
    const [row] = await this.db
      .select({ jobId: jobs.id, status: jobs.status })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(eq(applications.id, applicationId));
    return row ?? null;
  }

  // Sent applications with their job's pursuit status, newest first.
  async sentApplications(): Promise<Array<{ applicationId: string; applicationStatus: string; submittedAt: Date; jobId: string; jobTitle: string; jobStatus: string; company: string }>> {
    const rows = await this.db
      .select({
        applicationId: applications.id,
        applicationStatus: applications.status,
        submittedAt: applications.submittedAt,
        updatedAt: applications.updatedAt,
        jobId: jobs.id,
        jobTitle: jobs.title,
        jobStatus: jobs.status,
        company: companies.name,
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(inArray(applications.status, FOLLOWED));
    return rows
      .map(({ updatedAt, submittedAt, ...row }) => ({ ...row, submittedAt: submittedAt ?? updatedAt }))
      .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
  }

  async forApplications(applicationIds: string[]): Promise<RecruiterMessageRow[]> {
    if (applicationIds.length === 0) return [];
    return this.db
      .select()
      .from(recruiterMessages)
      .where(inArray(recruiterMessages.applicationId, applicationIds))
      .orderBy(asc(recruiterMessages.receivedAt));
  }

  async get(id: string): Promise<RecruiterMessageRow | null> {
    const [row] = await this.db.select().from(recruiterMessages).where(eq(recruiterMessages.id, id));
    return row ?? null;
  }

  // Records the user's answer to a suggestion, once: a decided message is left as it is.
  async decide(id: string, decision: string, at: Date): Promise<RecruiterMessageRow | null> {
    const [row] = await this.db
      .update(recruiterMessages)
      .set({ decision, decidedAt: at })
      .where(and(eq(recruiterMessages.id, id), eq(recruiterMessages.decision, "")))
      .returning();
    return row ?? null;
  }

  // Retention (Milestone 6): the text goes, the classification and evidence quote stay. A
  // pasted message without a received date counts from when it was stored.
  async clearBodiesBefore(cutoff: Date): Promise<number> {
    const rows = await this.db
      .update(recruiterMessages)
      .set({ body: null })
      .where(and(isNotNull(recruiterMessages.body), sql`COALESCE(${recruiterMessages.receivedAt}, ${recruiterMessages.createdAt}) < ${cutoff.toISOString()}::timestamptz`))
      .returning({ id: recruiterMessages.id });
    return rows.length;
  }

  // Gmail ids of messages that matched no application, kept only so a search does not open
  // them again; after the cutoff the search can no longer find them.
  async deleteUnmatchedBefore(cutoff: Date): Promise<number> {
    const rows = await this.db
      .delete(recruiterMessages)
      .where(and(eq(recruiterMessages.source, "GMAIL"), isNull(recruiterMessages.applicationId), isNull(recruiterMessages.body), lt(recruiterMessages.createdAt, cutoff)))
      .returning({ id: recruiterMessages.id });
    return rows.length;
  }
}
