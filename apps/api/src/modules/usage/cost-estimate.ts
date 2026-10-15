// Model and search cost estimates (Milestone 5, ticket 7; spec JOB-028, criterion 12). Pure:
// a price table in code, which purposes are optional, and where spend stands against the
// monthly budget. Prices are list prices in USD per million tokens, an estimate to steer by:
// the provider's invoice is the real figure.

type Price = { input: number; output: number };

// Matched by the longest name the model id starts with, so dated ids use their family's price.
const MODEL_PRICES: Record<string, Price> = {
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "claude-opus-4": { input: 15, output: 75 },
  "claude-opus-4-5": { input: 5, output: 25 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-3-5-haiku": { input: 0.8, output: 4 },
};

// An unknown model is counted at a high-end price for its provider, so the budget errs early.
const FALLBACK_PRICES: Record<string, Price> = {
  openai: { input: 2.5, output: 10 },
  anthropic: { input: 5, output: 25 },
};
const DEFAULT_FALLBACK: Price = { input: 5, output: 25 };

// Brave Search API, per request.
export const SEARCH_QUERY_USD = 0.005;

function priceFor(model: string): Price | null {
  const id = model.toLowerCase();
  const name = Object.keys(MODEL_PRICES)
    .filter((candidate) => id === candidate || id.startsWith(`${candidate}-`))
    .sort((a, b) => b.length - a.length)[0];
  return name ? MODEL_PRICES[name]! : null;
}

export function estimateTextCostUsd(input: { provider: string; model: string; inputTokens: number; outputTokens: number }): { usd: number; priceKnown: boolean } {
  const known = priceFor(input.model);
  const price = known ?? FALLBACK_PRICES[input.provider] ?? DEFAULT_FALLBACK;
  return { usd: (input.inputTokens * price.input + input.outputTokens * price.output) / 1_000_000, priceKnown: Boolean(known) };
}

// "job-explanation.v1" → "job-explanation"
export function purposeOf(promptVersion: string): string {
  return promptVersion.replace(/\.v\d+$/, "");
}

// Calls the app works without: they stop once the monthly budget is reached. Classification
// then falls back to rules and UNCLEAR, and jobs keep their score without an explanation.
const OPTIONAL = new Set(["job-explanation", "cover-letter", "recruiter-message"]);

export function isOptionalPurpose(promptVersion: string): boolean {
  return OPTIONAL.has(purposeOf(promptVersion));
}

export const BUDGET_WARNING_SHARE = 0.8;

export type BudgetState = "OFF" | "OK" | "WARNING" | "REACHED";

export function budgetState(input: { spentUsd: number; budgetUsd: number }): BudgetState {
  if (input.budgetUsd <= 0) return "OFF";
  if (input.spentUsd >= input.budgetUsd) return "REACHED";
  if (input.spentUsd >= input.budgetUsd * BUDGET_WARNING_SHARE) return "WARNING";
  return "OK";
}

// The threshold one call's spend crossed, if any, so each is reported once a month.
export function budgetCrossing(input: { beforeUsd: number; afterUsd: number; budgetUsd: number }): "WARNING" | "REACHED" | null {
  const before = budgetState({ spentUsd: input.beforeUsd, budgetUsd: input.budgetUsd });
  const after = budgetState({ spentUsd: input.afterUsd, budgetUsd: input.budgetUsd });
  if (after === before || after === "OFF" || after === "OK") return null;
  return after;
}
