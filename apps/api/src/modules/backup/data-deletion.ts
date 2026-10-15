import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";
import type { AuditEventInput } from "../audit/audit-repository.js";

// Deletes the user's data (Milestone 6, JOB-031; spec section 6 "provide local export/deletion").
// Command line only (`npm run delete-my-data -- --yes-delete-everything`), never an API route.
//
// Kept: the audit log of what was done, the cost ledger (model calls with no personal content,
// which the monthly budget counts), the job source settings and the migration history.
const KEPT_TABLES = new Set(["schema_migrations", "audit_events", "ai_usage", "sources"]);
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type DeletionResult = { tables: number; rows: number; files: number; mailboxRevoked: boolean | null };

export async function deleteMyData(
  sql: postgres.Sql,
  storageDir: string,
  deps: { disconnectMailbox: () => Promise<boolean | null>; audit: { record(input: AuditEventInput): Promise<void> } },
): Promise<DeletionResult> {
  // The mailbox first, so Google forgets the grant before the sealed token is gone.
  const mailboxRevoked = await deps.disconnectMailbox();

  const names = (
    await sql<{ name: string }[]>`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `
  )
    .map((row) => row.name)
    .filter((name) => !KEPT_TABLES.has(name))
    .sort();
  let rows = 0;
  for (const name of names) {
    const [row] = await sql.unsafe<{ count: string }[]>(`SELECT count(*)::text AS count FROM "${name}"`);
    rows += Number(row?.count ?? 0);
  }
  if (names.length > 0) await sql.unsafe(`TRUNCATE ${names.map((name) => `"${name}"`).join(", ")}`);

  let files = 0;
  for (const entry of await readdir(storageDir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile() || !SAFE_KEY.test(entry.name)) continue;
    await rm(path.join(storageDir, entry.name), { force: true });
    files += 1;
  }

  await deps.audit.record({
    eventType: "USER_DATA_DELETED",
    actor: "USER",
    entityType: "workspace",
    entityId: "local",
    payload: { tables: names.length, rows, files, mailboxRevoked },
  });
  return { tables: names.length, rows, files, mailboxRevoked };
}
