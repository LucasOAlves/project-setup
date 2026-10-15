import { budgetReached } from "../../app-error.js";
import type { AuditEventInput } from "../audit/audit-repository.js";
import { budgetCrossing, budgetState, estimateTextCostUsd, isOptionalPurpose, purposeOf, SEARCH_QUERY_USD, type BudgetState } from "./cost-estimate.js";
import type { NewAiUsage, UsageRepository } from "./usage-repository.js";

type Repo = Pick<UsageRepository, "insert" | "spentSince">;
type Audit = { record(input: AuditEventInput): Promise<void> };
// Called once when a month's spend crosses 80% or 100% of the budget (notifications hook here).
export type OnBudgetCrossed = (crossing: { state: "WARNING" | "REACHED"; spentUsd: number; budgetUsd: number }) => Promise<void>;

export type BudgetSummary = { month: string; spentUsd: number; budgetUsd: number; state: BudgetState };

function startOfUtcMonth(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

// The model and search cost ledger (Milestone 5, ticket 7). Every call is recorded with its
// estimated cost; optional calls are refused once the month's budget is spent.
export class UsageLedger {
  constructor(
    private readonly repo: Repo,
    private readonly audit: Audit,
    private readonly budgetUsd: number,
    private readonly onCrossed: OnBudgetCrossed = async () => undefined,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async summary(): Promise<BudgetSummary> {
    const start = startOfUtcMonth(this.now());
    const spentUsd = await this.repo.spentSince(start);
    return { month: start.toISOString().slice(0, 7), spentUsd, budgetUsd: this.budgetUsd, state: budgetState({ spentUsd, budgetUsd: this.budgetUsd }) };
  }

  // Throws before an optional call once the budget is spent. Required calls always go ahead.
  async guard(promptVersion: string): Promise<void> {
    if (this.budgetUsd <= 0 || !isOptionalPurpose(promptVersion)) return;
    if ((await this.summary()).state === "REACHED") throw budgetReached();
  }

  async recordText(input: { provider: string; model: string; promptVersion: string; inputTokens: number; outputTokens: number }): Promise<void> {
    const cost = estimateTextCostUsd(input);
    await this.record({
      kind: "TEXT",
      purpose: purposeOf(input.promptVersion),
      provider: input.provider,
      model: input.model,
      promptVersion: input.promptVersion,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      queries: 0,
      estimatedUsd: cost.usd,
      priceKnown: cost.priceKnown,
    });
  }

  async recordSearch(input: { provider: string; purpose: string; queries: number }): Promise<void> {
    await this.record({
      kind: "SEARCH",
      purpose: input.purpose,
      provider: input.provider,
      model: "",
      promptVersion: "",
      inputTokens: 0,
      outputTokens: 0,
      queries: input.queries,
      estimatedUsd: input.queries * SEARCH_QUERY_USD,
      priceKnown: true,
    });
  }

  private async record(row: NewAiUsage): Promise<void> {
    const before = this.budgetUsd > 0 ? (await this.summary()).spentUsd : 0;
    await this.repo.insert(row);
    if (this.budgetUsd <= 0) return;
    const after = before + row.estimatedUsd;
    const crossed = budgetCrossing({ beforeUsd: before, afterUsd: after, budgetUsd: this.budgetUsd });
    if (!crossed) return;
    await this.audit.record({
      eventType: crossed === "REACHED" ? "AI_BUDGET_REACHED" : "AI_BUDGET_WARNING",
      actor: "SYSTEM",
      entityType: "ai_budget",
      entityId: startOfUtcMonth(this.now()).toISOString().slice(0, 7),
      payload: { spentUsd: Number(after.toFixed(4)), budgetUsd: this.budgetUsd },
    });
    await this.onCrossed({ state: crossed, spentUsd: after, budgetUsd: this.budgetUsd });
  }
}
