import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

// The backup archive (Milestone 6, JOB-031; spec section 6 "Encrypt backups and provide local
// export"). Pure: the file format, the order rows are restored in, and which archives this
// version can restore.
//
// Sealed format: "JHB1" | 12-byte IV | 16-byte GCM tag | AES-256-GCM(gzip(JSON)), with the
// header as additional data. A plain export is the JSON itself.

export type BackupPayload = {
  format: 1;
  createdAt: string;
  // The schema migrations applied when the backup was made.
  migrations: string[];
  tables: Record<string, Array<Record<string, unknown>>>;
  // Stored files by storage key, base64.
  files: Record<string, string>;
};

const MAGIC = Buffer.from("JHB1", "latin1");
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function sealArchive(key: Buffer, payload: BackupPayload): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(payload), "utf8"))), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function writePlainArchive(payload: BackupPayload): Buffer {
  return Buffer.from(JSON.stringify(payload, null, 2), "utf8");
}

function parsePayload(json: string): BackupPayload {
  const parsed = JSON.parse(json) as Partial<BackupPayload>;
  if (parsed.format !== 1 || !Array.isArray(parsed.migrations) || typeof parsed.tables !== "object" || typeof parsed.files !== "object") {
    throw new Error("This is not a Job Hunter backup.");
  }
  return parsed as BackupPayload;
}

export function readArchive(file: Buffer, key: Buffer | null): BackupPayload {
  if (file.subarray(0, MAGIC.length).equals(MAGIC)) {
    if (!key) throw new Error("This backup is encrypted: set BACKUP_ENCRYPTION_KEY to the key it was made with.");
    try {
      const iv = file.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
      const tag = file.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(MAGIC);
      decipher.setAuthTag(tag);
      const zipped = Buffer.concat([decipher.update(file.subarray(MAGIC.length + IV_BYTES + TAG_BYTES)), decipher.final()]);
      return parsePayload(gunzipSync(zipped).toString("utf8"));
    } catch {
      throw new Error("The backup could not be opened: a wrong key or a damaged file.");
    }
  }
  try {
    return parsePayload(file.toString("utf8"));
  } catch {
    throw new Error("This is not a Job Hunter backup.");
  }
}

// Tables ordered so each comes after the tables it references (self-references ignored).
// Ties keep alphabetical order, so the same schema always restores the same way.
export function foreignKeyOrder(tables: string[], edges: Array<{ table: string; references: string }>): string[] {
  const names = new Set(tables);
  const needs = new Map<string, Set<string>>(tables.map((table) => [table, new Set<string>()]));
  for (const edge of edges) {
    if (edge.table !== edge.references && names.has(edge.table) && names.has(edge.references)) needs.get(edge.table)!.add(edge.references);
  }
  const order: string[] = [];
  const placed = new Set<string>();
  while (order.length < tables.length) {
    const ready = [...needs.entries()]
      .filter(([table, deps]) => !placed.has(table) && [...deps].every((dep) => placed.has(dep)))
      .map(([table]) => table)
      .sort();
    if (ready.length === 0) throw new Error(`Foreign keys form a cycle among: ${tables.filter((table) => !placed.has(table)).sort().join(", ")}.`);
    const next = ready[0]!;
    order.push(next);
    placed.add(next);
  }
  return order;
}

// An archive restores into this version only if every migration it was made at is one this
// version knows; the database is then migrated forward as usual.
export function checkRestorable(input: { archiveMigrations: string[]; knownMigrations: string[] }): { ok: true } | { ok: false; reason: string } {
  if (input.archiveMigrations.length === 0) return { ok: false, reason: "The backup records no schema version." };
  const known = new Set(input.knownMigrations);
  const unknown = input.archiveMigrations.filter((migration) => !known.has(migration));
  if (unknown.length > 0) return { ok: false, reason: `The backup was made by a newer version of the app (unknown migrations: ${unknown.join(", ")}). Upgrade first.` };
  return { ok: true };
}
