import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { emailAccounts } from "../../db/schema.js";

export type EmailAccountRow = typeof emailAccounts.$inferSelect;

export class EmailAccountRepository {
  constructor(private readonly db: Database) {}

  async get(provider: string): Promise<EmailAccountRow | null> {
    const [row] = await this.db.select().from(emailAccounts).where(eq(emailAccounts.provider, provider)).limit(1);
    return row ?? null;
  }

  // Connecting again replaces the earlier account and token.
  async save(input: Pick<EmailAccountRow, "provider" | "emailAddress" | "sealedRefreshToken" | "scope">): Promise<EmailAccountRow> {
    const [row] = await this.db
      .insert(emailAccounts)
      .values({ id: randomUUID(), ...input, connectedAt: new Date(), lastCheckedAt: null, lastError: "" })
      .onConflictDoUpdate({
        target: emailAccounts.provider,
        set: { ...input, connectedAt: new Date(), lastCheckedAt: null, lastError: "" },
      })
      .returning();
    return row!;
  }

  async recordCheck(provider: string, at: Date, error = ""): Promise<void> {
    await this.db.update(emailAccounts).set({ lastCheckedAt: at, lastError: error }).where(eq(emailAccounts.provider, provider));
  }

  async remove(provider: string): Promise<void> {
    await this.db.delete(emailAccounts).where(eq(emailAccounts.provider, provider));
  }
}
