import assert from "node:assert/strict";
import test from "node:test";
import {
  himalayasLocation,
  HimalayasJobSearchProvider,
  normalizeHimalayasEntry,
} from "./himalayas-job-search-provider.ts";

const SAMPLE = {
  guid: "example-guid-123",
  title: "Senior Backend Engineer",
  companyName: "Example Co",
  applicationLink: "https://himalayas.app/companies/example-co/jobs/senior-backend-engineer",
  description: "<p>Build <b>Node.js</b> services.</p>",
  locationRestrictions: [{ alpha2: "BR", name: "Brazil" }],
  pubDate: 1755763200000,
};

test("himalayasLocation lists restricted countries, or Worldwide when there are none", () => {
  assert.equal(himalayasLocation([{ name: "Brazil" }, { name: "Mexico" }]), "Brazil, Mexico");
  assert.equal(himalayasLocation([]), "Worldwide");
  assert.equal(himalayasLocation(null), "Worldwide");
});

test("normalizeHimalayasEntry drops a posting missing a guid, title, or link", () => {
  assert.equal(normalizeHimalayasEntry({ title: "Engineer", applicationLink: "https://x" }), null);
  assert.equal(normalizeHimalayasEntry({ guid: "g", applicationLink: "https://x" }), null);
  assert.equal(normalizeHimalayasEntry({ guid: "g", title: "Engineer" }), null);
});

test("normalizeHimalayasEntry maps a documented payload", () => {
  const posting = normalizeHimalayasEntry(SAMPLE);
  assert.equal(posting?.externalId, "example-guid-123");
  assert.equal(posting?.location, "Brazil");
  assert.equal(posting?.description, "Build Node.js services.");
  assert.equal(posting?.companyNameFromSource, "Example Co");
  assert.equal(posting?.updatedAt.toISOString(), "2025-08-21T08:00:00.000Z");
});

test("normalizeHimalayasEntry accepts pubDate as an ISO string and falls back to the excerpt", () => {
  const posting = normalizeHimalayasEntry({
    ...SAMPLE,
    description: undefined,
    excerpt: "Short summary",
    pubDate: "2026-10-01T00:00:00Z",
  });
  assert.equal(posting?.description, "Short summary");
  assert.equal(posting?.updatedAt.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("searchJobs sends the keywords as q and keeps worldwide roles for any location", async () => {
  let requested = "";
  const provider = new HimalayasJobSearchProvider(async (input) => {
    requested = String(input);
    return new Response(
      JSON.stringify({
        jobs: [
          SAMPLE,
          { ...SAMPLE, guid: "world", locationRestrictions: [] },
          { ...SAMPLE, guid: "us", locationRestrictions: [{ name: "United States" }] },
        ],
      }),
      { status: 200 },
    );
  });
  const results = await provider.searchJobs({ keywords: "node", location: "brazil" });
  assert.match(requested, /q=node/);
  assert.deepEqual(results.map((posting) => posting.externalId), ["example-guid-123", "world"]);
});

test("searchJobs reports a rate limit distinctly", async () => {
  const provider = new HimalayasJobSearchProvider(async () => new Response("slow down", { status: 429 }));
  await assert.rejects(() => provider.searchJobs({ keywords: "node" }), /rate limiting/);
});

test("normalizeHimalayasEntry carries structured salary and employment type", () => {
  const posting = normalizeHimalayasEntry({
    ...SAMPLE,
    minSalary: 120000,
    maxSalary: 160000,
    currency: "USD",
    salaryPeriod: "annual",
    employmentType: "Full Time",
  });
  assert.deepEqual(posting?.salary, { min: 120000, max: 160000, currency: "USD", period: "annual" });
  assert.equal(posting?.employmentType, "Full Time");
  assert.equal(normalizeHimalayasEntry(SAMPLE)?.salary, undefined);
});
