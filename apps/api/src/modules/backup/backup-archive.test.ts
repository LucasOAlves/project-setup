import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { checkRestorable, foreignKeyOrder, readArchive, sealArchive, writePlainArchive, type BackupPayload } from "./backup-archive.js";

const key = randomBytes(32);
const payload: BackupPayload = {
  format: 1,
  createdAt: "2026-10-15T12:00:00.000Z",
  migrations: ["0001_profile.sql", "0002_persona.sql"],
  tables: { profiles: [{ id: "p1", headline: "Engineer" }], jobs: [] },
  files: { "a.pdf": Buffer.from("%PDF-1.7").toString("base64") },
};

// --- The archive: gzip then AES-256-GCM, with a header.

test("a sealed archive reads back with the same key", () => {
  const sealed = sealArchive(key, payload);
  assert.equal(sealed.subarray(0, 4).toString("latin1"), "JHB1");
  assert.deepEqual(readArchive(sealed, key), payload);
});

test("nothing of the content is readable in the sealed file", () => {
  const sealed = sealArchive(key, payload).toString("latin1");
  for (const secret of ["Engineer", "profiles", "%PDF"]) assert.ok(!sealed.includes(secret), secret);
});

test("a wrong key or a changed byte is refused", () => {
  const sealed = sealArchive(key, payload);
  assert.throws(() => readArchive(sealed, randomBytes(32)), /wrong key or a damaged file/);
  const tampered = Buffer.from(sealed);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => readArchive(tampered, key), /wrong key or a damaged file/);
});

test("a sealed archive without a key, or a file that is not a backup, is refused", () => {
  assert.throws(() => readArchive(sealArchive(key, payload), null), /BACKUP_ENCRYPTION_KEY/);
  assert.throws(() => readArchive(Buffer.from("hello"), key), /not a Job Hunter backup/);
});

test("a plain export is readable JSON and reads back without a key", () => {
  const plain = writePlainArchive(payload);
  assert.equal(JSON.parse(plain.toString("utf8")).tables.profiles[0].headline, "Engineer");
  assert.deepEqual(readArchive(plain, null), payload);
});

// --- Restoring rows in foreign-key order.

test("tables come after the tables they reference", () => {
  const order = foreignKeyOrder(
    ["applications", "jobs", "companies", "approvals", "profiles"],
    [
      { table: "jobs", references: "companies" },
      { table: "applications", references: "jobs" },
      { table: "approvals", references: "applications" },
      { table: "applications", references: "applications" },
    ],
  );
  const at = (name: string) => order.indexOf(name);
  assert.equal(order.length, 5);
  assert.ok(at("companies") < at("jobs") && at("jobs") < at("applications") && at("applications") < at("approvals"));
});

test("the order is stable: unrelated tables keep alphabetical order", () => {
  assert.deepEqual(foreignKeyOrder(["b", "a", "c"], []), ["a", "b", "c"]);
});

test("a cycle between tables is reported", () => {
  assert.throws(() => foreignKeyOrder(["a", "b"], [{ table: "a", references: "b" }, { table: "b", references: "a" }]), /cycle/);
});

// --- Which archives this version can restore.

test("an archive from this schema or an older one can be restored, a newer one cannot", () => {
  const known = ["0001_profile.sql", "0002_persona.sql", "0003_research.sql"];
  assert.deepEqual(checkRestorable({ archiveMigrations: ["0001_profile.sql", "0002_persona.sql"], knownMigrations: known }), { ok: true });
  const newer = checkRestorable({ archiveMigrations: [...known, "0004_future.sql"], knownMigrations: known });
  assert.equal(newer.ok, false);
  assert.match(newer.ok ? "" : newer.reason, /newer version.*0004_future\.sql/);
  assert.equal(checkRestorable({ archiveMigrations: [], knownMigrations: known }).ok, false);
});
