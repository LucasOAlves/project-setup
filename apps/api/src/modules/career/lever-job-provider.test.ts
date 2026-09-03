import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import { LeverJobProvider, normalizeLeverPosting } from "./lever-job-provider.ts";

test("normalizeLeverPosting drops a posting missing an id, title, or url", () => {
  assert.equal(normalizeLeverPosting({ text: "Engineer" }), null);
  assert.equal(normalizeLeverPosting({ text: "Engineer", hostedUrl: "https://x" }), null);
});

test("normalizeLeverPosting maps a real-shaped payload into the internal model", () => {
  const posting = normalizeLeverPosting({
    id: "abc123",
    text: "Staff Platform Engineer",
    hostedUrl: "https://jobs.lever.co/nimbus/abc123",
    categories: { location: "Remote" },
    descriptionPlain: "Own our platform roadmap.",
    createdAt: 1_700_000_000_000,
  });

  assert.equal(posting?.externalId, "abc123");
  assert.equal(posting?.title, "Staff Platform Engineer");
  assert.equal(posting?.location, "Remote");
  assert.equal(posting?.description, "Own our platform roadmap.");
  assert.equal(posting?.companyNameFromSource, "");
});

test("listJobs maps a 404 board to a provider-unavailable error, not a crash", async () => {
  const provider = new LeverJobProvider(async () => new Response("Not Found", { status: 404 }));

  await assert.rejects(
    () => provider.listJobs("not-a-real-board"),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.PROVIDER_UNAVAILABLE,
  );
});

test("listJobs normalizes a real-shaped board response end to end", async () => {
  const provider = new LeverJobProvider(async () =>
    new Response(
      JSON.stringify([
        {
          id: "1",
          text: "Engineer",
          hostedUrl: "https://jobs.lever.co/nimbus/1",
          categories: { location: "Remote" },
          descriptionPlain: "Do engineering.",
        },
        // Missing an id — must be dropped, not crash the whole import.
        { text: "Broken posting", hostedUrl: "https://x" },
      ]),
    ),
  );

  const postings = await provider.listJobs("nimbus");

  assert.equal(postings.length, 1);
  assert.equal(postings[0]?.externalId, "1");
});

test("listJobs treats a non-array body as an unknown board", async () => {
  const provider = new LeverJobProvider(async () =>
    new Response(JSON.stringify({ ok: false, error: "unknown board" })),
  );

  await assert.rejects(
    () => provider.listJobs("not-a-real-board"),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.PROVIDER_UNAVAILABLE,
  );
});

test("listJobs rejects an empty board token instead of calling the network", async () => {
  const provider = new LeverJobProvider(async () => {
    assert.fail("must not call fetch with an empty token");
  });

  await assert.rejects(() => provider.listJobs("   "));
});
