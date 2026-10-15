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

test("a submission run lets exactly one submit through, and only after it is armed", { skip }, async () => {
  const submitOptions = {
    ...options,
    submit: { destinationUrl: PAGE_URL },
    mockResponse: (url: string, method: string) => {
      if (url === PAGE_URL) return { contentType: "text/html", body: FORM };
      if (method === "POST" && url === `${PAGE_URL}/applications`) {
        return { contentType: "text/html", body: "<!doctype html><title>Thanks</title><h1>Thank you for applying</h1>" };
      }
      return null;
    },
  };
  const result = await withGuardedPage(portalPolicy("greenhouse"), submitOptions, async ({ page, blocked, armSubmit, submits }) => {
    await page.goto(PAGE_URL);
    // Not armed yet: the page's own submit goes nowhere.
    await page.evaluate(() => fetch("https://job-boards.greenhouse.io/acme/jobs/123/applications", { method: "POST", body: "x" }).catch(() => "blocked"));
    const beforeArm = submits.length;
    armSubmit();
    await Promise.all([page.waitForURL(`${PAGE_URL}/applications`), page.click("button[type=submit]")]);
    const heading = await page.locator("h1").innerText();
    // A second submit in the same run is refused.
    await page.evaluate(() => fetch("https://job-boards.greenhouse.io/acme/jobs/123/applications", { method: "POST", body: "again" }).catch(() => "blocked"));
    await page.waitForTimeout(200);
    return { beforeArm, heading, submits: [...submits], blocked: [...blocked] };
  });

  assert.equal(result.beforeArm, 0);
  assert.equal(result.heading, "Thank you for applying");
  assert.deepEqual(result.submits.map((record) => [record.method, record.status]), [["POST", 200]]);
  assert.ok(result.blocked.some((reason) => /before the approval/.test(reason)), result.blocked.join("\n"));
  assert.ok(result.blocked.some((reason) => /already sent the application once/.test(reason)), result.blocked.join("\n"));
});
