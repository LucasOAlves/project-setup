import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { portalPolicy } from "./browser-guard.js";
import { BrowserRunTimeout, withGuardedPage } from "./browser-session.js";

// Runs a real headless Chromium against a mock portal. Skipped when no browser is installed.
const executablePath = process.env.BROWSER_EXECUTABLE_PATH || chromium.executablePath();
const skip = existsSync(executablePath) ? false : `no Chromium at ${executablePath}`;

const PAGE_URL = "https://job-boards.greenhouse.io/acme/jobs/123";
const FORM = `<!doctype html><html><head><title>Apply at Acme</title></head><body>
<form id="application" method="post" action="https://job-boards.greenhouse.io/acme/jobs/123/applications">
  <input name="first_name" value="Ada"><button type="submit">Submit application</button>
</form>
<a id="away" href="https://evil.example.com/">away</a>
</body></html>`;

const options = {
  executablePath,
  runTimeoutMs: 30_000,
  resolveHost: async () => ["104.18.1.1"],
  mockResponse: (url: string) => (url === PAGE_URL ? { contentType: "text/html", body: FORM } : null),
};

test("opens the portal page and blocks every way of submitting the form", { skip }, async () => {
  const result = await withGuardedPage(portalPolicy("greenhouse"), options, async ({ page, blocked }) => {
    await page.goto(PAGE_URL);
    const title = await page.title();

    // A click on submit, a scripted submit() and a scripted fetch POST all go nowhere.
    await page.click("button[type=submit]");
    await page.evaluate(() => (document.getElementById("application") as HTMLFormElement).submit());
    await page.evaluate(() => fetch("https://job-boards.greenhouse.io/acme/jobs/123/applications", { method: "POST", body: "x" }).catch(() => "blocked"));
    await page.waitForTimeout(300);
    return { title, url: page.url(), blocked: [...blocked] };
  });

  assert.equal(result.title, "Apply at Acme");
  assert.equal(result.url, PAGE_URL);
  assert.ok(result.blocked.some((reason) => /POST to job-boards\.greenhouse\.io/.test(reason)), result.blocked.join("\n"));
});

test("following a link off the portal is blocked", { skip }, async () => {
  const blockedReasons = await withGuardedPage(portalPolicy("greenhouse"), options, async ({ page, blocked }) => {
    await page.goto(PAGE_URL);
    await page.click("#away").catch(() => undefined);
    await page.waitForTimeout(300);
    return [...blocked];
  });
  assert.ok(blockedReasons.some((reason) => /evil\.example\.com is not the application portal/.test(reason)), blockedReasons.join("\n"));
});

test("a host resolving to a private address is never reached", { skip }, async () => {
  const blockedReasons = await withGuardedPage(
    portalPolicy("greenhouse"),
    { ...options, resolveHost: async () => ["10.0.0.8"] },
    async ({ page, blocked }) => {
      await page.goto(PAGE_URL).catch(() => undefined);
      return [...blocked];
    },
  );
  assert.ok(blockedReasons.some((reason) => /private address/.test(reason)));
});

test("a run that takes too long is stopped", { skip }, async () => {
  await assert.rejects(
    withGuardedPage(portalPolicy("greenhouse"), { ...options, runTimeoutMs: 1_500 }, async ({ page }) => {
      await page.goto(PAGE_URL);
      await page.waitForTimeout(10_000);
    }),
    BrowserRunTimeout,
  );
});
