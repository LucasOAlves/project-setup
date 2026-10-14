import { test } from "node:test";
import assert from "node:assert/strict";
import { submissionPermission, type PermissionInput } from "./submission-permission.js";

const base: PermissionInput = {
  switchOn: true,
  mode: "AUTOMATED",
  portal: "lever",
  source: { enabled: true, applicationMode: "AUTOMATED" },
};

test("automated submission needs the switch on, an automated application and an AUTOMATED portal", () => {
  assert.deepEqual(submissionPermission(base), { allowed: true });
});

test("a manual application is never submitted by the app", () => {
  assert.deepEqual(submissionPermission({ ...base, mode: "MANUAL" }), { allowed: false, reason: "MANUAL_APPLICATION" });
  assert.deepEqual(submissionPermission({ ...base, portal: null }), { allowed: false, reason: "MANUAL_APPLICATION" });
});

test("the global switch, off by default, stops every submission", () => {
  assert.deepEqual(submissionPermission({ ...base, switchOn: false }), { allowed: false, reason: "SWITCHED_OFF" });
});

test("a portal must be registered, enabled and set to AUTOMATED", () => {
  assert.deepEqual(submissionPermission({ ...base, source: null }), { allowed: false, reason: "PORTAL_NOT_AUTOMATED" });
  assert.deepEqual(submissionPermission({ ...base, source: { enabled: false, applicationMode: "AUTOMATED" } }), {
    allowed: false,
    reason: "SOURCE_DISABLED",
  });
  for (const applicationMode of ["MANUAL", "ASSISTED"] as const) {
    assert.deepEqual(submissionPermission({ ...base, source: { enabled: true, applicationMode } }), {
      allowed: false,
      reason: "PORTAL_NOT_AUTOMATED",
    });
  }
});

test("a manual application reports that first, even with the switch off", () => {
  assert.deepEqual(submissionPermission({ ...base, mode: "MANUAL", switchOn: false }), { allowed: false, reason: "MANUAL_APPLICATION" });
});
