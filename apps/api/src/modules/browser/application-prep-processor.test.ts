import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApplicationPublic } from "@studio/shared";
import type { PreparationOutcome } from "./application-preparer.js";
import { ApplicationPrepProcessor, expireOldScreenshots } from "./application-prep-processor.js";

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
  preview: null,
  payloadHash: null,
  createdAt: RUN,
  updatedAt: RUN,
  events: [],
};

function setup(current: ApplicationPublic | null, prepare: () => Promise<PreparationOutcome>) {
  const recorded: Array<{ status: string; actor: string; lastError?: string }> = [];
  const applications = {
    async screenshotKey() {
      return null;
    },
    async get() {
      if (!current) throw new Error("not found");
      return current;
    },
    async recordOutcome(_id: string, status: string, actor: string, _reason: string, patch: { lastError?: string } = {}) {
      recorded.push({ status, actor, lastError: patch.lastError });
      return { ...application, status } as ApplicationPublic;
    },
  };
  const processor = new ApplicationPrepProcessor({
    applications: applications as never,
    preparer: { prepare },
    planner: { plan: async () => [] },
    files: { load: async () => assert.fail("no files"), fileHash: async () => null },
    screenshots: { put: async () => "shot.png", delete: async () => undefined },
  });
  return { processor, recorded };
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

test("a filled run stores its screenshot, preview counts and payload hash, and drops the old screenshot", async () => {
  const patches: Array<Record<string, unknown>> = [];
  const deleted: string[] = [];
  const plan = [
    {
      key: "f1",
      questionKey: "resume",
      label: "Resume",
      kind: "FILE" as const,
      required: true,
      options: [],
      status: "FILLED" as const,
      value: "CV PDF",
      documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      source: "CV" as const,
    },
  ];
  const processor = new ApplicationPrepProcessor({
    applications: {
      async screenshotKey() {
        return "old.png";
      },
      async get() {
        return application;
      },
      async recordOutcome(_id: string, status: string, _actor: string, _reason: string, patch: Record<string, unknown> = {}) {
        patches.push(patch);
        return { ...application, status } as ApplicationPublic;
      },
    } as never,
    preparer: {
      prepare: async () => ({
        status: "READY_FOR_REVIEW",
        reason: "Filled",
        plan,
        preview: { screenshot: Buffer.from("png"), pageUrl: "https://jobs.lever.co/acme/abc/apply", confirmed: 1, unverified: [], blockedRequests: 0 },
      }),
    },
    planner: { plan: async () => plan },
    files: { load: async () => assert.fail("not called by a fake preparer"), fileHash: async () => "file-hash" },
    screenshots: {
      put: async () => "new.png",
      delete: async (key) => {
        deleted.push(key);
      },
    },
    now: () => new Date("2026-10-14T13:00:00Z"),
  });

  await processor.process({ applicationId: application.id, runId: RUN });
  const patch = patches[0]!;
  assert.deepEqual(patch.preview, {
    capturedAt: "2026-10-14T13:00:00.000Z",
    screenshotKey: "new.png",
    pageUrl: "https://jobs.lever.co/acme/abc/apply",
    confirmed: 1,
    unverified: [],
    blockedRequests: 0,
  });
  assert.match(String(patch.payloadHash), /^[0-9a-f]{64}$/);
  assert.deepEqual(deleted, ["old.png"]);
});

test("screenshots past the retention limit are deleted and unlinked", async () => {
  const cleared: string[] = [];
  const deletedFiles: string[] = [];
  let cutoff: Date | null = null;
  const count = await expireOldScreenshots(
    {
      async withScreenshotsBefore(date) {
        cutoff = date;
        return [{ id: "app-1", preview: { screenshotKey: "a.png" } }];
      },
      async clearScreenshot(id) {
        cleared.push(id);
      },
    },
    async (key) => {
      deletedFiles.push(key);
    },
    new Date("2026-10-31T00:00:00Z"),
  );
  assert.equal(count, 1);
  assert.equal(cutoff!.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.deepEqual(deletedFiles, ["a.png"]);
  assert.deepEqual(cleared, ["app-1"]);
});
