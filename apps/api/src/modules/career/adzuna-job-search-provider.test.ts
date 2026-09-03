import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import { AdzunaJobSearchProvider, normalizeAdzunaResult } from "./adzuna-job-search-provider.ts";

test("normalizeAdzunaResult drops a result missing an id, title, or url", () => {
  assert.equal(normalizeAdzunaResult({ title: "Engineer" }), null);
  assert.equal(normalizeAdzunaResult({ title: "Engineer", redirect_url: "https://x" }), null);
});

test("normalizeAdzunaResult maps a real-shaped payload into the internal model", () => {
  const posting = normalizeAdzunaResult({
    id: 12345,
    title: "Backend Engineer",
    company: { display_name: "Nimbus" },
    location: { display_name: "Sao Paulo" },
    redirect_url: "https://www.adzuna.com.br/land/ad/12345",
    description: "Node.js and Postgres.",
    created: "2026-08-01T00:00:00Z",
  });

  assert.equal(posting?.externalId, "12345");
  assert.equal(posting?.location, "Sao Paulo");
  assert.equal(posting?.companyNameFromSource, "Nimbus");
});

test("searchJobs rejects when no App ID/Key are configured, without calling the network", async () => {
  const provider = new AdzunaJobSearchProvider("", "", async () => {
    assert.fail("must not call fetch without credentials");
  });

  await assert.rejects(
    () => provider.searchJobs({ keywords: "backend" }),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.PROVIDER_UNAVAILABLE,
  );
});

test("searchJobs rejects empty keywords instead of calling the network", async () => {
  const provider = new AdzunaJobSearchProvider("id", "key", async () => {
    assert.fail("must not call fetch with empty keywords");
  });

  await assert.rejects(() => provider.searchJobs({ keywords: "   " }));
});

test("searchJobs maps a 401/403 to a provider-unavailable error, not a crash", async () => {
  const provider = new AdzunaJobSearchProvider(
    "id",
    "key",
    async () => new Response("Forbidden", { status: 403 }),
  );

  await assert.rejects(
    () => provider.searchJobs({ keywords: "backend" }),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.PROVIDER_UNAVAILABLE,
  );
});

test("searchJobs normalizes a real-shaped search response end to end", async () => {
  const provider = new AdzunaJobSearchProvider(
    "id",
    "key",
    async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: 1,
              title: "Engineer",
              company: { display_name: "Nimbus" },
              location: { display_name: "Sao Paulo" },
              redirect_url: "https://x/1",
              description: "Do engineering.",
            },
            // Missing an id — must be dropped, not crash the whole search.
            { title: "Broken result", redirect_url: "https://x" },
          ],
        }),
      ),
  );

  const results = await provider.searchJobs({ keywords: "backend" });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.externalId, "1");
});
