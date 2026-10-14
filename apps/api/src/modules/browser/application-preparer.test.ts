import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import type { ApplicationDetailsPublic, FormField } from "@studio/shared";
import { mapFormFields } from "../career/application-field-mapper.js";
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

// A filled run end to end: the real field mapper's plan, typed into each mock portal.

const DETAILS: ApplicationDetailsPublic = {
  contact: {
    email: "ada@example.com",
    phone: "+55 48 99999-0000",
    city: "Florianópolis",
    country: "Brazil",
    linkedinUrl: "https://linkedin.com/in/ada-mock",
    githubUrl: "https://github.com/ada-mock",
    portfolioUrl: "",
  },
  education: [],
  certifications: [],
  spokenLanguages: [],
  workAuthorization: "Brazilian citizen",
  requiresVisaSponsorship: false,
  noticePeriod: "30 days",
  timeZone: "UTC-3",
  salaryExpectation: { amount: 8000, currency: "USD", period: "MONTH" },
  version: 1,
  updatedAt: "2026-10-14T12:00:00.000Z",
};
const CV_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function planWith(saved: Record<string, string> = {}) {
  return async (fields: FormField[]) =>
    mapFormFields({
      fields,
      person: { fullName: "Ada Mock", currentCompany: "Engines Inc" },
      details: DETAILS,
      answers: [{ id: "WHY_COMPANY", question: "Why?", answer: "I build payment APIs.", status: "DRAFTED" }],
      experiences: [{ startPeriod: "2018", endPeriod: "Present", technologies: ["Node.js"] }],
      documents: { cv: { id: CV_ID, hasFile: true }, coverLetter: null },
      saved,
      agreed: [],
      now: new Date("2026-10-14T12:00:00Z"),
    });
}

const loadFile = async () => ({ name: "cv-v1.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 mock") });

test("fills each mock portal, confirms what the page kept, and takes a masked screenshot, without submitting", { skip }, async () => {
  for (const portal of ["greenhouse", "lever", "ashby"] as const) {
    const outcome = await preparer().prepare({ portal, destinationUrl: MOCK_POSTINGS[portal], planFields: planWith(), loadFile });
    assert.ok(outcome.preview, portal);
    assert.equal(outcome.preview.blockedRequests, 0, `${portal}: no request was blocked, so nothing tried to submit`);
    assert.ok(outcome.preview.screenshot?.subarray(1, 4).toString() === "PNG", `${portal}: screenshot is a PNG`);
    const filled = outcome.plan!.filter((field) => field.status === "FILLED");
    assert.equal(outcome.preview.confirmed + outcome.preview.unverified.length, filled.length, `${portal}: every filled field was confirmed`);
    assert.ok(filled.some((field) => field.kind === "FILE"), `${portal}: CV attached`);
  }
});

test("Greenhouse: the location suggestion is picked, and the questions left are the ones only the user can answer", { skip }, async () => {
  const outcome = await preparer().prepare({ portal: "greenhouse", destinationUrl: MOCK_POSTINGS.greenhouse, planFields: planWith(), loadFile });
  assert.equal(outcome.status, "NEEDS_INFORMATION");
  const questions = outcome.plan!.filter((field) => field.status === "NEEDS_INPUT").map((field) => field.label);
  assert.deepEqual(questions, ["Are you legally authorized to work in the country where you will be based?"]);
});

test("with the open question answered, Ashby is ready for review with every Yes/No confirmed", { skip }, async () => {
  const outcome = await preparer().prepare({
    portal: "ashby",
    destinationUrl: MOCK_POSTINGS.ashby,
    planFields: planWith({ "are you authorized to work in your country of residence": "Yes" }),
    loadFile,
  });
  assert.equal(outcome.status, "READY_FOR_REVIEW");
  assert.deepEqual(outcome.preview?.unverified, []);
});
