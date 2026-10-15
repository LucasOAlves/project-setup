import assert from "node:assert/strict";
import test from "node:test";
import {
  extractRegions,
  normalizeEmploymentType,
  normalizeSalary,
  postingAgeDays,
} from "./job-normalization.ts";

// --- Salary -----------------------------------------------------------------------------

test("normalizeSalary returns null when nothing is disclosed", () => {
  assert.equal(normalizeSalary({}), null);
  assert.equal(normalizeSalary({ text: "" }), null);
  assert.equal(normalizeSalary({ text: "Competitive salary + equity" }), null);
});

test("normalizeSalary reads an annual USD range written with thousands separators", () => {
  assert.deepEqual(normalizeSalary({ text: "$40,000 - $50,000" }), {
    min: 40000,
    max: 50000,
    currency: "USD",
    period: "YEAR",
    usdMonthlyMin: 3333,
    usdMonthlyMax: 4167,
    approximate: false,
  });
});

test("normalizeSalary understands k suffixes", () => {
  const salary = normalizeSalary({ text: "$80k-$100k" });
  assert.equal(salary?.min, 80000);
  assert.equal(salary?.max, 100000);
  assert.equal(salary?.period, "YEAR");
});

test("normalizeSalary honours an explicit monthly period", () => {
  const salary = normalizeSalary({ text: "USD 6,000 per month" });
  assert.equal(salary?.period, "MONTH");
  assert.equal(salary?.usdMonthlyMin, 6000);
  assert.equal(salary?.usdMonthlyMax, 6000);
});

test("normalizeSalary converts hourly rates at 160 hours a month", () => {
  const salary = normalizeSalary({ text: "$50 - $70/hr" });
  assert.equal(salary?.period, "HOUR");
  assert.equal(salary?.usdMonthlyMin, 8000);
  assert.equal(salary?.usdMonthlyMax, 11200);
});

test("normalizeSalary guesses the period from magnitude when none is written", () => {
  assert.equal(normalizeSalary({ text: "$120,000" })?.period, "YEAR");
  assert.equal(normalizeSalary({ text: "$7,500" })?.period, "MONTH");
  assert.equal(normalizeSalary({ text: "$45" })?.period, "HOUR");
});

test("normalizeSalary converts other currencies approximately", () => {
  const salary = normalizeSalary({ text: "€60k" });
  assert.equal(salary?.currency, "EUR");
  assert.equal(salary?.approximate, true);
  assert.ok((salary?.usdMonthlyMin ?? 0) > 5000);
});

test("normalizeSalary reads Brazilian reais with dot thousands separators", () => {
  const salary = normalizeSalary({ text: "R$ 20.000 - R$ 25.000 por mês" });
  assert.equal(salary?.currency, "BRL");
  assert.equal(salary?.min, 20000);
  assert.equal(salary?.max, 25000);
  assert.equal(salary?.period, "MONTH");
});

test("normalizeSalary uses structured fields when the source provides them", () => {
  assert.deepEqual(normalizeSalary({ min: 120000, max: 160000, currency: "USD", period: "annual" }), {
    min: 120000,
    max: 160000,
    currency: "USD",
    period: "YEAR",
    usdMonthlyMin: 10000,
    usdMonthlyMax: 13333,
    approximate: false,
  });
});

test("normalizeSalary fills a missing bound from the other", () => {
  const salary = normalizeSalary({ min: 9000, max: null, currency: "USD", period: "monthly" });
  assert.equal(salary?.max, 9000);
});

test("normalizeSalary returns null for an unknown currency instead of guessing", () => {
  assert.equal(normalizeSalary({ min: 100000, max: 120000, currency: "XYZ", period: "annual" }), null);
});

// --- Regions ------------------------------------------------------------------------------

test("extractRegions returns nothing for an empty location", () => {
  assert.deepEqual(extractRegions(""), []);
});

test("extractRegions recognises worldwide wording", () => {
  assert.deepEqual(extractRegions("Worldwide"), ["WORLDWIDE"]);
  assert.deepEqual(extractRegions("Remote - Anywhere"), ["WORLDWIDE"]);
});

test("extractRegions recognises LATAM and Brazil", () => {
  assert.deepEqual(extractRegions("LATAM"), ["LATAM"]);
  assert.deepEqual(extractRegions("Latin America, Brazil"), ["BRAZIL", "LATAM"]);
  assert.deepEqual(extractRegions("Brasil"), ["BRAZIL"]);
});

test("extractRegions recognises US-only wording without matching the word 'us'", () => {
  assert.deepEqual(extractRegions("USA Only"), ["USA"]);
  assert.deepEqual(extractRegions("Remote (US)"), ["USA"]);
  assert.deepEqual(extractRegions("United States"), ["USA"]);
  assert.deepEqual(extractRegions("Join us remotely from Europe"), ["EUROPE"]);
});

test("extractRegions keeps Americas distinct from Latin America", () => {
  assert.deepEqual(extractRegions("Americas"), ["AMERICAS"]);
  assert.deepEqual(extractRegions("Latin America"), ["LATAM"]);
});

test("extractRegions handles multi-region lists", () => {
  assert.deepEqual(extractRegions("Brazil, Mexico, United Kingdom, EMEA"), ["BRAZIL", "EMEA", "LATAM", "UK"]);
});

// --- Employment type ----------------------------------------------------------------------

test("normalizeEmploymentType maps common source spellings", () => {
  assert.equal(normalizeEmploymentType("full_time"), "FULL_TIME");
  assert.equal(normalizeEmploymentType("Full Time"), "FULL_TIME");
  assert.equal(normalizeEmploymentType("Part-time"), "PART_TIME");
  assert.equal(normalizeEmploymentType("contract"), "CONTRACT");
  assert.equal(normalizeEmploymentType("Contractor"), "CONTRACT");
  assert.equal(normalizeEmploymentType("freelance"), "CONTRACT");
  assert.equal(normalizeEmploymentType("Internship"), "INTERNSHIP");
  assert.equal(normalizeEmploymentType("other"), "OTHER");
});

test("normalizeEmploymentType returns null when unknown or empty", () => {
  assert.equal(normalizeEmploymentType(""), null);
  assert.equal(normalizeEmploymentType(null), null);
  assert.equal(normalizeEmploymentType("volunteer-ish"), null);
});

// --- Posting age --------------------------------------------------------------------------

test("postingAgeDays counts whole days and never goes negative", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  assert.equal(postingAgeDays(new Date("2026-10-14T01:00:00Z"), now), 0);
  assert.equal(postingAgeDays(new Date("2026-10-10T12:00:00Z"), now), 4);
  assert.equal(postingAgeDays(new Date("2026-10-20T00:00:00Z"), now), 0);
  assert.equal(postingAgeDays(null, now), null);
});
