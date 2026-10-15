import { auditEventQuerySchema, type AuditEventPublic, type DataSafety, type FeedbackSummary, type OperationsReport, type WorkerRun } from "@studio/shared";
import { validationError } from "../../app-error.js";
import type { UsageLedger } from "../usage/usage-ledger.js";
import { funnel, funnelBy, medianDaysToFirstReply, scoreBand, weightSuggestions } from "./operations-metrics.js";
import type { OperationsRepository } from "./operations-repository.js";

type Repo = Pick<OperationsRepository, "funnelJobs" | "costs" | "auditEvents" | "lastWorkerRun">;

export type DataSafetySettings = Pick<DataSafety, "retention" | "backups">;

const COST_MONTHS = 6;

// The Operations step (Milestone 5, ticket 8): where applications convert, what the models
// cost, and who did what. Read-only.
export class OperationsService {
  constructor(
    private readonly repo: Repo,
    private readonly usage: Pick<UsageLedger, "summary">,
    private readonly feedbackSummary: () => Promise<FeedbackSummary | null>,
    private readonly dataSafety: DataSafetySettings,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async report(): Promise<OperationsReport> {
    const jobs = await this.repo.funnelJobs();
    const byScoreBand = funnelBy(jobs, (job) => scoreBand(job.score));
    const now = this.now();
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (COST_MONTHS - 1), 1));
    const [costs, budget, feedback, lastRetention, lastBackup] = await Promise.all([
      this.repo.costs(since),
      this.usage.summary(),
      this.feedbackSummary().catch(() => null),
      this.repo.lastWorkerRun("retention"),
      this.repo.lastWorkerRun("backup"),
    ]);
    return {
      funnel: funnel(jobs),
      bySource: funnelBy(jobs, (job) => job.source),
      byScoreBand,
      byPortal: funnelBy(jobs, (job) => job.portal),
      medianDaysToFirstReply: medianDaysToFirstReply(jobs),
      costs,
      budget,
      suggestions: weightSuggestions(byScoreBand, feedback),
      dataSafety: { ...this.dataSafety, lastRetention: toWorkerRun(lastRetention), lastBackup: toWorkerRun(lastBackup) },
    };
  }

  async auditEvents(rawQuery: unknown): Promise<AuditEventPublic[]> {
    const query = auditEventQuerySchema.safeParse(rawQuery ?? {});
    if (!query.success) throw validationError("Invalid audit filter.");
    const rows = await this.repo.auditEvents(query.data);
    return rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      actor: row.actor,
      entityType: row.entityType,
      entityId: row.entityId,
      correlationId: row.correlationId,
      payload: row.payload,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }
}

type RunRow = { eventType: string; payload: Record<string, unknown>; occurredAt: Date } | null;

// A completed run shows its counts; a failed one its error message.
function toWorkerRun(row: RunRow): WorkerRun | null {
  if (!row) return null;
  const ok = row.eventType === "WORKER_JOB_COMPLETED";
  const source = ok ? row.payload.result : row.payload.error;
  const summary: WorkerRun["summary"] = {};
  if (source && typeof source === "object") {
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") summary[key] = value;
    }
  }
  return { at: row.occurredAt.toISOString(), ok, summary };
}
