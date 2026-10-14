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
