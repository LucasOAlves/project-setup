import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lt, notInArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { applications, companies, jobEvaluations, jobs, notifications } from "../../db/schema.js";

export class NotificationRepository {
  constructor(private readonly db: Database) {}

  // Claims a notification key. False when it was already claimed, so each event is sent once.
  async claim(key: string, kind: string): Promise<boolean> {
    const [row] = await this.db.insert(notifications).values({ id: randomUUID(), key, kind, status: "PENDING" }).onConflictDoNothing().returning({ id: notifications.id });
    return Boolean(row);
  }

  // Retention (Milestone 6): send records older than the cutoff, except the kinds kept.
  async pruneBefore(cutoff: Date, keptKinds: string[]): Promise<number> {
    const rows = await this.db
      .delete(notifications)
      .where(and(lt(notifications.createdAt, cutoff), keptKinds.length > 0 ? notInArray(notifications.kind, keptKinds) : undefined))
      .returning({ id: notifications.id });
    return rows.length;
  }

  async finish(key: string, status: "SENT" | "FAILED", error = ""): Promise<void> {
    await this.db.update(notifications).set({ status, error, sentAt: new Date() }).where(eq(notifications.key, key));
  }

  async applicationJob(applicationId: string): Promise<{ title: string; company: string } | null> {
    const [row] = await this.db
      .select({ title: jobs.title, company: companies.name })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(eq(applications.id, applicationId));
    return row ?? null;
  }

  // Jobs evaluated since `since` at `minScore` or more, still before applying, best score each.
  async highScoresSince(since: Date, minScore: number): Promise<Array<{ jobId: string; title: string; company: string; url: string; score: number }>> {
    const rows = await this.db
      .select({ jobId: jobs.id, title: jobs.title, company: companies.name, url: jobs.url, score: jobEvaluations.score })
      .from(jobEvaluations)
      .innerJoin(jobs, eq(jobs.id, jobEvaluations.jobId))
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(gte(jobEvaluations.createdAt, since), gte(jobEvaluations.score, minScore), inArray(jobs.status, ["SAVED", "SHORTLISTED"])))
      .orderBy(desc(jobEvaluations.score));
    const best = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (!best.has(row.jobId)) best.set(row.jobId, row);
    return [...best.values()].map((row) => ({ ...row, score: row.score ?? 0 }));
  }
}
