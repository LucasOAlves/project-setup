import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import { normalizeWorkableJob, WorkableJobProvider } from "./workable-job-provider.ts";

test("normalizeWorkableJob drops a posting missing a shortcode, title or url", () => {
  assert.equal(normalizeWorkableJob({ title: "Engineer", url: "https://apply.workable.com/acme/j/1" }), null);
  assert.equal(normalizeWorkableJob({ shortcode: "1", url: "https://x" }), null);
});

test("normalizeWorkableJob maps a real-shaped job with a nested location", () => {
  const posting = normalizeWorkableJob(
    {
      title: "Senior Backend Engineer",
      shortcode: "ABC123DEF",
      url: "https://apply.workable.com/acme/j/ABC123DEF/",
      description: "<p>Build <strong>APIs</strong> in Node.js.</p>",
      published_on: "2026-10-01",
      employment_type: "Full-time",
      location: { location_str: "Brazil", telecommuting: true },
    },
    "Acme",
  );

  assert.equal(posting?.externalId, "ABC123DEF");
  assert.equal(posting?.location, "Remote (Brazil)");
  assert.equal(posting?.description, "Build APIs in Node.js.");
  assert.equal(posting?.companyNameFromSource, "Acme");
  assert.equal(posting?.postedAt?.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(posting?.employmentType, "Full-time");
});

test("normalizeWorkableJob reads a flat location and prefers the full description", () => {
  const posting = normalizeWorkableJob({
    title: "Engineer",
    shortcode: "X1",
    shortlink: "https://apply.workable.com/j/X1",
    city: "Lisbon",
    country: "Portugal",
    telecommuting: false,
    description: "Short.",
    full_description: "Short. And the requirements.",
  });

  assert.equal(posting?.url, "https://apply.workable.com/j/X1");
  assert.equal(posting?.location, "Lisbon, Portugal");
  assert.equal(posting?.description, "Short. And the requirements.");
  assert.equal(posting?.postedAt, null);
});

test("listJobs calls the widget endpoint with details and maps a 404 to provider-unavailable", async () => {
  let requested = "";
  const ok = new WorkableJobProvider(async (input) => {
    requested = String(input);
    return new Response(
      JSON.stringify({
        name: "Acme",
        jobs: [
          { title: "Engineer", shortcode: "A1", url: "https://apply.workable.com/acme/j/A1/" },
          { title: "Broken" },
        ],
      }),
    );
  });
  const postings = await ok.listJobs("acme");
  assert.equal(requested, "https://apply.workable.com/api/v1/widget/accounts/acme?details=true");
  assert.equal(postings.length, 1);
  assert.equal(postings[0]?.companyNameFromSource, "Acme");

  const missing = new WorkableJobProvider(async () => new Response("Not Found", { status: 404 }));
  await assert.rejects(
    () => missing.listJobs("nope"),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.PROVIDER_UNAVAILABLE,
  );
});
