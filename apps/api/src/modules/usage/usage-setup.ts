import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { AuditRepository } from "../audit/audit-repository.js";
import { UsageLedger, type OnBudgetCrossed } from "./usage-ledger.js";
import { UsageRepository } from "./usage-repository.js";

export function usageLedgerFromEnv(env: Env, db: Database, onCrossed?: OnBudgetCrossed): UsageLedger {
  return new UsageLedger(new UsageRepository(db), new AuditRepository(db), env.AI_MONTHLY_BUDGET_USD, onCrossed);
}
