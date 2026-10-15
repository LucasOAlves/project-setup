import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import { BraveSearchClient } from "./brave-search-client.ts";

test("search sends the key in the header, asks for the past week and returns the result URLs", async () => {
  let requested = "";
  let token = "";
  const client = new BraveSearchClient("secret-key", async (input, init) => {
    requested = String(input);
    token = new Headers(init?.headers).get("X-Subscription-Token") ?? "";
    return new Response(
      JSON.stringify({ web: { results: [{ url: "https://jobs.lever.co/acme/1", title: "Engineer" }, { title: "no url" }] } }),
    );
  });

  const results = await client.search('site:jobs.lever.co "ai engineer"');

  const url = new URL(requested);
  assert.equal(url.origin + url.pathname, "https://api.search.brave.com/res/v1/web/search");
  assert.equal(url.searchParams.get("q"), 'site:jobs.lever.co "ai engineer"');
  assert.equal(url.searchParams.get("freshness"), "pw");
  assert.equal(url.searchParams.get("count"), "20");
  assert.equal(token, "secret-key");
  assert.deepEqual(results, [{ url: "https://jobs.lever.co/acme/1", title: "Engineer" }]);
});

test("a rejected key and a failed response map to provider-unavailable", async () => {
  for (const status of [401, 429, 500]) {
    const client = new BraveSearchClient("k", async () => new Response("no", { status }));
    await assert.rejects(
      () => client.search("x"),
      (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.PROVIDER_UNAVAILABLE,
    );
  }
});
