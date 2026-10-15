import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuditEventQuery } from "@studio/shared";
import { OperationsService } from "./operations-service.js";

const NOW = new Date("2026-10-15T12:00:00Z");

function setup() {
  const queries: AuditEventQuery[] = [];
  let costsSince: Date | null = null;
  const repo = {
    async funnelJobs() {
      return [
        { source: "remotive", portal: "greenhouse", score: 85, statuses: ["APPLIED", "INTERVIEW"], submittedAt: new Date("2026-10-01T00:00:00Z"), firstReplyAt: new Date("2026-10-03T00:00:00Z") },
        { source: "brave", portal: "other", score: null, statuses: ["SAVED"], submittedAt: null, firstReplyAt: null },
      ];
    },
    async costs(since: Date) {
      costsSince = since;
      return [{ month: "2026-10", purpose: "job-explanation", usd: 0.42, calls: 30 }];
    },
    async lastWorkerRun(job: string) {
      if (job === "retention") return { eventType: "WORKER_JOB_COMPLETED", payload: { job, result: { screenshots: 2, messageBodies: 0 } }, occurredAt: NOW };
      return { eventType: "WORKER_JOB_FAILED", payload: { job, error: { name: "Error", message: "disk full" } }, occurredAt: NOW };
    },
    async auditEvents(query: AuditEventQuery) {
      queries.push(query);
      return [{ id: "e1", eventType: "SUBMISSION_FINISHED", actor: "WORKER", entityType: "application", entityId: "a1", correlationId: "", payload: { outcome: "SUBMITTED" }, occurredAt: NOW }];
    },
  };
  const usage = { summary: async () => ({ month: "2026-10", spentUsd: 0.42, budgetUsd: 10, state: "OK" as const }) };
  const dataSafety = { retention: { screenshotDays: 30, messageBodyDays: 180, unmatchedMessageDays: 60, notificationDays: 180 }, backups: { enabled: true, keep: 7 } };
  const service = new OperationsService(repo, usage, async () => null, dataSafety, () => NOW);
  return { service, queries, since: () => costsSince };
}

test("the report has the funnel, conversion groups, reply time, six months of cost and the budget", async () => {
  const { service, since } = setup();
  const report = await service.report();
  assert.deepEqual(report.funnel.map((stage) => stage.count), [2, 1, 1, 1, 1, 0]);
  assert.deepEqual(report.byScoreBand.map((band) => band.key).sort(), ["80-89", "unscored"]);
  assert.deepEqual(report.byPortal.map((group) => group.key).sort(), ["greenhouse", "other"]);
  assert.equal(report.medianDaysToFirstReply, 2);
  assert.equal(report.costs[0]?.usd, 0.42);
  assert.equal(report.budget.state, "OK");
  assert.deepEqual(report.suggestions, []);
  assert.equal(since()?.toISOString(), "2026-05-01T00:00:00.000Z");
});

test("audit events are filtered and paged, and a bad filter is refused", async () => {
  const { service, queries } = setup();
  const events = await service.auditEvents({ actor: "WORKER", limit: "20", before: "2026-10-15T00:00:00.000Z" });
  assert.equal(events[0]?.occurredAt, NOW.toISOString());
  assert.deepEqual(queries[0], { actor: "WORKER", limit: 20, before: "2026-10-15T00:00:00.000Z" });
  await assert.rejects(service.auditEvents({ actor: "ROBOT" }), /Invalid audit filter/);
  await assert.rejects(service.auditEvents({ limit: "1000" }), /Invalid audit filter/);
});

test("the report shows the retention policy, the backup setting and the last run of each", async () => {
  const { service } = setup();
  const { dataSafety } = await service.report();
  assert.equal(dataSafety.retention.screenshotDays, 30);
  assert.deepEqual(dataSafety.backups, { enabled: true, keep: 7 });
  assert.deepEqual(dataSafety.lastRetention, { at: NOW.toISOString(), ok: true, summary: { screenshots: 2, messageBodies: 0 } });
  assert.deepEqual(dataSafety.lastBackup, { at: NOW.toISOString(), ok: false, summary: { name: "Error", message: "disk full" } });
});
