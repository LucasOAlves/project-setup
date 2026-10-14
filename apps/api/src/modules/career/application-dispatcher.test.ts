import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApplicationPublic } from "@studio/shared";
import { AppError } from "../../app-error.js";
import { ApplicationDispatcher } from "./application-dispatcher.js";

const base: ApplicationPublic = {
  id: "00000000-0000-4000-8000-000000000001",
  jobId: "11111111-1111-4111-8111-111111111111",
  status: "PREPARING",
  mode: "AUTOMATED",
  portal: "greenhouse",
  destinationUrl: "https://job-boards.greenhouse.io/acme/jobs/1",
  lastError: "",
  form: null,
  createdAt: "2026-10-14T12:00:00.000Z",
  updatedAt: "2026-10-14T12:00:00.000Z",
  events: [],
};

function setup(enqueue: (application: ApplicationPublic) => Promise<void>) {
  const outcomes: Array<{ to: string; actor: string; lastError?: string }> = [];
  const applications = {
    async recordOutcome(_id: string, to: string, actor: string, _reason: string, patch: { lastError?: string } = {}) {
      outcomes.push({ to, actor, lastError: patch.lastError });
      return { ...base, status: to } as ApplicationPublic;
    },
  };
  return { dispatcher: new ApplicationDispatcher("redis://unused", applications as never, enqueue), outcomes };
}

test("a supported portal is queued for the browser worker and stays PREPARING", async () => {
  const queued: string[] = [];
  const { dispatcher, outcomes } = setup(async (application) => {
    queued.push(application.id);
  });
  const result = await dispatcher.dispatch(base);
  assert.equal(result.status, "PREPARING");
  assert.deepEqual(queued, [base.id]);
  assert.deepEqual(outcomes, []);
});

test("an unsupported portal is settled by the system without a browser", async () => {
  const { dispatcher, outcomes } = setup(async () => assert.fail("must not queue"));
  const result = await dispatcher.dispatch({ ...base, mode: "MANUAL", portal: null });
  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.deepEqual(outcomes, [{ to: "READY_FOR_REVIEW", actor: "SYSTEM", lastError: undefined }]);
});

test("when the queue is down the run is failed, not left PREPARING", async () => {
  const { dispatcher, outcomes } = setup(async () => {
    throw new Error("ECONNREFUSED");
  });
  await assert.rejects(dispatcher.dispatch(base), (error: unknown) => error instanceof AppError && error.statusCode === 503);
  assert.deepEqual(outcomes, [{ to: "FAILED", actor: "SYSTEM", lastError: "QUEUE_UNAVAILABLE" }]);
});
