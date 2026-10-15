import assert from "node:assert/strict";
import test from "node:test";
import {
  ATS_SEARCH_DOMAINS,
  buildWebSearchQuery,
  companyNameFromToken,
  groupResultsByBoard,
  MAX_QUERY_LENGTH,
  MAX_QUERY_WORDS,
  selectPostingsForResults,
} from "./web-search-discovery.ts";
import type { NormalizedJobPosting } from "./job-provider.ts";

test("one query per ATS domain covers both Greenhouse hosts and the other four boards", () => {
  assert.deepEqual(ATS_SEARCH_DOMAINS, [
    "jobs.ashbyhq.com",
    "job-boards.greenhouse.io",
    "boards.greenhouse.io",
    "jobs.lever.co",
    "apply.workable.com",
    "jobs.smartrecruiters.com",
  ]);
});

test("a query restricts to the domain, ORs the titles and regions and excludes US-only work", () => {
  assert.equal(
    buildWebSearchQuery("jobs.lever.co", ["senior software engineer", "ai engineer"]),
    'site:jobs.lever.co ("senior software engineer" OR "ai engineer") ("LATAM" OR "Brazil" OR "South America" OR "remote worldwide") -"authorized to work in the US"',
  );
});

test("titles are also dropped to stay within the word limit", () => {
  const titles = Array.from({ length: 12 }, (_, index) => `a b c ${index}`);
  const query = buildWebSearchQuery("jobs.lever.co", titles);
  assert.ok(query.length <= MAX_QUERY_LENGTH);
  assert.ok(query.split(/\s+/).length <= MAX_QUERY_WORDS);
  assert.match(query, /"a b c 0"/);
});

test("quotes inside a title are dropped so they cannot break the query", () => {
  assert.match(buildWebSearchQuery("jobs.lever.co", ['ai "llm" engineer']), /\("ai llm engineer"\)/);
});

test("titles are dropped from the end when the query would be too long, keeping at least one", () => {
  const titles = Array.from({ length: 30 }, (_, index) => `very long senior title number ${index}`);
  const query = buildWebSearchQuery("jobs.smartrecruiters.com", titles);
  assert.ok(query.length <= MAX_QUERY_LENGTH);
  assert.ok(query.split(/\s+/).length <= MAX_QUERY_WORDS);
  assert.match(query, /"very long senior title number 0"/);
  assert.doesNotMatch(query, /number 29/);
});

test("results are grouped by board, ignoring URLs that are not a known ATS", () => {
  const groups = groupResultsByBoard([
    "https://jobs.ashbyhq.com/nimbus/abc-123",
    "https://jobs.ashbyhq.com/nimbus/def-456",
    "https://jobs.lever.co/acme/0f1e2d3c",
    "https://example.com/careers/1",
    "https://jobs.ashbyhq.com/nimbus/abc-123",
  ]);
  assert.deepEqual(groups, [
    { source: "ashby", token: "nimbus", urls: ["https://jobs.ashbyhq.com/nimbus/abc-123", "https://jobs.ashbyhq.com/nimbus/def-456"] },
    { source: "lever", token: "acme", urls: ["https://jobs.lever.co/acme/0f1e2d3c"] },
  ]);
});

function posting(externalId: string, url: string): NormalizedJobPosting {
  return { externalId, title: "Engineer", url, location: "", description: "", companyNameFromSource: "", updatedAt: new Date(0) };
}

test("only the board postings the search found are kept, matched by id in the URL or by URL", () => {
  const postings = [
    posting("abc-123", "https://jobs.ashbyhq.com/nimbus/abc-123"),
    posting("4012345", "https://job-boards.greenhouse.io/acme/jobs/4012345?gh_src=x"),
    posting("zzz", "https://jobs.ashbyhq.com/nimbus/zzz"),
    posting("1", "https://jobs.smartrecruiters.com/Acme/744000000000001-engineer"),
  ];
  const kept = selectPostingsForResults(postings, [
    "https://jobs.ashbyhq.com/nimbus/ABC-123/application",
    "https://boards.greenhouse.io/acme/jobs/4012345",
    "https://jobs.smartrecruiters.com/Acme/744000000000001-engineer",
  ]);
  assert.deepEqual(
    kept.map((item) => item.externalId),
    ["abc-123", "4012345", "1"],
  );
});

test("a short id only matches a whole path segment, never part of another id", () => {
  const kept = selectPostingsForResults([posting("12", "https://x.test/a")], ["https://jobs.lever.co/acme/123456"]);
  assert.deepEqual(kept, []);
});

test("the company name falls back to the board token, readable", () => {
  assert.equal(companyNameFromToken("acme-labs"), "Acme Labs");
  assert.equal(companyNameFromToken("AcmeInc"), "AcmeInc");
});
