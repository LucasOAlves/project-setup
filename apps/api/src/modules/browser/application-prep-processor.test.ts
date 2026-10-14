import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApplicationPublic } from "@studio/shared";
import type { PreparationOutcome } from "./application-preparer.js";
import { ApplicationPrepProcessor } from "./application-prep-processor.js";

const RUN = "2026-10-14T12:00:00.000Z";
const application: ApplicationPublic = {
  id: "00000000-0000-4000-8000-000000000001",
  jobId: "11111111-1111-4111-8111-111111111111",
  status: "PREPARING",
  mode: "AUTOMATED",
  portal: "lever",
  destinationUrl: "https://jobs.lever.co/acme/abc",
  lastError: "",
  form: null,
  plan: null,
  createdAt: RUN,
  updatedAt: RUN,
  events: [],
};

function setup(current: ApplicationPublic | null, prepare: () => Promise<PreparationOutcome>) {
  const recorded: Array<{ status: string; actor: string; lastError?: string }> = [];
  const applications = {
    async get() {
      if (!current) throw new Error("not found");
      return current;
    },
    async recordOutcome(_id: string, status: string, actor: string, _reason: string, patch: { lastError?: string } = {}) {
      recorded.push({ status, actor, lastError: patch.lastError });
      return { ...application, status } as ApplicationPublic;
    },
  };
  return { processor: new ApplicationPrepProcessor(applications as never, { prepare }, { plan: async () => [] }), recorded };
}

test("records the preparer's outcome as the worker", async () => {
  const { processor, recorded } = setup(application, async () => ({ status: "BLOCKED_BY_PLATFORM", reason: "Login", lastError: "LOGIN" }));
  const result = await processor.process({ applicationId: application.id, runId: RUN });
  assert.equal(result.status, "BLOCKED_BY_PLATFORM");
  assert.deepEqual(recorded, [{ status: "BLOCKED_BY_PLATFORM", actor: "WORKER", lastError: "LOGIN" }]);
});

test("a stale run is skipped without touching the application", async () => {
  const { processor, recorded } = setup({ ...application, updatedAt: "2026-10-14T12:30:00.000Z" }, async () => assert.fail("must not run"));
  const result = await processor.process({ applicationId: application.id, runId: RUN });
  assert.equal(result.skipped, "NOT_THE_CURRENT_RUN");
  assert.deepEqual(recorded, []);
});

test("a settled or deleted application is skipped", async () => {
  const settled = setup({ ...application, status: "USER_REJECTED" }, async () => assert.fail("must not run"));
  assert.equal((await settled.processor.process({ applicationId: application.id, runId: RUN })).skipped, "NOT_THE_CURRENT_RUN");
  const missing = setup(null, async () => assert.fail("must not run"));
  assert.equal((await missing.processor.process({ applicationId: application.id, runId: RUN })).skipped, "APPLICATION_NOT_FOUND");
});

test("an unexpected error fails the run without storing the error message", async () => {
  const { processor, recorded } = setup(application, async () => {
    throw new TypeError("page said: ada@example.com");
  });
  await processor.process({ applicationId: application.id, runId: RUN });
  assert.deepEqual(recorded, [{ status: "FAILED", actor: "WORKER", lastError: "TypeError" }]);
});
