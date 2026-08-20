import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LocalStorageProvider } from "./local-storage.ts";

test("stores files under server-controlled keys", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-storage-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const storage = new LocalStorageProvider(dir);
  const stored = await storage.put({
    bytes: Buffer.from("hello"),
    mimeType: "image/png",
    extension: "../../../evil.png",
  });

  assert.match(stored.key, /^[0-9a-f-]{36}\.png$/i);
  assert.equal(path.basename(stored.key), stored.key);

  const loaded = await storage.get(stored.key);
  assert.equal(loaded?.bytes.toString(), "hello");
});

test("ignores path-like client keys", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-storage-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const storage = new LocalStorageProvider(dir);
  const loaded = await storage.get("../secret.txt");
  assert.equal(loaded, null);
});
