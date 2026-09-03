import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import { AshbyJobProvider, normalizeAshbyJob } from "./ashby-job-provider.ts";

test("normalizeAshbyJob drops a posting missing an id, title, or url", () => {
  assert.equal(normalizeAshbyJob({ title: "Engineer" }), null);
  assert.equal(normalizeAshbyJob({ title: "Engineer", jobUrl: "https://x" }), null);
});

test("normalizeAshbyJob maps a real-shaped payload into the internal model", () => {
  const posting = normalizeAshbyJob({
    id: "abc123",
    title: "Staff Platform Engineer",
    jobUrl: "https://jobs.ashbyhq.com/nimbus/abc123",
    location: "Remote",
    descriptionPlain: "Own our platform roadmap.",
    publishedAt: "2026-08-01T00:00:00Z",
  });

  assert.equal(posting?.externalId, "abc123");
  assert.equal(posting?.title, "Staff Platform Engineer");
  assert.equal(posting?.location, "Remote");
  assert.equal(posting?.description, "Own our platform roadmap.");
  assert.equal(posting?.companyNameFromSource, "");
});

test("normalizeAshbyJob falls back to applyUrl when jobUrl is missing", () => {
  const posting = normalizeAshbyJob({
    id: "abc123",
    title: "Engineer",
    applyUrl: "https://jobs.ashbyhq.com/nimbus/apply/abc123",
  });

  assert.equal(posting?.url, "https://jobs.ashbyhq.com/nimbus/apply/abc123");
});

test("listJobs maps a 404 board to a provider-unavailable error, not a crash", async () => {
  const provider = new AshbyJobProvider(async () => new Response("Not Found", { status: 404 }));

  await assert.rejects(
    () => provider.listJobs("not-a-real-board"),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.PROVIDER_UNAVAILABLE,
  );
});

test("listJobs normalizes a real-shaped board response end to end", async () => {
  const provider = new AshbyJobProvider(async () =>
    new Response(
      JSON.stringify({
        jobs: [
          {
            id: "1",
            title: "Engineer",
            jobUrl: "https://jobs.ashbyhq.com/nimbus/1",
            location: "Remote",
            descriptionPlain: "Do engineering.",
          },
          // Missing an id — must be dropped, not crash the whole import.
          { title: "Broken posting", jobUrl: "https://x" },
        ],
      }),
    ),
  );

  const postings = await provider.listJobs("nimbus");

  assert.equal(postings.length, 1);
  assert.equal(postings[0]?.externalId, "1");
});

test("listJobs rejects an empty board token instead of calling the network", async () => {
  const provider = new AshbyJobProvider(async () => {
    assert.fail("must not call fetch with an empty token");
  });

  await assert.rejects(() => provider.listJobs("   "));
});
