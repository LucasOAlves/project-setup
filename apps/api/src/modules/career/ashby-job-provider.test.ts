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

test("listJobs asks Ashby for compensation", async () => {
  let requested = "";
  const provider = new AshbyJobProvider(async (input) => {
    requested = String(input);
    return new Response(JSON.stringify({ jobs: [] }));
  });

  await provider.listJobs("nimbus");

  assert.equal(new URL(requested).searchParams.get("includeCompensation"), "true");
});

test("normalizeAshbyJob maps the salary component, posted date and employment type", () => {
  const posting = normalizeAshbyJob({
    id: "abc123",
    title: "Senior Engineer",
    jobUrl: "https://jobs.ashbyhq.com/nimbus/abc123",
    publishedAt: "2026-08-01T00:00:00Z",
    employmentType: "FullTime",
    compensation: {
      compensationTierSummary: "$150K – $200K • Offers Equity",
      scrapeableCompensationSalarySummary: "$150K - $200K",
      summaryComponents: [
        { compensationType: "EquityPercentage", interval: "NONE", minValue: 0.1, maxValue: 0.2 },
        { compensationType: "Salary", interval: "1 YEAR", currencyCode: "USD", minValue: 150000, maxValue: 200000 },
      ],
    },
  });

  assert.deepEqual(posting?.salary, {
    min: 150000,
    max: 200000,
    currency: "USD",
    period: "year",
    text: "$150K - $200K",
  });
  assert.equal(posting?.postedAt?.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(posting?.employmentType, "FullTime");
});

test("normalizeAshbyJob keeps the summary text when there is no structured salary", () => {
  const posting = normalizeAshbyJob({
    id: "abc123",
    title: "Senior Engineer",
    jobUrl: "https://jobs.ashbyhq.com/nimbus/abc123",
    compensation: { compensationTierSummary: "€70K – €90K", summaryComponents: [] },
  });

  assert.equal(posting?.salary?.text, "€70K – €90K");
  assert.equal(posting?.salary?.min, null);
});

test("normalizeAshbyJob leaves salary undefined when the company publishes none", () => {
  const posting = normalizeAshbyJob({
    id: "abc123",
    title: "Senior Engineer",
    jobUrl: "https://jobs.ashbyhq.com/nimbus/abc123",
    compensation: { summaryComponents: [] },
  });

  assert.equal(posting?.salary, undefined);
  assert.equal(posting?.postedAt, null);
});
