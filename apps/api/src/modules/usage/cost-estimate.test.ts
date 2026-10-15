import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetCrossing, budgetState, estimateTextCostUsd, isOptionalPurpose, purposeOf, SEARCH_QUERY_USD } from "./cost-estimate.js";

// --- Estimated cost of a model call, from the price table.

test("a known model is priced per million input and output tokens", () => {
  const cost = estimateTextCostUsd({ provider: "openai", model: "gpt-4.1", inputTokens: 1_000_000, outputTokens: 500_000 });
  assert.deepEqual(cost, { usd: 2 + 4, priceKnown: true });
});

test("dated model ids use their family's price, the longest name winning", () => {
  assert.equal(estimateTextCostUsd({ provider: "openai", model: "gpt-4.1-mini-2025-04-14", inputTokens: 1_000_000, outputTokens: 0 }).usd, 0.4);
  assert.equal(estimateTextCostUsd({ provider: "openai", model: "gpt-4.1-2025-04-14", inputTokens: 1_000_000, outputTokens: 0 }).usd, 2);
  assert.equal(estimateTextCostUsd({ provider: "anthropic", model: "claude-haiku-4-5-20251001", inputTokens: 0, outputTokens: 1_000_000 }).usd, 5);
});

test("an unknown model is priced at its provider's fallback and marked as such", () => {
  const cost = estimateTextCostUsd({ provider: "anthropic", model: "claude-future-9", inputTokens: 1_000_000, outputTokens: 1_000_000 });
  assert.equal(cost.priceKnown, false);
  assert.ok(cost.usd > 0);
});

test("a call that reported no tokens costs nothing", () => {
  assert.equal(estimateTextCostUsd({ provider: "openai", model: "gpt-4.1", inputTokens: 0, outputTokens: 0 }).usd, 0);
});

test("a search query has a fixed price", () => {
  assert.ok(SEARCH_QUERY_USD > 0 && SEARCH_QUERY_USD < 0.05);
});

// --- Purposes.

test("the purpose is the prompt version without its version", () => {
  assert.equal(purposeOf("job-explanation.v1"), "job-explanation");
  assert.equal(purposeOf("recruiter-message.v12"), "recruiter-message");
  assert.equal(purposeOf("persona"), "persona");
});

test("explanations, cover letters and message classification are optional calls", () => {
  for (const purpose of ["job-explanation.v1", "cover-letter.v1", "recruiter-message.v1"]) assert.equal(isOptionalPurpose(purpose), true, purpose);
  for (const purpose of ["tailored-cv.v1", "persona.v1", "application-answers.v1"]) assert.equal(isOptionalPurpose(purpose), false, purpose);
});

// --- The monthly budget.

test("the budget is off at zero, warns at 80% and is reached at 100%", () => {
  assert.equal(budgetState({ spentUsd: 999, budgetUsd: 0 }), "OFF");
  assert.equal(budgetState({ spentUsd: 7.99, budgetUsd: 10 }), "OK");
  assert.equal(budgetState({ spentUsd: 8, budgetUsd: 10 }), "WARNING");
  assert.equal(budgetState({ spentUsd: 10, budgetUsd: 10 }), "REACHED");
});

test("a crossing is reported once, by the call that crosses it", () => {
  assert.equal(budgetCrossing({ beforeUsd: 7.5, afterUsd: 8.2, budgetUsd: 10 }), "WARNING");
  assert.equal(budgetCrossing({ beforeUsd: 8.2, afterUsd: 9, budgetUsd: 10 }), null);
  assert.equal(budgetCrossing({ beforeUsd: 9, afterUsd: 10.5, budgetUsd: 10 }), "REACHED");
  assert.equal(budgetCrossing({ beforeUsd: 7, afterUsd: 11, budgetUsd: 10 }), "REACHED", "a jump past both reports the higher");
  assert.equal(budgetCrossing({ beforeUsd: 7, afterUsd: 11, budgetUsd: 0 }), null);
});
