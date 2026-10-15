import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, lt } from "drizzle-orm";
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

  async setClassification(id: string, result: { classification: string; evidence: string; classifiedBy: string }): Promise<RecruiterMessageRow | null> {
    const [row] = await this.db
      .update(recruiterMessages)
      .set({ classification: result.classification, evidence: result.evidence, classifiedBy: result.classifiedBy })
      .where(eq(recruiterMessages.id, id))
      .returning();
    return row ?? null;
  }

  // Retention: the text goes, the classification and evidence quote stay.
  async clearBodiesBefore(cutoff: Date): Promise<void> {
    await this.db
      .update(recruiterMessages)
      .set({ body: null })
      .where(and(isNotNull(recruiterMessages.body), lt(recruiterMessages.receivedAt, cutoff)));
  }
}
