import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeJobUrl, isContentHashReliable, jobContentHash } from "./job-provenance.ts";

test("canonicalizeJobUrl lowercases scheme and host but keeps path case", () => {
  assert.equal(
    canonicalizeJobUrl("HTTPS://Boards.Greenhouse.IO/Acme/jobs/123"),
    "https://boards.greenhouse.io/Acme/jobs/123",
  );
});

test("canonicalizeJobUrl drops the fragment and a trailing slash", () => {
  assert.equal(
    canonicalizeJobUrl("https://jobs.lever.co/acme/abc-123/#apply"),
    "https://jobs.lever.co/acme/abc-123",
  );
});

test("canonicalizeJobUrl keeps the root path as a single slash", () => {
  assert.equal(canonicalizeJobUrl("https://remoteok.com/"), "https://remoteok.com/");
});

test("canonicalizeJobUrl strips tracking params and sorts the rest", () => {
  assert.equal(
    canonicalizeJobUrl(
      "https://example.com/job?utm_source=x&b=2&gh_src=abc&a=1&utm_campaign=y&ref=feed",
    ),
    "https://example.com/job?a=1&b=2",
  );
});

test("canonicalizeJobUrl drops the query separator when only tracking params were present", () => {
  assert.equal(
    canonicalizeJobUrl("https://example.com/job?utm_medium=email"),
    "https://example.com/job",
  );
});

test("canonicalizeJobUrl removes a default port", () => {
  assert.equal(canonicalizeJobUrl("https://example.com:443/job"), "https://example.com/job");
});

test("canonicalizeJobUrl returns empty for empty input and trimmed input when unparseable", () => {
  assert.equal(canonicalizeJobUrl("   "), "");
  assert.equal(canonicalizeJobUrl("  not a url  "), "not a url");
});

test("jobContentHash is a 64-char hex sha256", () => {
  const hash = jobContentHash({ title: "Engineer", companyName: "Acme", description: "Build" });
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("jobContentHash ignores case, surrounding and repeated whitespace", () => {
  const a = jobContentHash({
    title: "Senior  Engineer",
    companyName: "Acme",
    description: "Build things.\n\nRemote.",
  });
  const b = jobContentHash({
    title: " senior engineer ",
    companyName: "ACME",
    description: "build things. remote.",
  });
  assert.equal(a, b);
});

test("jobContentHash ignores HTML markup in the description", () => {
  const a = jobContentHash({
    title: "Engineer",
    companyName: "Acme",
    description: "<p>Build <strong>things</strong></p>",
  });
  const b = jobContentHash({ title: "Engineer", companyName: "Acme", description: "Build things" });
  assert.equal(a, b);
});

test("jobContentHash changes when the description changes", () => {
  const a = jobContentHash({ title: "Engineer", companyName: "Acme", description: "Remote, LATAM" });
  const b = jobContentHash({ title: "Engineer", companyName: "Acme", description: "Remote, US only" });
  assert.notEqual(a, b);
});

test("jobContentHash keeps field boundaries distinct", () => {
  const a = jobContentHash({ title: "ab", companyName: "c", description: "" });
  const b = jobContentHash({ title: "a", companyName: "bc", description: "" });
  assert.notEqual(a, b);
});

test("isContentHashReliable needs a real description, not a stub", () => {
  assert.equal(isContentHashReliable(""), false);
  assert.equal(isContentHashReliable("<p>Apply now</p>"), false);
  assert.equal(
    isContentHashReliable("We are hiring a senior engineer to build our payments platform in TypeScript."),
    true,
  );
});
