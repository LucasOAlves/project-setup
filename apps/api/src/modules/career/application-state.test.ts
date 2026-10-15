import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTransition, initialApplicationState } from "./application-state.js";

test("a new application starts in PREPARING, requested by the user", () => {
  assert.equal(initialApplicationState, "PREPARING");
});

test("the worker records every outcome of a preparation run", () => {
  for (const to of ["NEEDS_INFORMATION", "READY_FOR_REVIEW", "BLOCKED_BY_PLATFORM", "FAILED"] as const) {
    assert.deepEqual(checkTransition("PREPARING", to, "WORKER"), { ok: true }, to);
  }
});

test("the user cannot record a preparation outcome", () => {
  const result = checkTransition("PREPARING", "READY_FOR_REVIEW", "USER");
  assert.equal(result.ok, false);
});

test("the worker cannot start a preparation or reject an application", () => {
  assert.equal(checkTransition("READY_FOR_REVIEW", "PREPARING", "WORKER").ok, false);
  assert.equal(checkTransition("READY_FOR_REVIEW", "USER_REJECTED", "WORKER").ok, false);
});

test("the user can prepare again from any settled state", () => {
  for (const from of ["NEEDS_INFORMATION", "READY_FOR_REVIEW", "BLOCKED_BY_PLATFORM", "FAILED", "USER_REJECTED"] as const) {
    assert.deepEqual(checkTransition(from, "PREPARING", "USER"), { ok: true }, from);
  }
});

test("a run already in progress cannot be started twice", () => {
  const result = checkTransition("PREPARING", "PREPARING", "USER");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /already being prepared/i);
});

test("the user can reject from any settled state but not mid-run", () => {
  for (const from of ["NEEDS_INFORMATION", "READY_FOR_REVIEW", "BLOCKED_BY_PLATFORM", "FAILED"] as const) {
    assert.deepEqual(checkTransition(from, "USER_REJECTED", "USER"), { ok: true }, from);
  }
  assert.equal(checkTransition("PREPARING", "USER_REJECTED", "USER").ok, false);
  assert.equal(checkTransition("USER_REJECTED", "USER_REJECTED", "USER").ok, false);
});

test("an outcome cannot be recorded outside a run", () => {
  assert.equal(checkTransition("READY_FOR_REVIEW", "NEEDS_INFORMATION", "WORKER").ok, false);
  assert.equal(checkTransition("USER_REJECTED", "READY_FOR_REVIEW", "WORKER").ok, false);
});

test("the system records the outcome of runs without a browser and of abandoned runs", () => {
  assert.deepEqual(checkTransition("PREPARING", "FAILED", "SYSTEM"), { ok: true });
  assert.deepEqual(checkTransition("PREPARING", "READY_FOR_REVIEW", "SYSTEM"), { ok: true });
  assert.equal(checkTransition("READY_FOR_REVIEW", "FAILED", "SYSTEM").ok, false);
});

// Milestone 4: approval and submission (spec section 4 invariants).

test("only the user approves, and only an application ready for review", () => {
  assert.deepEqual(checkTransition("READY_FOR_REVIEW", "APPROVED", "USER"), { ok: true });
  assert.equal(checkTransition("READY_FOR_REVIEW", "APPROVED", "WORKER").ok, false);
  assert.equal(checkTransition("READY_FOR_REVIEW", "APPROVED", "SYSTEM").ok, false);
  for (const from of ["PREPARING", "NEEDS_INFORMATION", "BLOCKED_BY_PLATFORM", "FAILED", "USER_REJECTED", "APPROVED", "SUBMITTING", "SUBMITTED", "SUBMISSION_UNKNOWN", "EXPIRED"] as const) {
    assert.equal(checkTransition(from, "APPROVED", "USER").ok, false, from);
  }
});

test("only an approved application enters SUBMITTING, and only the worker moves it there", () => {
  assert.deepEqual(checkTransition("APPROVED", "SUBMITTING", "WORKER"), { ok: true });
  assert.equal(checkTransition("APPROVED", "SUBMITTING", "USER").ok, false);
  assert.equal(checkTransition("APPROVED", "SUBMITTING", "SYSTEM").ok, false);
  for (const from of ["READY_FOR_REVIEW", "PREPARING", "SUBMITTING", "SUBMITTED", "SUBMISSION_UNKNOWN", "FAILED"] as const) {
    assert.equal(checkTransition(from, "SUBMITTING", "WORKER").ok, false, from);
  }
});

test("an approval can be withdrawn or lapse, which returns the application to review", () => {
  for (const actor of ["USER", "WORKER", "SYSTEM"] as const) {
    assert.deepEqual(checkTransition("APPROVED", "READY_FOR_REVIEW", actor), { ok: true }, actor);
  }
});

test("the submission run records how it ended", () => {
  for (const to of ["SUBMITTED", "SUBMISSION_UNKNOWN", "NEEDS_INFORMATION", "READY_FOR_REVIEW", "BLOCKED_BY_PLATFORM", "FAILED", "EXPIRED"] as const) {
    assert.deepEqual(checkTransition("SUBMITTING", to, "WORKER"), { ok: true }, to);
  }
  assert.equal(checkTransition("SUBMITTING", "SUBMITTED", "USER").ok, false);
});

test("the system can only mark a stalled submission as unknown, never as failed or sent", () => {
  assert.deepEqual(checkTransition("SUBMITTING", "SUBMISSION_UNKNOWN", "SYSTEM"), { ok: true });
  assert.equal(checkTransition("SUBMITTING", "FAILED", "SYSTEM").ok, false);
  assert.equal(checkTransition("SUBMITTING", "SUBMITTED", "SYSTEM").ok, false);
  assert.equal(checkTransition("SUBMITTING", "READY_FOR_REVIEW", "SYSTEM").ok, false);
});

test("a submitted application is final", () => {
  for (const to of ["PREPARING", "USER_REJECTED", "APPROVED", "SUBMITTING", "SUBMISSION_UNKNOWN", "READY_FOR_REVIEW", "FAILED"] as const) {
    for (const actor of ["USER", "WORKER", "SYSTEM"] as const) {
      assert.equal(checkTransition("SUBMITTED", to, actor).ok, false, `${to} by ${actor}`);
    }
  }
});

test("an unknown result waits for the user, who says whether it was sent", () => {
  assert.deepEqual(checkTransition("SUBMISSION_UNKNOWN", "SUBMITTED", "USER"), { ok: true });
  assert.deepEqual(checkTransition("SUBMISSION_UNKNOWN", "READY_FOR_REVIEW", "USER"), { ok: true });
  for (const to of ["SUBMITTED", "READY_FOR_REVIEW", "SUBMITTING", "FAILED"] as const) {
    assert.equal(checkTransition("SUBMISSION_UNKNOWN", to, "WORKER").ok, false, to);
    assert.equal(checkTransition("SUBMISSION_UNKNOWN", to, "SYSTEM").ok, false, to);
  }
  assert.equal(checkTransition("SUBMISSION_UNKNOWN", "PREPARING", "USER").ok, false);
  assert.equal(checkTransition("SUBMISSION_UNKNOWN", "USER_REJECTED", "USER").ok, false);
});

test("the user can record a submission they made by hand from any settled state", () => {
  for (const from of ["READY_FOR_REVIEW", "APPROVED", "NEEDS_INFORMATION", "BLOCKED_BY_PLATFORM", "FAILED"] as const) {
    assert.deepEqual(checkTransition(from, "SUBMITTED", "USER"), { ok: true }, from);
  }
  for (const from of ["PREPARING", "SUBMITTING", "USER_REJECTED", "EXPIRED"] as const) {
    assert.equal(checkTransition(from, "SUBMITTED", "USER").ok, false, from);
  }
});

test("preparing again is possible from an approval or a closed posting, not during or after a submission", () => {
  assert.deepEqual(checkTransition("APPROVED", "PREPARING", "USER"), { ok: true });
  assert.deepEqual(checkTransition("EXPIRED", "PREPARING", "USER"), { ok: true });
  for (const from of ["SUBMITTING", "SUBMITTED", "SUBMISSION_UNKNOWN"] as const) {
    assert.equal(checkTransition(from, "PREPARING", "USER").ok, false, from);
  }
});

test("the user cannot reject during or after a submission", () => {
  assert.deepEqual(checkTransition("APPROVED", "USER_REJECTED", "USER"), { ok: true });
  for (const from of ["SUBMITTING", "SUBMITTED", "SUBMISSION_UNKNOWN"] as const) {
    assert.equal(checkTransition(from, "USER_REJECTED", "USER").ok, false, from);
  }
});

test("a closed posting is recorded by a run", () => {
  assert.deepEqual(checkTransition("PREPARING", "EXPIRED", "WORKER"), { ok: true });
  assert.equal(checkTransition("READY_FOR_REVIEW", "EXPIRED", "WORKER").ok, false);
  assert.equal(checkTransition("PREPARING", "EXPIRED", "USER").ok, false);
});
