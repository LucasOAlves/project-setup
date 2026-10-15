import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";
import { MIGRATIONS, migrate } from "../../db/migrate.js";
import { checkRestorable, foreignKeyOrder, type BackupPayload } from "./backup-archive.js";

// Makes and restores backups (Milestone 6, JOB-031): every table's rows as JSON, plus the
// stored files. Application-level rather than pg_dump, so one archive holds both and no
// Postgres client is needed (ADR-024).

const SKIPPED_TABLES = new Set(["schema_migrations"]);
const INSERT_CHUNK = 500;
// Tables the migrations fill with defaults (the job sources). A new database has them, so they
// do not make it "not empty", and the backup's rows replace them.
const SEEDED_TABLES = new Set(["sources"]);

// Storage keys are flat file names (uploads/local-storage.ts); anything else is refused.
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

async function tables(sql: postgres.Sql | postgres.TransactionSql): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  return rows.map((row) => row.name).filter((name) => !SKIPPED_TABLES.has(name));
}

async function foreignKeys(sql: postgres.Sql): Promise<Array<{ table: string; references: string }>> {
  return sql<{ table: string; references: string }[]>`
    SELECT conrelid::regclass::text AS table, confrelid::regclass::text AS references
    FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace
  `;
}

async function columns(sql: postgres.Sql | postgres.TransactionSql, table: string): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    SELECT column_name AS name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  return rows.map((row) => row.name);
}

export async function createBackup(sql: postgres.Sql, storageDir: string, now = new Date()): Promise<BackupPayload> {
  const migrations = (await sql<{ id: string }[]>`SELECT id FROM schema_migrations ORDER BY id`).map((row) => row.id);
  const data: BackupPayload["tables"] = {};
  // One snapshot of every table.
  await sql.begin("isolation level repeatable read read only", async (tx) => {
    for (const table of (await tables(tx)).sort()) {
      const [row] = await tx.unsafe<{ rows: Array<Record<string, unknown>> }[]>(`SELECT COALESCE(json_agg(t), '[]'::json) AS rows FROM "${table}" t`);
      data[table] = row?.rows ?? [];
    }
  });
  const files: BackupPayload["files"] = {};
  const entries = await readdir(storageDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isFile() && SAFE_KEY.test(entry.name)) files[entry.name] = (await readFile(path.join(storageDir, entry.name))).toString("base64");
  }
  return { format: 1, createdAt: now.toISOString(), migrations, tables: data, files };
}

export type RestoreResult = { tables: number; rows: number; files: number; skippedTables: string[] };

// Restores into an empty database: brings it to the backup's schema, inserts the rows in
// foreign-key order in one transaction, migrates the rest of the way, and writes the files.
export async function restoreBackup(sql: postgres.Sql, storageDir: string, payload: BackupPayload): Promise<RestoreResult> {
  const restorable = checkRestorable({ archiveMigrations: payload.migrations, knownMigrations: MIGRATIONS });
  if (!restorable.ok) throw new Error(restorable.reason);

  await migrate(sql, { only: new Set(payload.migrations) });
  const present = await tables(sql);
  for (const table of present.filter((name) => !SEEDED_TABLES.has(name))) {
    const [row] = await sql.unsafe<{ found: boolean }[]>(`SELECT EXISTS (SELECT 1 FROM "${table}") AS found`);
    if (row?.found) throw new Error(`The database is not empty (table ${table} has rows). Restore into a new, empty database.`);
  }

  const order = foreignKeyOrder(present, await foreignKeys(sql));
  const skippedTables = Object.keys(payload.tables).filter((table) => !present.includes(table));
  let rows = 0;
  await sql.begin(async (tx) => {
    for (const table of present.filter((name) => SEEDED_TABLES.has(name) && (payload.tables[name] ?? []).length > 0)) {
      await tx.unsafe(`DELETE FROM "${table}"`);
    }
    for (const table of order) {
      const records = payload.tables[table] ?? [];
      if (records.length === 0) continue;
      // Only columns both the backup and this schema have; the rest take their defaults.
      const current = new Set(await columns(tx, table));
      const shared = Object.keys(records[0]!).filter((column) => current.has(column));
      const list = shared.map((column) => `"${column}"`).join(", ");
      for (let start = 0; start < records.length; start += INSERT_CHUNK) {
        const chunk = records.slice(start, start + INSERT_CHUNK);
        await tx.unsafe(`INSERT INTO "${table}" (${list}) SELECT ${list} FROM json_populate_recordset(NULL::"${table}", $1::json)`, [chunk as unknown as postgres.SerializableParameter]);
      }
      rows += records.length;
    }
  });
  await migrate(sql);

  await mkdir(storageDir, { recursive: true });
  let files = 0;
  for (const [key, base64] of Object.entries(payload.files)) {
    if (!SAFE_KEY.test(key)) continue;
    await writeFile(path.join(storageDir, key), Buffer.from(base64, "base64"));
    files += 1;
  }
  return { tables: order.filter((table) => (payload.tables[table] ?? []).length > 0).length, rows, files, skippedTables };
}
