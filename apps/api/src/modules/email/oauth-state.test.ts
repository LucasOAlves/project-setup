import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { OAUTH_STATE_TTL_MS, issueOAuthState, verifyOAuthState } from "./oauth-state.js";

const KEY = randomBytes(32);
const NOW = new Date("2026-10-15T12:00:00Z");

test("the state Google sends back matches the cookie set when the sign-in started", () => {
  const issued = issueOAuthState(KEY, NOW);
  assert.match(issued.state, /^[A-Za-z0-9_-]{32,}$/);
  assert.equal(verifyOAuthState(KEY, { state: issued.state, cookie: issued.cookie }, new Date(NOW.getTime() + 60_000)), true);
});

test("a missing, swapped, forged or expired state is refused", () => {
  const issued = issueOAuthState(KEY, NOW);
  const other = issueOAuthState(KEY, NOW);
  assert.equal(verifyOAuthState(KEY, { state: issued.state, cookie: undefined }, NOW), false);
  assert.equal(verifyOAuthState(KEY, { state: undefined, cookie: issued.cookie }, NOW), false);
  assert.equal(verifyOAuthState(KEY, { state: other.state, cookie: issued.cookie }, NOW), false);
  assert.equal(verifyOAuthState(randomBytes(32), { state: issued.state, cookie: issued.cookie }, NOW), false);
  const [nonce, , mac] = issued.cookie.split(".");
  const later = String(NOW.getTime() + 10 * OAUTH_STATE_TTL_MS);
  assert.equal(verifyOAuthState(KEY, { state: issued.state, cookie: `${nonce}.${later}.${mac}` }, NOW), false, "a changed expiry breaks the signature");
  assert.equal(verifyOAuthState(KEY, { state: issued.state, cookie: issued.cookie }, new Date(NOW.getTime() + OAUTH_STATE_TTL_MS + 1)), false);
  assert.equal(verifyOAuthState(KEY, { state: issued.state, cookie: "garbage" }, NOW), false);
});
