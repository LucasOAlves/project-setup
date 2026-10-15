import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { parseEncryptionKey, openSecret, sealSecret } from "./secret-box.js";

const KEY = randomBytes(32);

test("a sealed secret opens with the same key and purpose", () => {
  const sealed = sealSecret(KEY, "gmail-refresh-token", "1//refresh-token-value");
  assert.equal(openSecret(KEY, "gmail-refresh-token", sealed), "1//refresh-token-value");
});

test("the sealed form never contains the secret and differs every time", () => {
  const a = sealSecret(KEY, "gmail-refresh-token", "1//refresh-token-value");
  const b = sealSecret(KEY, "gmail-refresh-token", "1//refresh-token-value");
  assert.notEqual(a, b);
  assert.ok(!a.includes("refresh-token-value"));
  assert.match(a, /^v1\./);
});

test("a wrong key, another purpose or a tampered value cannot be opened", () => {
  const sealed = sealSecret(KEY, "gmail-refresh-token", "secret");
  assert.throws(() => openSecret(randomBytes(32), "gmail-refresh-token", sealed));
  assert.throws(() => openSecret(KEY, "other-purpose", sealed));
  const parts = sealed.split(".");
  const body = Buffer.from(parts[3]!, "base64url");
  body[0] = body[0]! ^ 1;
  parts[3] = body.toString("base64url");
  assert.throws(() => openSecret(KEY, "gmail-refresh-token", parts.join(".")));
  assert.throws(() => openSecret(KEY, "gmail-refresh-token", "not-sealed"));
});

test("the key must be 32 bytes, given as base64 or hex", () => {
  const base64 = KEY.toString("base64");
  assert.deepEqual(parseEncryptionKey(base64), KEY);
  assert.deepEqual(parseEncryptionKey(KEY.toString("hex")), KEY);
  assert.equal(parseEncryptionKey(""), null);
  assert.throws(() => parseEncryptionKey(randomBytes(16).toString("base64")), /32 bytes/);
});
