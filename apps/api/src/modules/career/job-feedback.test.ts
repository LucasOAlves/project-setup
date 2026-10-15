import assert from "node:assert/strict";
import test from "node:test";
import { summarizeFeedback, type RatedEvaluation } from "./job-feedback.ts";

function dims(scores: Partial<Record<string, number | null>>) {
  const keys = ["technical", "seniority", "experience", "geography", "compensation", "preferences"];
  return Object.fromEntries(
    keys.map((key) => {
      const score = scores[key];
      return [key, { score: score ?? 50, known: score !== null && score !== undefined }];
    }),
  ) as RatedEvaluation["dimensions"];
}

function rated(verdict: "RELEVANT" | "NOT_RELEVANT", score: number | null, extra: Partial<RatedEvaluation> = {}): RatedEvaluation {
  return { verdict, reasons: [], score, dimensions: score === null ? null : dims({}), ...extra };
}

test("an empty history gives counts of zero and no agreement rate", () => {
  const summary = summarizeFeedback([], 60);
  assert.equal(summary.rated, 0);
  assert.equal(summary.agreementRate, null);
  assert.deepEqual(summary.reasons, []);
  assert.deepEqual(summary.dimensions.technical, { relevantAverage: null, notRelevantAverage: null });
});

test("verdicts agree with the score when relevant sits at or above the threshold and not relevant below it", () => {
  const summary = summarizeFeedback(
    [
      rated("RELEVANT", 80),
      rated("RELEVANT", 60),
      rated("RELEVANT", 40),
      rated("NOT_RELEVANT", 30),
      rated("NOT_RELEVANT", 90),
    ],
    60,
  );
  assert.equal(summary.rated, 5);
  assert.equal(summary.relevant, 3);
  assert.equal(summary.notRelevant, 2);
  assert.equal(summary.agreementRate, 0.6);
});

test("verdicts on jobs without a score count as rated but not toward agreement", () => {
  const summary = summarizeFeedback([rated("RELEVANT", null), rated("NOT_RELEVANT", 20)], 60);
  assert.equal(summary.rated, 2);
  assert.equal(summary.agreementRate, 1);
});

test("dimension averages split by verdict and ignore dimensions the posting left unknown", () => {
  const summary = summarizeFeedback(
    [
      rated("RELEVANT", 80, { dimensions: dims({ technical: 100, compensation: 100 }) }),
      rated("RELEVANT", 70, { dimensions: dims({ technical: 80, compensation: null }) }),
      rated("NOT_RELEVANT", 65, { dimensions: dims({ technical: 90, compensation: 40 }) }),
    ],
    60,
  );
  assert.deepEqual(summary.dimensions.technical, { relevantAverage: 90, notRelevantAverage: 90 });
  assert.deepEqual(summary.dimensions.compensation, { relevantAverage: 100, notRelevantAverage: 40 });
});

test("reasons are counted and listed most frequent first", () => {
  const summary = summarizeFeedback(
    [
      rated("NOT_RELEVANT", 70, { reasons: ["PAY_TOO_LOW", "LOCATION"] }),
      rated("NOT_RELEVANT", 65, { reasons: ["PAY_TOO_LOW"] }),
      rated("RELEVANT", 90, { reasons: ["GREAT_MATCH"] }),
    ],
    60,
  );
  assert.deepEqual(summary.reasons, [
    { reason: "PAY_TOO_LOW", count: 2 },
    { reason: "LOCATION", count: 1 },
    { reason: "GREAT_MATCH", count: 1 },
  ]);
});
