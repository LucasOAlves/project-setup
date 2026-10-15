import type { FastifyInstance } from "fastify";
import type { UsageLedger } from "./usage-ledger.js";

// This month's estimated model and search spend against AI_MONTHLY_BUDGET_USD.
export async function registerUsageRoutes(app: FastifyInstance, usage: Pick<UsageLedger, "summary">): Promise<void> {
  app.get("/api/usage/summary", async () => usage.summary());
}
