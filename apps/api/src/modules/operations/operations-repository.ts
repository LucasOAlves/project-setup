import { and, desc, eq, gte, inArray, lt, notInArray, sql, type SQL } from "drizzle-orm";
import { detectBoardReference, type AuditEventQuery } from "@studio/shared";
import type { Database } from "../../db/client.js";
import { aiUsage, applications, auditEvents, jobEvaluations, jobStatusEvents, jobs, recruiterMessages } from "../../db/schema.js";
import type { FunnelJob } from "./operations-metrics.js";

// Classes that are not a reply from a person.
const NOT_A_REPLY = ["APPLICATION_RECEIVED", ""];

export class OperationsRepository {
  constructor(private readonly db: Database) {}

  // Every job with what the funnel needs. Assembled in code: one user, a few thousand jobs.
  async funnelJobs(): Promise<FunnelJob[]> {
    const [jobRows, scores, events, apps, replies] = await Promise.all([
      this.db.select({ id: jobs.id, source: jobs.source, status: jobs.status, url: jobs.url }).from(jobs),
      this.db.select({ jobId: jobEvaluations.jobId, score: jobEvaluations.score }).from(jobEvaluations).orderBy(desc(jobEvaluations.createdAt)),
      this.db.select({ jobId: jobStatusEvents.jobId, status: jobStatusEvents.status }).from(jobStatusEvents),
      this.db.select({ id: applications.id, jobId: applications.jobId, portal: applications.portal, submittedAt: applications.submittedAt }).from(applications),
      this.db
        .select({ applicationId: recruiterMessages.applicationId, first: sql<Date>`MIN(${recruiterMessages.receivedAt})` })
        .from(recruiterMessages)
        .where(notInArray(recruiterMessages.classification, NOT_A_REPLY))
        .groupBy(recruiterMessages.applicationId),
    ]);
    const latestScore = new Map<string, number | null>();
    for (const row of scores) if (!latestScore.has(row.jobId)) latestScore.set(row.jobId, row.score);
    const statuses = new Map<string, string[]>();
    for (const row of events) statuses.set(row.jobId, [...(statuses.get(row.jobId) ?? []), row.status]);
    const appByJob = new Map(apps.map((row) => [row.jobId, row]));
    const firstReply = new Map(replies.filter((row) => row.applicationId).map((row) => [row.applicationId!, row.first ? new Date(row.first) : null]));

    return jobRows.map((job) => {
      const app = appByJob.get(job.id);
      return {
        source: job.source,
        portal: app?.portal ?? detectBoardReference(job.url)?.source ?? "other",
        score: latestScore.get(job.id) ?? null,
        statuses: [job.status, ...(statuses.get(job.id) ?? [])],
        submittedAt: app?.submittedAt ?? null,
        firstReplyAt: app ? (firstReply.get(app.id) ?? null) : null,
      };
    });
  }

  // Estimated cost per month and purpose, newest month first.
  async costs(since: Date): Promise<Array<{ month: string; purpose: string; usd: number; calls: number }>> {
    const month = sql<string>`to_char(${aiUsage.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM')`;
    const rows = await this.db
      .select({ month, purpose: aiUsage.purpose, usd: sql<string>`SUM(${aiUsage.estimatedUsd})`, calls: sql<string>`COUNT(*)` })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, since))
      .groupBy(month, aiUsage.purpose)
      .orderBy(desc(month), desc(sql`SUM(${aiUsage.estimatedUsd})`));
    return rows.map((row) => ({ month: row.month, purpose: row.purpose, usd: Number(row.usd), calls: Number(row.calls) }));
  }

  // The latest completed or failed run of a main-worker job (backup, retention), from the
  // audit events the worker writes for every job.
  async lastWorkerRun(job: string) {
    const [row] = await this.db
      .select({ eventType: auditEvents.eventType, payload: auditEvents.payload, occurredAt: auditEvents.occurredAt })
      .from(auditEvents)
      .where(and(inArray(auditEvents.eventType, ["WORKER_JOB_COMPLETED", "WORKER_JOB_FAILED"]), sql`${auditEvents.payload}->>'job' = ${job}`))
      .orderBy(desc(auditEvents.occurredAt))
      .limit(1);
    return row ?? null;
  }

  async auditEvents(query: AuditEventQuery) {
    const filters: SQL[] = [];
    if (query.eventType) filters.push(eq(auditEvents.eventType, query.eventType));
    if (query.actor) filters.push(eq(auditEvents.actor, query.actor));
    if (query.entityType) filters.push(eq(auditEvents.entityType, query.entityType));
    if (query.entityId) filters.push(eq(auditEvents.entityId, query.entityId));
    if (query.before) filters.push(lt(auditEvents.occurredAt, new Date(query.before)));
    return this.db
      .select()
      .from(auditEvents)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(auditEvents.occurredAt))
      .limit(query.limit);
  }
}
