import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createSessionToken, sessionKey, verifySessionToken } from "./session-token.js";

const KEY = sessionKey("a-session-secret-that-is-long-enough-123", "scrypt:16384:8:1:c2FsdA:aGFzaA");
const NOW = new Date("2026-10-14T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

test("a fresh token verifies until it expires", () => {
  const token = createSessionToken(KEY, NOW, DAY);
  const check = verifySessionToken(token, KEY, new Date(NOW.getTime() + DAY - 1));
  assert.deepEqual(check, { ok: true, expiresAt: new Date(NOW.getTime() + DAY) });
});

test("a token is refused at and after its expiry", () => {
  const token = createSessionToken(KEY, NOW, DAY);
  assert.deepEqual(verifySessionToken(token, KEY, new Date(NOW.getTime() + DAY)), { ok: false, reason: "EXPIRED" });
});

test("a missing or empty token is MISSING", () => {
  assert.deepEqual(verifySessionToken(undefined, KEY, NOW), { ok: false, reason: "MISSING" });
  assert.deepEqual(verifySessionToken("", KEY, NOW), { ok: false, reason: "MISSING" });
});

test("a token that is not payload.signature is MALFORMED", () => {
  for (const token of ["abc", "a.b.c", ".sig", "payload."]) {
    assert.deepEqual(verifySessionToken(token, KEY, NOW), { ok: false, reason: "MALFORMED" }, token);
  }
});

test("a token signed with another key is BAD_SIGNATURE", () => {
  const other = sessionKey("another-session-secret-that-is-long-12345", "scrypt:16384:8:1:c2FsdA:aGFzaA");
  const token = createSessionToken(other, NOW, DAY);
  assert.deepEqual(verifySessionToken(token, KEY, NOW), { ok: false, reason: "BAD_SIGNATURE" });
});

test("changing the password hash changes the key, so old sessions stop working", () => {
  const token = createSessionToken(KEY, NOW, DAY);
  const newKey = sessionKey("a-session-secret-that-is-long-enough-123", "scrypt:16384:8:1:b3RoZXI:b3RoZXI");
  assert.deepEqual(verifySessionToken(token, newKey, NOW), { ok: false, reason: "BAD_SIGNATURE" });
});

test("an edited payload no longer matches its signature", () => {
  const token = createSessionToken(KEY, NOW, DAY);
  const [, signature] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ v: 1, iat: NOW.getTime(), exp: NOW.getTime() + 100 * DAY })).toString("base64url");
  assert.deepEqual(verifySessionToken(`${forged}.${signature}`, KEY, NOW), { ok: false, reason: "BAD_SIGNATURE" });
});

test("a correctly signed payload with the wrong shape is MALFORMED", () => {
  const payload = Buffer.from(JSON.stringify({ v: 2, exp: "soon" })).toString("base64url");
  const signature = createHmac("sha256", KEY).update(payload).digest("base64url");
  assert.deepEqual(verifySessionToken(`${payload}.${signature}`, KEY, NOW), { ok: false, reason: "MALFORMED" });
});

test("sessionKey refuses a short secret", () => {
  assert.throws(() => sessionKey("short", "scrypt:16384:8:1:c2FsdA:aGFzaA"), /at least 32/);
});
