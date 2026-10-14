import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, isPasswordHash, verifyPassword } from "./password.js";

// A low cost keeps the tests fast; production hashes use the default.
const FAST = { cost: 1024 };

test("a hashed password verifies, and a different one does not", async () => {
  const stored = await hashPassword("correct horse battery staple", FAST);
  assert.equal(await verifyPassword("correct horse battery staple", stored), true);
  assert.equal(await verifyPassword("correct horse battery stapl", stored), false);
});

test("the hash has the scrypt:cost:r:p:salt:hash shape and a fresh salt each time", async () => {
  const a = await hashPassword("same password", FAST);
  const b = await hashPassword("same password", FAST);
  assert.match(a, /^scrypt:1024:8:1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  assert.notEqual(a, b);
  assert.equal(isPasswordHash(a), true);
});

test("the default cost is 16384", async () => {
  assert.match(await hashPassword("x".repeat(12)), /^scrypt:16384:/);
});

test("passwords shorter than 12 characters are refused", async () => {
  await assert.rejects(() => hashPassword("short", FAST), /at least 12/);
});

test("a malformed stored hash never verifies and is not a password hash", async () => {
  for (const stored of ["", "plain-text", "scrypt:abc:8:1:salt:hash", "bcrypt:10:x:y:z:w", "scrypt:1024:8:1::", "scrypt$1024$8$1$c2FsdA$aGFzaA"]) {
    assert.equal(await verifyPassword("anything at all", stored), false, stored);
    assert.equal(isPasswordHash(stored), false, stored);
  }
});
