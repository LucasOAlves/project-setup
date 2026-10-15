import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import type { FormField, SupportedApplicationPortal } from "@studio/shared";
import { portalPolicy } from "./browser-guard.js";
import { withGuardedPage } from "./browser-session.js";
import { applicationPageUrl } from "./form-fields.js";
import { FormNotFound, readApplicationForm } from "./form-reader.js";
import { MOCK_POSTINGS, mockPortalResponse } from "./mock-portals.js";

// Reads the mock portals in a real headless Chromium. Skipped when no browser is installed.
const executablePath = process.env.BROWSER_EXECUTABLE_PATH || chromium.executablePath();
const skip = existsSync(executablePath) ? false : `no Chromium at ${executablePath}`;

async function read(portal: SupportedApplicationPortal): Promise<{ fields: FormField[]; blocked: string[] }> {
  return withGuardedPage(
    portalPolicy(portal),
    { executablePath, runTimeoutMs: 30_000, resolveHost: async () => ["104.18.1.1"], mockResponse: mockPortalResponse },
    async ({ page, blocked }) => {
      await page.goto(applicationPageUrl(portal, MOCK_POSTINGS[portal])!);
      return { fields: await readApplicationForm(page, portal, 5_000), blocked: [...blocked] };
    },
  );
}

const summary = (fields: FormField[]) => fields.map((field) => `${field.kind}${field.required ? "*" : ""} ${field.label}`);

test("reads the Greenhouse form: labels, kinds, required markers, hidden file inputs", { skip }, async () => {
  const { fields } = await read("greenhouse");
  assert.deepEqual(summary(fields), [
    "TEXT* First Name",
    "TEXT* Last Name",
    "EMAIL* Email",
    "PHONE Phone",
    "COMBOBOX* Location (City)",
    "FILE* Resume/CV",
    "FILE Cover Letter",
    "TEXT LinkedIn Profile",
    "TEXT Website",
    "COMBOBOX* Are you legally authorized to work in the country where you will be based?",
    "COMBOBOX* Will you now or in the future require visa sponsorship?",
    "TEXT What are your salary expectations (USD per month)?",
    "TEXTAREA* Why do you want to work at Acme Mock?",
    "SELECT How did you hear about this job?",
    "SELECT Gender (voluntary)",
  ]);
  assert.deepEqual(fields.find((field) => field.label === "How did you hear about this job?")?.options, ["LinkedIn", "Company website", "Referral", "Other"]);
  assert.equal(fields.find((field) => field.kind === "FILE")?.accept, ".pdf,.doc,.docx,.txt,.rtf");
});

test("reads the Lever form: container labels, link fields, radio groups and consent", { skip }, async () => {
  const { fields } = await read("lever");
  assert.deepEqual(summary(fields), [
    "FILE* Resume/CV",
    "TEXT* Full name",
    "EMAIL* Email",
    "TEXT Phone",
    "TEXT* Current location",
    "TEXT Current company",
    "TEXT LinkedIn URL",
    "TEXT GitHub URL",
    "TEXT Portfolio URL",
    "RADIO* Do you require visa sponsorship to work for us?",
    "TEXT* How many years of experience do you have with Node.js?",
    "TEXTAREA Additional information",
    "CHECKBOX* I agree to Acme Mock storing my data for this application.",
  ]);
  assert.deepEqual(fields.find((field) => field.kind === "RADIO")?.options, ["Yes", "No"]);
  assert.equal(fields.find((field) => field.label === "LinkedIn URL")?.name, "urls[LinkedIn]");
});

test("reads the Ashby form, including Yes/No button questions", { skip }, async () => {
  const { fields } = await read("ashby");
  assert.deepEqual(summary(fields), [
    "TEXT* Name",
    "EMAIL* Email",
    "FILE* Resume",
    "PHONE Phone Number",
    "URL LinkedIn Profile",
    "COMBOBOX* Where are you located?",
    "YES_NO* Are you authorized to work in your country of residence?",
    "YES_NO* Will you now or in the future require visa sponsorship?",
    "TEXT What is your notice period?",
    "SELECT* Which time zone do you work in?",
  ]);
});

test("the injected instructions on the page do nothing: no request leaves the portal", { skip }, async () => {
  for (const portal of ["greenhouse", "lever", "ashby"] as const) {
    const { blocked } = await read(portal);
    assert.deepEqual(blocked, [], portal);
  }
});

test("a page without a form is reported, not guessed at", { skip }, async () => {
  await assert.rejects(
    withGuardedPage(
      portalPolicy("lever"),
      {
        executablePath,
        runTimeoutMs: 30_000,
        resolveHost: async () => ["104.18.1.1"],
        mockResponse: (url) => (url.startsWith("https://jobs.lever.co/") ? { contentType: "text/html", body: "<p>This job is closed.</p>" } : null),
      },
      async ({ page }) => {
        await page.goto("https://jobs.lever.co/acmemock/closed/apply");
        return readApplicationForm(page, "lever", 1_000);
      },
    ),
    FormNotFound,
  );
});
