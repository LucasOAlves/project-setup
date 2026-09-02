import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import { GreenhouseJobProvider, normalizeGreenhouseJob, stripHtml } from "./greenhouse-job-provider.ts";

test("stripHtml removes tags and decodes common entities", () => {
  const text = stripHtml("<p>Build &amp; ship <strong>reliable</strong> systems.</p>");
  assert.equal(text, "Build & ship reliable systems.");
});

test("stripHtml drops script and style blocks entirely, not just their tags", () => {
  const text = stripHtml("<style>.x{color:red}</style><p>Real content</p><script>track()</script>");
  assert.equal(text, "Real content");
});

test("normalizeGreenhouseJob drops a posting with no title, url, or id", () => {
  assert.equal(normalizeGreenhouseJob({ title: "Engineer" }), null);
  assert.equal(normalizeGreenhouseJob({ title: "Engineer", absolute_url: "https://x" }), null);
});

test("normalizeGreenhouseJob maps a real-shaped payload into the internal model", () => {
  const posting = normalizeGreenhouseJob({
    id: 12345,
    title: "Staff Platform Engineer",
    absolute_url: "https://boards.greenhouse.io/nimbus/jobs/12345",
    location: { name: "Remote" },
    content: "<p>Own our <b>platform</b> roadmap.</p>",
    company_name: "Nimbus",
    updated_at: "2026-08-01T00:00:00Z",
  });

  assert.equal(posting?.externalId, "12345");
  assert.equal(posting?.title, "Staff Platform Engineer");
  assert.equal(posting?.location, "Remote");
  assert.equal(posting?.description, "Own our platform roadmap.");
  assert.equal(posting?.companyNameFromSource, "Nimbus");
});

test("listJobs maps a not-found board to a provider-unavailable error, not a crash", async () => {
  const provider = new GreenhouseJobProvider(async () => new Response("Not Found", { status: 404 }));

  await assert.rejects(
    () => provider.listJobs("not-a-real-board"),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.PROVIDER_UNAVAILABLE,
  );
});

test("listJobs normalizes a real-shaped board response end to end", async () => {
  const provider = new GreenhouseJobProvider(async () =>
    new Response(
      JSON.stringify({
        jobs: [
          {
            id: 1,
            title: "Engineer",
            absolute_url: "https://boards.greenhouse.io/nimbus/jobs/1",
            location: { name: "Remote" },
            content: "<p>Do engineering.</p>",
          },
          // Missing an id — must be dropped, not crash the whole import.
          { title: "Broken posting", absolute_url: "https://x" },
        ],
      }),
    ),
  );

  const postings = await provider.listJobs("nimbus");

  assert.equal(postings.length, 1);
  assert.equal(postings[0]?.externalId, "1");
});

test("listJobs rejects an empty board token instead of calling the network", async () => {
  const provider = new GreenhouseJobProvider(async () => {
    assert.fail("must not call fetch with an empty token");
  });

  await assert.rejects(() => provider.listJobs("   "));
});
