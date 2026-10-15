import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import postgres from "postgres";
import { loadEnv } from "./env.js";
import { readArchive } from "./modules/backup/backup-archive.js";
import { backupKey, writeBackup } from "./modules/backup/backup-runner.js";
import { restoreBackup } from "./modules/backup/backup-service.js";
import { deleteMyData } from "./modules/backup/data-deletion.js";
import { createDb } from "./db/client.js";
import { AuditRepository } from "./modules/audit/audit-repository.js";
import { emailAccountServiceFromEnv } from "./modules/email/email-setup.js";

// npm run backup [-- --plain] [-- --out <dir>]
// npm run restore -- <file>
// npm run delete-my-data -- --yes-delete-everything
// (Milestone 6, JOB-031; the runbook in docs/operations/runbook.md walks through both.)

loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"),
});

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const env = loadEnv();
  const sql = postgres(env.DATABASE_URL, { max: 2, onnotice: () => {} });
  try {
    if (command === "backup") {
      const plain = args.includes("--plain");
      const dir = option(args, "--out") ?? (env.BACKUP_DIR || "./backups");
      const written = await writeBackup(sql, env, { dir, plain });
      if (plain) console.warn("Warning: this export is NOT encrypted. It holds your CV, profile and messages: keep it somewhere private and delete it when done.");
      console.log(`Wrote ${written.file} (${written.rows} rows, ${written.files} files, ${written.bytes} bytes).`);
    } else if (command === "restore") {
      const file = args.find((arg) => !arg.startsWith("--"));
      if (!file) throw new Error("Usage: npm run restore -- <backup file>");
      const payload = readArchive(await readFile(file), backupKey(env));
      const result = await restoreBackup(sql, env.STORAGE_DIR, payload);
      console.log(`Restored ${result.rows} rows in ${result.tables} tables and ${result.files} files from the backup of ${payload.createdAt}.`);
      if (result.skippedTables.length > 0) console.log(`Not restored (no longer in the schema): ${result.skippedTables.join(", ")}.`);
    } else if (command === "delete-my-data") {
      if (!args.includes("--yes-delete-everything")) {
        throw new Error(
          "This deletes your profile, CV, jobs, applications, documents, recruiter messages, the Gmail connection and every stored file, and cannot be undone. Make a backup first (npm run backup), stop the worker, then run: npm run delete-my-data -- --yes-delete-everything",
        );
      }
      const db = createDb(sql);
      const result = await deleteMyData(sql, env.STORAGE_DIR, {
        audit: new AuditRepository(db),
        disconnectMailbox: () => emailAccountServiceFromEnv(env, db).forget(),
      });
      console.log(`Deleted ${result.rows} rows in ${result.tables} tables and ${result.files} stored files.`);
      if (result.mailboxRevoked === false) console.log("Gmail access could not be revoked from here: remove it at https://myaccount.google.com/permissions.");
      if (result.mailboxRevoked === true) console.log("Gmail access was revoked.");
      console.log("Kept: the audit log, the AI cost ledger and the job source settings.");
    } else {
      throw new Error("Usage: npm run backup [-- --plain] [-- --out <dir>] | npm run restore -- <file> | npm run delete-my-data -- --yes-delete-everything");
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
