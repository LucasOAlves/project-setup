import assert from "node:assert/strict";
import { test } from "node:test";
import { funnel, funnelBy, medianDaysToFirstReply, scoreBand, stageReached, weightSuggestions, type FunnelJob } from "./operations-metrics.js";

const DAY = 24 * 60 * 60 * 1000;
const sent = new Date("2026-10-01T00:00:00Z");

function jobRow(overrides: Partial<FunnelJob>): FunnelJob {
  return { source: "remotive", portal: "greenhouse", score: 75, statuses: ["SAVED"], submittedAt: null, firstReplyAt: null, ...overrides };
}

// --- How far a job got.

test("the furthest stage counts, even when the job later closed", () => {
  assert.equal(stageReached(jobRow({ statuses: ["SAVED"] })), "DISCOVERED");
  assert.equal(stageReached(jobRow({ statuses: ["SAVED", "SHORTLISTED"] })), "SHORTLISTED");
  assert.equal(stageReached(jobRow({ statuses: ["SAVED", "PREPARING", "APPLIED"] })), "APPLIED");
  assert.equal(stageReached(jobRow({ statuses: ["APPLIED", "SCREENING", "REJECTED"] })), "RESPONDED");
  assert.equal(stageReached(jobRow({ statuses: ["APPLIED", "TECHNICAL_INTERVIEW", "REJECTED"] })), "INTERVIEW");
  assert.equal(stageReached(jobRow({ statuses: ["APPLIED", "FINAL_INTERVIEW", "OFFER"] })), "OFFER");
});

test("a reply or a rejection after applying is a response, a rejection before applying is not", () => {
  assert.equal(stageReached(jobRow({ statuses: ["APPLIED"], firstReplyAt: sent })), "RESPONDED");
  assert.equal(stageReached(jobRow({ statuses: ["APPLIED", "REJECTED"] })), "RESPONDED");
  assert.equal(stageReached(jobRow({ statuses: ["SAVED", "REJECTED"] })), "DISCOVERED");
  assert.equal(stageReached(jobRow({ statuses: ["SAVED", "WITHDRAWN"] })), "DISCOVERED");
});

// --- The funnel.

const rows: FunnelJob[] = [
  jobRow({ statuses: ["SAVED"] }),
  jobRow({ statuses: ["SHORTLISTED"], score: 85 }),
  jobRow({ statuses: ["APPLIED"], score: 85, submittedAt: sent }),
  jobRow({ statuses: ["APPLIED", "INTERVIEW"], score: 92, submittedAt: sent, firstReplyAt: new Date(sent.getTime() + 3 * DAY), source: "brave", portal: "lever" }),
  jobRow({ statuses: ["APPLIED", "REJECTED"], score: 62, submittedAt: sent, firstReplyAt: new Date(sent.getTime() + 7 * DAY), source: "brave", portal: "manual" }),
];

test("each stage counts every job that reached it or further", () => {
  assert.deepEqual(funnel(rows), [
    { stage: "DISCOVERED", count: 5 },
    { stage: "SHORTLISTED", count: 4 },
    { stage: "APPLIED", count: 3 },
    { stage: "RESPONDED", count: 2 },
    { stage: "INTERVIEW", count: 1 },
    { stage: "OFFER", count: 0 },
  ]);
});

test("conversion by group gives counts and the reply rate of applications", () => {
  const bySource = funnelBy(rows, (row) => row.source);
  assert.deepEqual(bySource.find((group) => group.key === "brave"), { key: "brave", discovered: 2, applied: 2, responded: 2, interview: 1, offer: 0, responseRate: 1 });
  assert.deepEqual(bySource.find((group) => group.key === "remotive"), { key: "remotive", discovered: 3, applied: 1, responded: 0, interview: 0, offer: 0, responseRate: 0 });
  const unapplied = funnelBy([jobRow({})], (row) => row.source)[0];
  assert.equal(unapplied?.responseRate, null, "no rate without applications");
});

test("score bands", () => {
  assert.equal(scoreBand(null), "unscored");
  assert.equal(scoreBand(59), "below 60");
  assert.equal(scoreBand(60), "60-69");
  assert.equal(scoreBand(79), "70-79");
  assert.equal(scoreBand(80), "80-89");
  assert.equal(scoreBand(100), "90+");
});

test("the median time to first reply is in days, over replied applications only", () => {
  assert.equal(medianDaysToFirstReply(rows), 5);
  assert.equal(medianDaysToFirstReply([jobRow({ submittedAt: sent })]), null);
});

// --- Weight suggestions: never applied, only shown.

const band = (key: string, applied: number, responded: number) => ({ key, discovered: applied, applied, responded, interview: 0, offer: 0, responseRate: applied ? responded / applied : null });

test("a higher score band with a lower reply rate, on enough applications, is pointed out", () => {
  const suggestions = weightSuggestions([band("70-79", 6, 3), band("90+", 6, 1)], null);
  assert.equal(suggestions.length, 1);
  assert.match(suggestions[0]!, /90\+ .*17%.*70-79.*50%/);
});

test("small samples suggest nothing", () => {
  assert.deepEqual(weightSuggestions([band("70-79", 2, 2), band("90+", 3, 0)], null), []);
});

test("feedback that disagrees with the score, or a dimension that cannot tell relevant from not, is pointed out", () => {
  const summary = {
    threshold: 60,
    rated: 12,
    relevant: 6,
    notRelevant: 6,
    agreementRate: 0.5,
    dimensions: {
      skills: { relevantAverage: 80, notRelevantAverage: 40 },
      seniority: { relevantAverage: 60, notRelevantAverage: 70 },
    },
    reasons: [],
  };
  const suggestions = weightSuggestions([], summary);
  assert.ok(suggestions.some((text) => /agrees with 50%/.test(text)));
  assert.ok(suggestions.some((text) => /seniority/.test(text)));
  assert.ok(!suggestions.some((text) => /skills/.test(text)));
  assert.deepEqual(weightSuggestions([], { ...summary, rated: 4 }), [], "too few ratings");
});
