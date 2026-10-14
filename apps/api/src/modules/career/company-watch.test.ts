import assert from "node:assert/strict";
import test from "node:test";
import { hiringPace, isPollDue, WATCH_MIN_INTERVAL_MS } from "./company-watch.ts";

const NOW = new Date("2026-10-14T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

test("hiringPace counts open postings and the ones posted in the last 30 days", () => {
  const pace = hiringPace([daysAgo(1), daysAgo(10), daysAgo(29), daysAgo(31), daysAgo(200), null], NOW);
  assert.deepEqual(pace, { open: 6, recent: 3, hiringFast: false });
});

test("five or more postings in the last 30 days means the company is hiring fast", () => {
  const pace = hiringPace([daysAgo(1), daysAgo(2), daysAgo(3), daysAgo(4), daysAgo(5)], NOW);
  assert.equal(pace.recent, 5);
  assert.equal(pace.hiringFast, true);
});

test("postings without a date never count as recent", () => {
  assert.deepEqual(hiringPace([null, null, null, null, null, null], NOW), { open: 6, recent: 0, hiringFast: false });
});

test("a posting dated in the future counts as recent", () => {
  assert.equal(hiringPace([new Date(NOW.getTime() + 60_000)], NOW).recent, 1);
});

test("an empty board is not hiring fast", () => {
  assert.deepEqual(hiringPace([], NOW), { open: 0, recent: 0, hiringFast: false });
});

test("a company is polled at most once an hour", () => {
  assert.equal(WATCH_MIN_INTERVAL_MS, 60 * 60 * 1000);
  assert.equal(isPollDue(null, NOW), true);
  assert.equal(isPollDue(new Date(NOW.getTime() - 59 * 60 * 1000), NOW), false);
  assert.equal(isPollDue(new Date(NOW.getTime() - 60 * 60 * 1000), NOW), true);
});
