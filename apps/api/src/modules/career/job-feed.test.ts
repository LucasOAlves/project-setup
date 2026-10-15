import assert from "node:assert/strict";
import test from "node:test";
import { jobFeedQuerySchema, type JobFeedItem } from "@studio/shared";
import { buildJobFeed } from "./job-feed.ts";

const NOW = new Date("2026-10-14T12:00:00Z");

function item(
  id: string,
  evaluation: { eligibility: "ELIGIBLE" | "UNKNOWN" | "EXCLUDED"; score: number | null; confidence?: number | null } | null,
  extra: { title?: string; company?: string; source?: string; postedAt?: string } = {},
): JobFeedItem {
  return {
    job: { id, title: extra.title ?? `Role ${id}`, source: extra.source ?? "remotive" } as JobFeedItem["job"],
    companyName: extra.company ?? "Nimbus",
    postedAt: extra.postedAt ?? "2026-10-10T00:00:00Z",
    evaluation: evaluation
      ? ({ ...evaluation, confidence: evaluation.confidence ?? 100 } as JobFeedItem["evaluation"])
      : null,
    explanation: null,
    explainedAt: null,
  };
}

const query = (raw: Record<string, string> = {}) => jobFeedQuerySchema.parse(raw);
const ids = (items: JobFeedItem[]) => items.map((entry) => entry.job.id);

test("by default the feed hides excluded jobs and keeps eligible, unknown and unevaluated ones", () => {
  const feed = buildJobFeed(
    [
      item("a", { eligibility: "ELIGIBLE", score: 80 }),
      item("b", { eligibility: "EXCLUDED", score: null }),
      item("c", { eligibility: "UNKNOWN", score: 70 }),
      item("d", null),
    ],
    query(),
    NOW,
  );
  assert.deepEqual(ids(feed), ["a", "c", "d"]);
});

test("jobs rank by score, then confidence, then newest posting, unscored last", () => {
  const feed = buildJobFeed(
    [
      item("unscored", { eligibility: "ELIGIBLE", score: null }),
      item("low", { eligibility: "ELIGIBLE", score: 50 }),
      item("sure", { eligibility: "ELIGIBLE", score: 80, confidence: 100 }),
      item("unsure", { eligibility: "UNKNOWN", score: 80, confidence: 75 }),
      item("older", { eligibility: "ELIGIBLE", score: 50 }, { postedAt: "2026-09-01T00:00:00Z" }),
    ],
    query(),
    NOW,
  );
  assert.deepEqual(ids(feed), ["sure", "unsure", "low", "older", "unscored"]);
});

test("a minimum score leaves out jobs without a score", () => {
  const feed = buildJobFeed(
    [item("a", { eligibility: "ELIGIBLE", score: 75 }), item("b", { eligibility: "ELIGIBLE", score: 59 }), item("c", null)],
    query({ minScore: "60" }),
    NOW,
  );
  assert.deepEqual(ids(feed), ["a"]);
});

test("the feed filters by eligibility, source, text and posting age", () => {
  const items = [
    item("a", { eligibility: "ELIGIBLE", score: 80 }, { title: "Senior Node Engineer", source: "himalayas" }),
    item("b", { eligibility: "EXCLUDED", score: null }, { company: "Acme" }),
    item("c", { eligibility: "ELIGIBLE", score: 70 }, { postedAt: "2026-08-01T00:00:00Z" }),
  ];
  assert.deepEqual(ids(buildJobFeed(items, query({ eligibility: "EXCLUDED" }), NOW)), ["b"]);
  assert.deepEqual(ids(buildJobFeed(items, query({ source: "himalayas" }), NOW)), ["a"]);
  assert.deepEqual(ids(buildJobFeed(items, query({ q: "node", eligibility: "ELIGIBLE,EXCLUDED" }), NOW)), ["a"]);
  assert.deepEqual(ids(buildJobFeed(items, query({ q: "acme", eligibility: "EXCLUDED" }), NOW)), ["b"]);
  assert.deepEqual(ids(buildJobFeed(items, query({ postedWithinDays: "30" }), NOW)), ["a"]);
});

test("the query rejects an unknown eligibility filter", () => {
  assert.equal(jobFeedQuerySchema.safeParse({ eligibility: "MAYBE" }).success, false);
});
