import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuditEventInput } from "../audit/audit-repository.js";
import { MeteredSearchClient, MeteredTextProvider } from "./metered-providers.js";
import { UsageLedger } from "./usage-ledger.js";
import type { NewAiUsage } from "./usage-repository.js";

const NOW = new Date("2026-10-15T12:00:00Z");

function setup(budgetUsd: number, alreadySpent = 0) {
  const rows: NewAiUsage[] = [];
  const audits: AuditEventInput[] = [];
  const crossings: string[] = [];
  const repo = {
    async insert(row: NewAiUsage) {
      rows.push(row);
    },
    async spentSince(since: Date) {
      assert.equal(since.toISOString(), "2026-10-01T00:00:00.000Z", "the month starts on the 1st, UTC");
      return alreadySpent + rows.reduce((sum, row) => sum + row.estimatedUsd, 0);
    },
  };
  const ledger = new UsageLedger(repo, { record: async (input) => void audits.push(input) }, budgetUsd, async (crossing) => void crossings.push(crossing.state), () => NOW);
  return { ledger, rows, audits, crossings };
}

test("a model call is recorded with its purpose, tokens and estimated cost", async () => {
  const { ledger, rows } = setup(0);
  await ledger.recordText({ provider: "openai", model: "gpt-4.1", promptVersion: "job-explanation.v1", inputTokens: 10_000, outputTokens: 1_000 });
  assert.deepEqual(
    [rows[0]?.kind, rows[0]?.purpose, rows[0]?.promptVersion, rows[0]?.inputTokens, rows[0]?.estimatedUsd, rows[0]?.priceKnown],
    ["TEXT", "job-explanation", "job-explanation.v1", 10_000, 0.028, true],
  );
});

test("search queries are recorded at the per-query price", async () => {
  const { ledger, rows } = setup(0);
  await ledger.recordSearch({ provider: "brave", purpose: "web-discovery", queries: 2 });
  assert.equal(rows[0]?.estimatedUsd, 0.01);
});

test("once the budget is spent, optional calls are refused and required ones go ahead", async () => {
  const { ledger } = setup(10, 10);
  await assert.rejects(ledger.guard("recruiter-message.v1"), (error: Error & { code?: string }) => error.code === "AI_BUDGET_REACHED");
  await ledger.guard("tailored-cv.v1");
  assert.equal((await ledger.summary()).state, "REACHED");
});

test("with no budget nothing is refused", async () => {
  const { ledger } = setup(0, 1_000);
  await ledger.guard("job-explanation.v1");
  assert.equal((await ledger.summary()).state, "OFF");
});

test("crossing 80% and then 100% is audited and announced once each", async () => {
  const { ledger, audits, crossings } = setup(1, 0.79);
  await ledger.recordSearch({ provider: "brave", purpose: "web-discovery", queries: 2 });
  await ledger.recordSearch({ provider: "brave", purpose: "web-discovery", queries: 2 });
  await ledger.recordSearch({ provider: "brave", purpose: "web-discovery", queries: 40 });
  await ledger.recordSearch({ provider: "brave", purpose: "web-discovery", queries: 2 });
  assert.deepEqual(crossings, ["WARNING", "REACHED"]);
  assert.deepEqual(audits.map((audit) => [audit.eventType, audit.actor, audit.entityId]), [
    ["AI_BUDGET_WARNING", "SYSTEM", "2026-10"],
    ["AI_BUDGET_REACHED", "SYSTEM", "2026-10"],
  ]);
});

test("the metered provider records each call, and a failed ledger write does not fail the call", async () => {
  const recorded: string[] = [];
  const inner = { generateText: async () => ({ text: "{}", model: "gpt-4.1", usage: { inputTokens: 5, outputTokens: 1 } }) };
  const ledger = { guard: async () => undefined, recordText: async (input: { promptVersion: string }) => void recorded.push(input.promptVersion), recordSearch: async () => undefined };
  const result = await new MeteredTextProvider(inner, "openai", ledger).generateText({ purpose: "persona.v1", system: "", user: "" });
  assert.equal(result.text, "{}");
  assert.deepEqual(recorded, ["persona.v1"]);

  const broken = { ...ledger, recordText: async () => Promise.reject(new Error("db down")), recordSearch: async () => Promise.reject(new Error("db down")) };
  assert.equal((await new MeteredTextProvider(inner, "openai", broken).generateText({ purpose: "persona.v1", system: "", user: "" })).text, "{}");
  const search = new MeteredSearchClient({ search: async () => [{ url: "https://x.example", title: "x" }] }, "brave", broken);
  assert.equal((await search.search("q")).length, 1);
});

test("a refused call never reaches the provider", async () => {
  let called = false;
  const inner = { generateText: async () => ((called = true), { text: "", model: "m" }) };
  const ledger = { guard: async () => Promise.reject(new Error("budget")), recordText: async () => undefined, recordSearch: async () => undefined };
  await assert.rejects(new MeteredTextProvider(inner, "openai", ledger).generateText({ purpose: "cover-letter.v1", system: "", user: "" }));
  assert.equal(called, false);
});
