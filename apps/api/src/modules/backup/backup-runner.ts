import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";
import type { Env } from "../../env.js";
import { parseEncryptionKey } from "../email/secret-box.js";
import { sealArchive, writePlainArchive } from "./backup-archive.js";
import { backupFileName, backupsToPrune } from "./backup-files.js";
import { createBackup } from "./backup-service.js";

// Writes a backup file and prunes old ones; shared by `npm run backup` and the worker's daily job.

export function backupKey(env: Pick<Env, "BACKUP_ENCRYPTION_KEY">): Buffer | null {
  return env.BACKUP_ENCRYPTION_KEY ? parseEncryptionKey(env.BACKUP_ENCRYPTION_KEY) : null;
}

export type WrittenBackup = { file: string; bytes: number; rows: number; files: number };

export async function writeBackup(
  sql: postgres.Sql,
  env: Pick<Env, "BACKUP_ENCRYPTION_KEY" | "STORAGE_DIR">,
  options: { dir: string; plain?: boolean; now?: Date },
): Promise<WrittenBackup> {
  const key = backupKey(env);
  if (!options.plain && !key) throw new Error("Set BACKUP_ENCRYPTION_KEY (openssl rand -base64 32) to make an encrypted backup, or pass --plain for an unencrypted export.");
  const now = options.now ?? new Date();
  const payload = await createBackup(sql, env.STORAGE_DIR, now);
  const body = options.plain ? writePlainArchive(payload) : sealArchive(key!, payload);
  await mkdir(options.dir, { recursive: true });
  const file = path.join(options.dir, backupFileName(now, Boolean(options.plain)));
  // Owner-only: the archive holds the CV, profile and messages.
  await writeFile(file, body, { mode: 0o600 });
  const rows = Object.values(payload.tables).reduce((sum, records) => sum + records.length, 0);
  return { file, bytes: body.length, rows, files: Object.keys(payload.files).length };
}

export async function pruneBackups(dir: string, keep: number): Promise<string[]> {
  const names = await readdir(dir).catch(() => []);
  const pruned = backupsToPrune(names, keep);
  for (const name of pruned) await rm(path.join(dir, name), { force: true });
  return pruned;
}
