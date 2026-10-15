import assert from "node:assert/strict";
import { test } from "node:test";
import { backupFileName, backupsToPrune } from "./backup-files.js";

test("a backup is named by its UTC time, sealed or plain", () => {
  const now = new Date("2026-10-15T12:46:07.123Z");
  assert.equal(backupFileName(now, false), "jobhunter-2026-10-15T12-46-07Z.jhb");
  assert.equal(backupFileName(now, true), "jobhunter-2026-10-15T12-46-07Z.json");
});

test("the newest backups are kept and the older ones pruned", () => {
  const names = [
    "jobhunter-2026-10-13T03-00-00Z.jhb",
    "jobhunter-2026-10-15T03-00-00Z.jhb",
    "jobhunter-2026-10-11T03-00-00Z.jhb",
    "jobhunter-2026-10-14T03-00-00Z.jhb",
    "jobhunter-2026-10-12T03-00-00Z.jhb",
  ];
  assert.deepEqual(backupsToPrune(names, 3), ["jobhunter-2026-10-12T03-00-00Z.jhb", "jobhunter-2026-10-11T03-00-00Z.jhb"]);
  assert.deepEqual(backupsToPrune(names, 5), []);
  assert.deepEqual(backupsToPrune(names, 9), []);
});

test("only sealed backups count: plain exports and other files are never pruned", () => {
  const names = [
    "jobhunter-2026-10-10T03-00-00Z.json",
    "notes.txt",
    "jobhunter-2026-10-11T03-00-00Z.jhb",
    "jobhunter-2026-10-12T03-00-00Z.jhb",
    "other-2026-10-01T03-00-00Z.jhb",
    "jobhunter-latest.jhb",
  ];
  assert.deepEqual(backupsToPrune(names, 1), ["jobhunter-2026-10-11T03-00-00Z.jhb"]);
});

test("keeping fewer than one is refused, so a bad setting never deletes every backup", () => {
  assert.throws(() => backupsToPrune(["jobhunter-2026-10-11T03-00-00Z.jhb"], 0), /at least 1/);
});
