import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRemotiveEntry, RemotiveJobSearchProvider } from "./remotive-job-search-provider.ts";

const SAMPLE = {
  id: 123,
  url: "https://remotive.com/remote-jobs/software-dev/lead-developer-123",
  title: "Lead Developer",
  company_name: "Nimbus &amp; Co",
  candidate_required_location: "LATAM",
  description: "<p>Build <b>Angular</b> apps.</p>",
  publication_date: "2026-10-01T10:23:26",
};

test("normalizeRemotiveEntry drops a posting missing an id, title, or url", () => {
  assert.equal(normalizeRemotiveEntry({ title: "Engineer", url: "https://x" }), null);
  assert.equal(normalizeRemotiveEntry({ id: 1, url: "https://x" }), null);
  assert.equal(normalizeRemotiveEntry({ id: 1, title: "Engineer" }), null);
});

test("normalizeRemotiveEntry maps a documented payload and strips HTML", () => {
  const posting = normalizeRemotiveEntry(SAMPLE);
  assert.equal(posting?.externalId, "123");
  assert.equal(posting?.title, "Lead Developer");
  assert.equal(posting?.location, "LATAM");
  assert.equal(posting?.description, "Build Angular apps.");
  assert.equal(posting?.companyNameFromSource, "Nimbus & Co");
  assert.equal(posting?.updatedAt.getUTCFullYear(), 2026);
});

test("searchJobs sends the keywords as Remotive's search param", async () => {
  let requested = "";
  const provider = new RemotiveJobSearchProvider(async (input) => {
    requested = String(input);
    return new Response(JSON.stringify({ jobs: [SAMPLE] }), { status: 200 });
  });
  const results = await provider.searchJobs({ keywords: "angular" });
  assert.match(requested, /search=angular/);
  assert.equal(results.length, 1);
});

test("searchJobs filters by candidate location when one is given", async () => {
  const provider = new RemotiveJobSearchProvider(async () =>
    new Response(
      JSON.stringify({ jobs: [SAMPLE, { ...SAMPLE, id: 124, candidate_required_location: "USA Only" }] }),
      { status: 200 },
    ),
  );
  const results = await provider.searchJobs({ keywords: "dev", location: "latam" });
  assert.deepEqual(results.map((posting) => posting.externalId), ["123"]);
});

test("searchJobs maps an HTTP error to provider unavailable", async () => {
  const provider = new RemotiveJobSearchProvider(async () => new Response("nope", { status: 500 }));
  await assert.rejects(() => provider.searchJobs({ keywords: "dev" }), /Remotive is unavailable/);
});
