import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../app-error.js";
import type { AuditEventInput } from "../audit/audit-repository.js";
import type { ApplicationEventRow, ApplicationRow, ApprovalRow, NewApproval } from "./application-repository.js";
import { ApplicationService, supportedPortal } from "./application-service.js";

const JOB = "11111111-1111-4111-8111-111111111111";
const OTHER_JOB = "22222222-2222-4222-8222-222222222222";

function setup(jobUrl = "https://job-boards.greenhouse.io/acme/jobs/123", clock = { now: new Date("2026-10-14T12:00:00Z") }) {
  const rows: ApplicationRow[] = [];
  const events: ApplicationEventRow[] = [];
  const audits: AuditEventInput[] = [];
  const approvals: ApprovalRow[] = [];
  const executions: Array<{ id: string; applicationId: string; approvalId: string; attemptNumber: number; finished: boolean }> = [];
  let ids = 0;
  const nextId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;
  const repo = {
    async get(id: string) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async findByJob(jobId: string) {
      return rows.find((row) => row.jobId === jobId) ?? null;
    },
    async create(input: Pick<ApplicationRow, "jobId" | "status" | "mode" | "portal" | "destinationUrl">, record: { actor: string; reason: string }) {
      if (rows.some((row) => row.jobId === input.jobId)) return null;
      const now = clock.now;
      const row: ApplicationRow = { id: nextId(), lastError: "", formSnapshot: null, fieldPlan: null, preview: null, payloadHash: null, createdAt: now, updatedAt: now, ...input };
      rows.push(row);
      events.push({ id: nextId(), applicationId: row.id, fromStatus: null, toStatus: row.status, createdAt: now, ...record });
      return row;
    },
    async transition(id: string, from: string, to: string, record: { actor: string; reason: string }, patch = {}) {
      const row = rows.find((candidate) => candidate.id === id && candidate.status === from);
      if (!row) return null;
      Object.assign(row, patch, { status: to, updatedAt: clock.now });
      if (!["SUBMITTING", "SUBMITTED", "SUBMISSION_UNKNOWN"].includes(to)) {
        for (const approval of approvals) {
          if (approval.applicationId === id && !approval.invalidatedAt) Object.assign(approval, { invalidatedAt: clock.now, invalidationReason: record.reason });
        }
      }
      events.push({ id: nextId(), applicationId: id, fromStatus: from, toStatus: to, createdAt: new Date(), ...record });
      return row;
    },
    async approve(id: string, record: { actor: string; reason: string }, input: NewApproval) {
      const row = rows.find((candidate) => candidate.id === id && candidate.status === "READY_FOR_REVIEW");
      if (!row) return null;
      Object.assign(row, { status: "APPROVED", updatedAt: clock.now });
      const approval: ApprovalRow = { id: nextId(), applicationId: id, decision: "APPROVED", invalidatedAt: null, invalidationReason: "", ...input };
      approvals.push(approval);
      events.push({ id: nextId(), applicationId: id, fromStatus: "READY_FOR_REVIEW", toStatus: "APPROVED", createdAt: clock.now, ...record });
      return { row, approval };
    },
    async claimSubmission(id: string, approvalId: string, record: { actor: string; reason: string }) {
      const row = rows.find((candidate) => candidate.id === id && candidate.status === "APPROVED");
      if (!row || executions.some((execution) => execution.approvalId === approvalId)) return null;
      Object.assign(row, { status: "SUBMITTING", updatedAt: clock.now });
      const execution = { id: nextId(), applicationId: id, approvalId, attemptNumber: executions.length + 1, finished: false };
      executions.push(execution);
      events.push({ id: nextId(), applicationId: id, fromStatus: "APPROVED", toStatus: "SUBMITTING", createdAt: clock.now, ...record });
      return { row, execution: execution as never };
    },
    async finishOpenExecutions(applicationId: string) {
      for (const execution of executions) if (execution.applicationId === applicationId) execution.finished = true;
    },
    async liveApproval(applicationId: string) {
      return approvals.filter((approval) => approval.applicationId === applicationId && !approval.invalidatedAt).at(-1) ?? null;
    },
    async events(applicationId: string) {
      return events.filter((event) => event.applicationId === applicationId);
    },
  };
  const audit = {
    async record(input: AuditEventInput) {
      audits.push(input);
    },
  };
  const permit = { allowed: true };
  const service = new ApplicationService(
    repo,
    audit,
    async (id) => (id === JOB ? { id, url: jobUrl } : null),
    () => clock.now,
    async () => (permit.allowed ? { allowed: true } : { allowed: false, reason: "SWITCHED_OFF" }),
  );
  return { service, rows, audits, approvals, clock, executions, permit };
}

async function rejects(promise: Promise<unknown>, status: number, message?: RegExp) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, status);
    if (message) assert.match(error.message, message);
    return true;
  });
}

test("supported portals are Greenhouse, Lever and Ashby; anything else is manual", () => {
  assert.equal(supportedPortal("https://boards.greenhouse.io/acme/jobs/1"), "greenhouse");
  assert.equal(supportedPortal("https://jobs.lever.co/acme/abc"), "lever");
  assert.equal(supportedPortal("https://jobs.ashbyhq.com/acme/abc"), "ashby");
  assert.equal(supportedPortal("https://apply.workable.com/acme/j/ABC"), null);
  assert.equal(supportedPortal("https://acme.com/careers/1"), null);
  assert.equal(supportedPortal(""), null);
});

test("starting creates the application in PREPARING with its history and an audit event", async () => {
  const { service, audits } = setup();
  const application = await service.startPreparation(JOB);

  assert.equal(application.status, "PREPARING");
  assert.equal(application.mode, "AUTOMATED");
  assert.equal(application.portal, "greenhouse");
  assert.deepEqual(
    application.events.map((event) => [event.fromStatus, event.toStatus, event.actor]),
    [[null, "PREPARING", "USER"]],
  );
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.eventType, "APPLICATION_STATUS_CHANGED");
  assert.equal(audits[0]?.actor, "USER");
});

test("an unsupported portal is prepared in manual mode", async () => {
  const { service } = setup("https://acme.com/careers/42");
  const application = await service.startPreparation(JOB);
  assert.equal(application.mode, "MANUAL");
  assert.equal(application.portal, null);
});

test("starting twice while a run is in progress is a conflict", async () => {
  const { service } = setup();
  await service.startPreparation(JOB);
  await rejects(service.startPreparation(JOB), 409, /already being prepared/);
});

test("the worker records the outcome, then the user can prepare again", async () => {
  const { service } = setup();
  const started = await service.startPreparation(JOB);
  const outcome = await service.recordOutcome(started.id, "NEEDS_INFORMATION", "WORKER", "2 required fields have no answer.");
  assert.equal(outcome.status, "NEEDS_INFORMATION");

  const again = await service.startPreparation(JOB);
  assert.equal(again.status, "PREPARING");
  assert.deepEqual(
    again.events.map((event) => event.toStatus),
    ["PREPARING", "NEEDS_INFORMATION", "PREPARING"],
  );
});

test("a failed run keeps its error until the next run clears it", async () => {
  const { service } = setup();
  const started = await service.startPreparation(JOB);
  const failed = await service.recordOutcome(started.id, "FAILED", "SYSTEM", "The run timed out.", { lastError: "Timed out" });
  assert.equal(failed.lastError, "Timed out");
  const again = await service.startPreparation(JOB);
  assert.equal(again.lastError, "");
});

test("an outcome outside a run is a conflict", async () => {
  const { service } = setup();
  const started = await service.startPreparation(JOB);
  await service.recordOutcome(started.id, "READY_FOR_REVIEW", "WORKER", "Filled.");
  await rejects(service.recordOutcome(started.id, "FAILED", "WORKER", "late"), 409, /No preparation is running/);
});

test("the user can reject a settled application but not one mid-run", async () => {
  const { service } = setup();
  const started = await service.startPreparation(JOB);
  await rejects(service.reject(started.id), 409, /Wait for the current preparation/);
  await service.recordOutcome(started.id, "READY_FOR_REVIEW", "WORKER", "Filled.");
  const rejected = await service.reject(started.id);
  assert.equal(rejected.status, "USER_REJECTED");
});

test("unknown jobs and applications are 404", async () => {
  const { service } = setup();
  await rejects(service.getForJob(OTHER_JOB), 404);
  await rejects(service.startPreparation(OTHER_JOB), 404);
  await rejects(service.reject("99999999-9999-4999-8999-999999999999"), 404);
  assert.equal(await service.getForJob(JOB), null);
});

test("a run left in PREPARING past the limit is failed by the system and can be started again", async () => {
  const clock = { now: new Date("2026-10-14T12:00:00Z") };
  const { service } = setup(undefined, clock);
  await service.startPreparation(JOB);

  clock.now = new Date("2026-10-14T12:05:00Z");
  assert.equal((await service.getForJob(JOB))?.status, "PREPARING");

  clock.now = new Date("2026-10-14T12:11:00Z");
  const expired = await service.getForJob(JOB);
  assert.equal(expired?.status, "FAILED");
  assert.equal(expired?.lastError, "ABANDONED");
  assert.equal(expired?.events.at(-1)?.actor, "SYSTEM");

  const restarted = await service.startPreparation(JOB);
  assert.equal(restarted.status, "PREPARING");
});

test("starting again over an abandoned run expires it first", async () => {
  const clock = { now: new Date("2026-10-14T12:00:00Z") };
  const { service } = setup(undefined, clock);
  await service.startPreparation(JOB);
  clock.now = new Date("2026-10-14T13:00:00Z");
  const restarted = await service.startPreparation(JOB);
  assert.deepEqual(
    restarted.events.map((event) => event.toStatus),
    ["PREPARING", "FAILED", "PREPARING"],
  );
});

// Milestone 4: approval.

const HASH = "a".repeat(64);
const CV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

async function readyForReview(setupResult = setup()) {
  const { service } = setupResult;
  const started = await service.startPreparation(JOB);
  await service.recordOutcome(started.id, "READY_FOR_REVIEW", "WORKER", "Prepared.", {
    payloadHash: HASH,
    fieldPlan: [
      { key: "f1", questionKey: "resume", label: "Resume", kind: "FILE", required: true, options: [], status: "FILLED", value: "CV PDF", documentId: CV, source: "CV" },
    ],
    formSnapshot: { portal: "greenhouse", url: "https://job-boards.greenhouse.io/acme/jobs/123", title: "Engineer", fields: [], readAt: "2026-10-14T11:59:00.000Z" },
  });
  return { ...setupResult, id: started.id };
}

test("the user approves the exact payload they reviewed, with a 24-hour expiry and an audit event", async () => {
  const { service, id, audits, approvals } = await readyForReview();
  const approved = await service.approve(id, { payloadHash: HASH });
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.approval?.payloadHash, HASH);
  assert.equal(approved.approval?.expiresAt, "2026-10-15T12:00:00.000Z");
  assert.deepEqual(approvals[0]?.documentIds, [CV]);
  assert.equal(approvals[0]?.formRevision, "2026-10-14T11:59:00.000Z");
  const event = audits.find((audit) => audit.eventType === "APPLICATION_APPROVED");
  assert.equal(event?.actor, "USER");
  assert.equal(event?.payload?.payloadHash, HASH);
});

test("approving a hash other than the current one is refused", async () => {
  const { service, id } = await readyForReview();
  await rejects(service.approve(id, { payloadHash: "b".repeat(64) }), 409, /changed since you reviewed/);
  await rejects(service.approve(id, { payloadHash: "not a hash" }), 400);
});

test("only an application ready for review can be approved", async () => {
  const { service } = setup();
  const started = await service.startPreparation(JOB);
  await service.recordOutcome(started.id, "NEEDS_INFORMATION", "WORKER", "Questions.", { payloadHash: HASH });
  await rejects(service.approve(started.id, { payloadHash: HASH }), 409, /ready for review/);
});

test("a manual application has nothing to approve", async () => {
  const { service } = setup("https://acme.com/careers/1");
  const started = await service.startPreparation(JOB);
  await service.recordOutcome(started.id, "READY_FOR_REVIEW", "SYSTEM", "Manual.");
  await rejects(service.approve(started.id, { payloadHash: HASH }), 409, /by hand/);
});

test("preparing again invalidates the approval", async () => {
  const { service, id, approvals } = await readyForReview();
  await service.approve(id, { payloadHash: HASH });
  const again = await service.startPreparation(JOB);
  assert.equal(again.status, "PREPARING");
  assert.equal(again.approval, null);
  assert.ok(approvals[0]?.invalidatedAt);
});

test("withdrawing returns the application to review and invalidates the approval", async () => {
  const { service, id, approvals } = await readyForReview();
  await service.approve(id, { payloadHash: HASH });
  const withdrawn = await service.withdrawApproval(id);
  assert.equal(withdrawn.status, "READY_FOR_REVIEW");
  assert.equal(approvals[0]?.invalidationReason, "You withdrew your approval.");
  await rejects(service.withdrawApproval(id), 409);
});

test("an approval past 24 hours lapses back to review when the application is read", async () => {
  const setupResult = setup();
  const { service, id, approvals, clock } = await readyForReview(setupResult);
  await service.approve(id, { payloadHash: HASH });
  clock.now = new Date("2026-10-15T12:00:00Z");
  const read = await service.get(id);
  assert.equal(read.status, "READY_FOR_REVIEW");
  assert.equal(read.events.at(-1)?.actor, "SYSTEM");
  assert.ok(approvals[0]?.invalidatedAt);
});

test("a submission run that stalls becomes SUBMISSION_UNKNOWN, not FAILED", async () => {
  const setupResult = setup();
  const { service, id, clock, executions } = await readyForReview(setupResult);
  const approved = await service.approve(id, { payloadHash: HASH });
  await service.claimSubmission(id, approved.approval!.id);
  clock.now = new Date(clock.now.getTime() + 11 * 60 * 1000);
  const read = await service.get(id);
  assert.equal(read.status, "SUBMISSION_UNKNOWN");
  assert.equal(read.lastError, "ABANDONED");
  assert.equal(executions[0]?.finished, true);
});

test("a submission in progress cannot be rejected or prepared again", async () => {
  const { service, id, rows } = await readyForReview();
  await service.approve(id, { payloadHash: HASH });
  rows[0]!.status = "SUBMITTING";
  await rejects(service.reject(id), 409);
  await rejects(service.startPreparation(JOB), 409);
});

// Milestone 4, ticket 4: the submission run's claim and last check.

test("the run claims an approved application once per approval", async () => {
  const { service, id, executions, audits } = await readyForReview();
  const approved = await service.approve(id, { payloadHash: HASH });
  const first = await service.claimSubmission(id, approved.approval!.id);
  assert.equal(first.claimed, true);
  if (first.claimed) assert.equal(first.application.status, "SUBMITTING");
  const second = await service.claimSubmission(id, approved.approval!.id);
  assert.equal(second.claimed, false);
  assert.equal(executions.length, 1);
  assert.ok(audits.some((audit) => audit.eventType === "SUBMISSION_STARTED"));
});

test("a run for an approval that is no longer live is skipped", async () => {
  const { service, id } = await readyForReview();
  const approved = await service.approve(id, { payloadHash: HASH });
  await service.withdrawApproval(id);
  await service.approve(id, { payloadHash: HASH });
  const stale = await service.claimSubmission(id, approved.approval!.id);
  assert.deepEqual(stale, { claimed: false, reason: "This run was queued for an approval that is no longer live." });
});

test("a run is not claimed when submission is not permitted", async () => {
  const { service, id, permit } = await readyForReview();
  const approved = await service.approve(id, { payloadHash: HASH });
  permit.allowed = false;
  const result = await service.claimSubmission(id, approved.approval!.id);
  assert.equal(result.claimed, false);
  assert.equal((await service.get(id)).status, "APPROVED");
});

test("an expired approval is not claimed", async () => {
  const { service, id, clock } = await readyForReview();
  const approved = await service.approve(id, { payloadHash: HASH });
  clock.now = new Date("2026-10-15T12:00:01Z");
  const result = await service.claimSubmission(id, approved.approval!.id);
  assert.equal(result.claimed, false);
});

test("right before the click, the filled payload must hash to the approved one", async () => {
  const { service, id, permit } = await readyForReview();
  const approved = await service.approve(id, { payloadHash: HASH });
  await service.claimSubmission(id, approved.approval!.id);
  assert.deepEqual(await service.confirmBeforeClick(id, approved.approval!.id, HASH), { ok: true });
  assert.deepEqual(await service.confirmBeforeClick(id, approved.approval!.id, "c".repeat(64)), { ok: false, reason: "PAYLOAD_CHANGED" });
  assert.deepEqual(await service.confirmBeforeClick(id, "99999999-9999-4999-8999-999999999999", HASH), { ok: false, reason: "INVALIDATED" });
  permit.allowed = false;
  assert.deepEqual(await service.confirmBeforeClick(id, approved.approval!.id, HASH), { ok: false, reason: "NOT_PERMITTED" });
});
