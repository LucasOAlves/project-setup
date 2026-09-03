import assert from "node:assert/strict";
import test from "node:test";
import { ArbeitnowJobSearchProvider, normalizeArbeitnowJob } from "./arbeitnow-job-search-provider.ts";

test("normalizeArbeitnowJob drops a posting missing a slug, title, or url", () => {
  assert.equal(normalizeArbeitnowJob({ title: "Engineer" }), null);
  assert.equal(normalizeArbeitnowJob({ title: "Engineer", url: "https://x" }), null);
});

test("normalizeArbeitnowJob maps a real-shaped payload, converting unix-second timestamps", () => {
  const posting = normalizeArbeitnowJob({
    slug: "backend-engineer-nimbus",
    title: "Backend Engineer",
    company_name: "Nimbus",
    url: "https://www.arbeitnow.com/jobs/backend-engineer-nimbus",
    location: "Berlin",
    description: "<p>Build &amp; ship systems.</p>",
    tags: ["backend"],
    job_types: ["full_time"],
    created_at: 1_700_000_000,
  });

  assert.equal(posting?.externalId, "backend-engineer-nimbus");
  assert.equal(posting?.description, "Build & ship systems.");
  assert.equal(posting?.companyNameFromSource, "Nimbus");
  assert.equal(posting?.updatedAt.getTime(), 1_700_000_000 * 1000);
});

test("searchJobs filters by keyword against title, description, tags, and job types", async () => {
  const provider = new ArbeitnowJobSearchProvider(async () =>
    new Response(
      JSON.stringify({
        data: [
          {
            slug: "backend-1",
            title: "Backend Engineer",
            company_name: "Nimbus",
            url: "https://x/1",
            description: "Node.js and Postgres.",
            tags: ["backend"],
            job_types: ["full_time"],
          },
          {
            slug: "design-1",
            title: "Designer",
            company_name: "Nimbus",
            url: "https://x/2",
            description: "Figma all day.",
            tags: ["design"],
            job_types: ["full_time"],
          },
        ],
      }),
    ),
  );

  const results = await provider.searchJobs({ keywords: "backend" });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.externalId, "backend-1");
});
