import { test } from "node:test";
import assert from "node:assert/strict";
import { SignInLimiter } from "./sign-in-limiter.js";

const MINUTE = 60_000;

function clock(start = Date.parse("2026-10-14T12:00:00Z")) {
  let now = start;
  return { now: () => new Date(now), advance: (ms: number) => (now += ms) };
}

test("five failures in the window block further attempts until the oldest one ages out", () => {
  const time = clock();
  const limiter = new SignInLimiter({ maxFailures: 5, windowMs: 15 * MINUTE, now: time.now });
  for (let i = 0; i < 5; i += 1) {
    assert.equal(limiter.check().allowed, true);
    limiter.recordFailure();
    time.advance(MINUTE);
  }
  const blocked = limiter.check();
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 10 * MINUTE);
  time.advance(10 * MINUTE);
  assert.equal(limiter.check().allowed, true);
});

test("a successful sign-in clears the failures", () => {
  const time = clock();
  const limiter = new SignInLimiter({ maxFailures: 2, windowMs: 15 * MINUTE, now: time.now });
  limiter.recordFailure();
  limiter.reset();
  limiter.recordFailure();
  assert.equal(limiter.check().allowed, true);
});
