import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { BrowserApplicationPreparer } from "./application-preparer.js";
import type { MockResponse } from "./browser-session.js";
import { MOCK_POSTINGS, mockPortalResponse } from "./mock-portals.js";

// A whole preparation run against the mock portals in a real headless Chromium.
const executablePath = process.env.BROWSER_EXECUTABLE_PATH || chromium.executablePath();
const skip = existsSync(executablePath) ? false : `no Chromium at ${executablePath}`;

function preparer(mockResponse: (url: string) => MockResponse | null = mockPortalResponse) {
  return new BrowserApplicationPreparer({ executablePath, runTimeoutMs: 30_000, resolveHost: async () => ["104.18.1.1"], mockResponse });
}

test("reads each supported portal's form and keeps it on the outcome", { skip }, async () => {
  for (const portal of ["greenhouse", "lever", "ashby"] as const) {
    const outcome = await preparer().prepare({ portal, destinationUrl: MOCK_POSTINGS[portal] });
    assert.equal(outcome.form?.portal, portal);
    assert.ok((outcome.form?.fields.length ?? 0) >= 10, portal);
  }
});

test("a sign-in wall stops the run as blocked by the platform", { skip }, async () => {
  const login = `<!doctype html><title>Sign in</title><form><label for="u">Email</label><input id="u"><label for="p">Password</label><input id="p" type="password"></form>`;
  const outcome = await preparer((url) => (url.startsWith("https://jobs.lever.co/") ? { contentType: "text/html", body: login } : null)).prepare({
    portal: "lever",
    destinationUrl: MOCK_POSTINGS.lever,
  });
  assert.equal(outcome.status, "BLOCKED_BY_PLATFORM");
  assert.equal(outcome.lastError, "LOGIN");
});

test("a closed posting fails with a reason", { skip }, async () => {
  const closed = (url: string) => (url.startsWith("https://jobs.ashbyhq.com/") ? { status: 404, contentType: "text/html", body: "<p>Not found</p>" } : null);
  const outcome = await preparer(closed).prepare({ portal: "ashby", destinationUrl: MOCK_POSTINGS.ashby });
  assert.equal(outcome.status, "FAILED");
  assert.equal(outcome.lastError, "HTTP_404");
});

test("a board link with no posting is refused before opening a browser", async () => {
  const outcome = await preparer().prepare({ portal: "lever", destinationUrl: "https://jobs.lever.co/acmemock" });
  assert.equal(outcome.lastError, "NOT_A_POSTING");
});
