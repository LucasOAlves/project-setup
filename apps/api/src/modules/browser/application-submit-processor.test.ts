import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApplicationPublic, FieldPlan } from "@studio/shared";
import type { AuditEventInput } from "../audit/audit-repository.js";
import { ApplicationSubmitProcessor } from "./application-submit-processor.js";
import type { SubmissionRun, SubmissionTarget } from "./application-submitter.js";

const APPROVAL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const application = {
  id: "00000000-0000-4000-8000-000000000001",
  jobId: "11111111-1111-4111-8111-111111111111",
  status: "SUBMITTING",
  mode: "AUTOMATED",
  portal: "lever",
  destinationUrl: "https://jobs.lever.co/acme/abc",
} as ApplicationPublic;

const plan: FieldPlan[] = [
  { key: "f1", questionKey: "email", label: "Email", kind: "EMAIL", required: true, options: [], status: "FILLED", value: "a@example.com", source: "YOUR_DETAILS" },
];

function setup(options: { claim?: boolean; check?: { ok: true } | { ok: false; reason: "PAYLOAD_CHANGED" | "NOT_PERMITTED" }; run?: (target: SubmissionTarget) => Promise<SubmissionRun> } = {}) {
  const recorded: Array<{ status: string; actor: string; patch: Record<string, unknown> }> = [];
  const finished: Array<Record<string, unknown>> = [];
  const clicks: string[] = [];
  const audits: AuditEventInput[] = [];
  const checkedHashes: string[] = [];
  const processor = new ApplicationSubmitProcessor({
    applications: {
      claimSubmission: async () =>
        options.claim === false ? { claimed: false as const, reason: "Another run already took this approval." } : { claimed: true as const, application, executionId: "exec-1" },
      confirmBeforeClick: async (_id: string, _approval: string, hash: string) => {
        checkedHashes.push(hash);
        return options.check ?? { ok: true as const };
      },
      recordOutcome: async (_id: string, status: string, actor: string, _reason: string, patch: Record<string, unknown> = {}) => {
        recorded.push({ status, actor, patch });
        return { ...application, status } as ApplicationPublic;
      },
    } as never,
    executions: {
      markClicked: async (id) => void clicks.push(id),
      finishExecution: async (_id, finish) => void finished.push(finish),
    },
    submitter: {
      submit:
        options.run ??
        (async (target) => {
          const check = await target.beforeClick(await target.payloadHash(plan));
          if (!check.ok) return { clicked: false, status: "READY_FOR_REVIEW", reason: check.reason, lastError: "APPROVAL_CHECK_FAILED" };
          await target.onClick();
          return { clicked: true, submitStatus: 200, status: "SUBMITTED", reason: "Confirmed.", evidence: "thanks page", confirmationReference: "REF-1" };
        }),
    },
    planner: { plan: async () => plan },
    files: { load: async () => assert.fail("no files"), fileHash: async () => null },
    audit: { record: async (event) => void audits.push(event) },
    now: () => new Date("2026-10-14T12:00:00Z"),
  });
  return { processor, recorded, finished, clicks, audits, checkedHashes };
}

test("a confirmed submission is recorded as SUBMITTED with its time and reference", async () => {
  const { processor, recorded, finished, clicks, audits, checkedHashes } = setup();
  const result = await processor.process({ applicationId: application.id, approvalId: APPROVAL });
  assert.equal(result.status, "SUBMITTED");
  assert.equal(recorded[0]?.actor, "WORKER");
  assert.deepEqual(recorded[0]?.patch, { lastError: "", submittedAt: new Date("2026-10-14T12:00:00Z"), confirmationReference: "REF-1" });
  assert.deepEqual(finished, [{ result: "SUBMITTED", errorType: "", submitStatus: 200, confirmationReference: "REF-1" }]);
  assert.deepEqual(clicks, ["exec-1"]);
  assert.match(checkedHashes[0]!, /^[0-9a-f]{64}$/);
  assert.equal(audits.find((audit) => audit.eventType === "SUBMISSION_FINISHED")?.payload?.evidence, "thanks page");
});

test("an approval already claimed means no browser run at all", async () => {
  const { processor, recorded } = setup({ claim: false, run: async () => assert.fail("must not run") });
  const result = await processor.process({ applicationId: application.id, approvalId: APPROVAL });
  assert.equal(result.status, "SKIPPED");
  assert.equal(recorded.length, 0);
});

test("a failed last check stops before the click and goes back to review", async () => {
  const { processor, recorded, clicks, finished } = setup({ check: { ok: false, reason: "PAYLOAD_CHANGED" } });
  await processor.process({ applicationId: application.id, approvalId: APPROVAL });
  assert.equal(recorded[0]?.status, "READY_FOR_REVIEW");
  assert.equal(clicks.length, 0);
  assert.equal(finished[0]?.errorType, "APPROVAL_CHECK_FAILED");
});

test("an unclear result after the click is recorded as SUBMISSION_UNKNOWN, not retried", async () => {
  let runs = 0;
  const { processor, recorded } = setup({
    run: async () => {
      runs += 1;
      return { clicked: true, submitStatus: null, status: "SUBMISSION_UNKNOWN", reason: "No answer.", evidence: "submit sent; status none" };
    },
  });
  await processor.process({ applicationId: application.id, approvalId: APPROVAL });
  assert.equal(runs, 1);
  assert.equal(recorded[0]?.status, "SUBMISSION_UNKNOWN");
  assert.equal(recorded[0]?.patch.lastError, "SUBMISSION_UNKNOWN");
});
