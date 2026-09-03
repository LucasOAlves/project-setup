import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRemoteOkEntry, RemoteOkJobSearchProvider } from "./remoteok-job-search-provider.ts";

test("normalizeRemoteOkEntry skips the leading legal-notice entry", () => {
  assert.equal(normalizeRemoteOkEntry({ legal: "Please link back to us." }), null);
});

test("normalizeRemoteOkEntry drops a posting missing an id, title, or url", () => {
  assert.equal(normalizeRemoteOkEntry({ position: "Engineer" }), null);
  assert.equal(normalizeRemoteOkEntry({ position: "Engineer", url: "https://x" }), null);
});

test("normalizeRemoteOkEntry maps a real-shaped payload and strips HTML from the description", () => {
  const posting = normalizeRemoteOkEntry({
    id: "123",
    position: "Backend Engineer",
    company: "Nimbus",
    url: "https://remoteok.com/remote-jobs/123",
    location: "Remote",
    description: "<p>Build &amp; ship <b>reliable</b> systems.</p>",
    tags: ["backend", "node"],
    date: "2026-08-01T00:00:00Z",
  });

  assert.equal(posting?.externalId, "123");
  assert.equal(posting?.title, "Backend Engineer");
  assert.equal(posting?.description, "Build & ship reliable systems.");
  assert.equal(posting?.companyNameFromSource, "Nimbus");
});

test("searchJobs filters the legal notice and applies the keyword filter client-side", async () => {
  const provider = new RemoteOkJobSearchProvider(async () =>
    new Response(
      JSON.stringify([
        { legal: "Please link back to us." },
        {
          id: "1",
          position: "Backend Engineer",
          company: "Nimbus",
          url: "https://remoteok.com/remote-jobs/1",
          description: "Node.js and Postgres.",
          tags: ["backend"],
        },
        {
          id: "2",
          position: "Designer",
          company: "Nimbus",
          url: "https://remoteok.com/remote-jobs/2",
          description: "Figma all day.",
          tags: ["design"],
        },
      ]),
    ),
  );

  const results = await provider.searchJobs({ keywords: "backend" });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.externalId, "1");
});

test("searchJobs sends a browser-like User-Agent to avoid the API's bot block", async () => {
  let sentHeaders: HeadersInit | undefined;
  const provider = new RemoteOkJobSearchProvider(async (_url, init) => {
    sentHeaders = init?.headers;
    return new Response(JSON.stringify([]));
  });

  await provider.searchJobs({ keywords: "backend" });

  assert.ok(sentHeaders && (sentHeaders as Record<string, string>)["User-Agent"]);
});
