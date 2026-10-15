import { test } from "node:test";
import assert from "node:assert/strict";
import { APPROVAL_TTL_MS, checkApproval, type ApprovalFacts, type ApprovalTarget } from "./application-approval.js";

const APP = "11111111-1111-4111-8111-111111111111";
const DECIDED = new Date("2026-10-14T12:00:00Z");

const approval: ApprovalFacts = {
  applicationId: APP,
  payloadHash: "a".repeat(64),
  destinationUrl: "https://jobs.lever.co/acme/abc",
  decidedAt: DECIDED,
  expiresAt: new Date(DECIDED.getTime() + APPROVAL_TTL_MS),
  invalidatedAt: null,
};

const target: ApprovalTarget = {
  id: APP,
  status: "APPROVED",
  payloadHash: "a".repeat(64),
  destinationUrl: "https://jobs.lever.co/acme/abc",
};

const at = (ms: number) => new Date(DECIDED.getTime() + ms);

test("approvals last 24 hours", () => {
  assert.equal(APPROVAL_TTL_MS, 24 * 60 * 60 * 1000);
});

test("a matching, current approval is valid", () => {
  assert.deepEqual(checkApproval(approval, target, at(60_000)), { ok: true });
});

test("no approval means no submission", () => {
  assert.deepEqual(checkApproval(null, target, at(0)), { ok: false, reason: "NO_APPROVAL" });
});

test("an approval for another application does not count", () => {
  assert.deepEqual(checkApproval({ ...approval, applicationId: "22222222-2222-4222-8222-222222222222" }, target, at(0)), {
    ok: false,
    reason: "WRONG_APPLICATION",
  });
});

test("an application that is not APPROVED cannot be submitted, even with an approval row", () => {
  for (const status of ["READY_FOR_REVIEW", "SUBMITTED", "SUBMISSION_UNKNOWN", "PREPARING"] as const) {
    assert.deepEqual(checkApproval(approval, { ...target, status }, at(0)), { ok: false, reason: "NOT_APPROVED" }, status);
  }
});

test("SUBMITTING counts as approved, so the worker can recheck just before the click", () => {
  assert.deepEqual(checkApproval(approval, { ...target, status: "SUBMITTING" }, at(0)), { ok: true });
});

test("an invalidated approval is refused", () => {
  assert.deepEqual(checkApproval({ ...approval, invalidatedAt: at(10) }, target, at(20)), { ok: false, reason: "INVALIDATED" });
});

test("an approval is refused at and after its expiry", () => {
  assert.deepEqual(checkApproval(approval, target, at(APPROVAL_TTL_MS - 1)), { ok: true });
  assert.deepEqual(checkApproval(approval, target, at(APPROVAL_TTL_MS)), { ok: false, reason: "EXPIRED" });
});

test("a different payload is refused", () => {
  assert.deepEqual(checkApproval(approval, { ...target, payloadHash: "b".repeat(64) }, at(0)), { ok: false, reason: "PAYLOAD_CHANGED" });
  assert.deepEqual(checkApproval(approval, { ...target, payloadHash: null }, at(0)), { ok: false, reason: "PAYLOAD_CHANGED" });
});

test("a different destination is refused, ignoring only a fragment", () => {
  assert.deepEqual(checkApproval(approval, { ...target, destinationUrl: "https://jobs.lever.co/acme/other" }, at(0)), {
    ok: false,
    reason: "DESTINATION_CHANGED",
  });
  assert.deepEqual(checkApproval(approval, { ...target, destinationUrl: "https://jobs.lever.co/acme/abc#apply" }, at(0)), { ok: true });
});

test("checks run in a fixed order: invalidated before expired before changed", () => {
  const stale = { ...approval, invalidatedAt: at(1) };
  const changed = { ...target, payloadHash: "b".repeat(64) };
  assert.equal(checkApproval(stale, changed, at(APPROVAL_TTL_MS + 1)).ok === false && "INVALIDATED", "INVALIDATED");
  const result = checkApproval(approval, changed, at(APPROVAL_TTL_MS + 1));
  assert.deepEqual(result, { ok: false, reason: "EXPIRED" });
});
