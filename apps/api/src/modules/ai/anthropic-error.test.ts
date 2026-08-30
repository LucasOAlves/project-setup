import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "@studio/shared";
import { mapAnthropicError } from "./anthropic-error.ts";

test("maps auth, rate limit, and unknown failures", () => {
  assert.equal(mapAnthropicError({ status: 401 }).code, ERROR_CODES.PROVIDER_UNAVAILABLE);
  assert.equal(mapAnthropicError({ status: 429 }).statusCode, 503);
  assert.equal(mapAnthropicError(new Error("network")).code, ERROR_CODES.PROVIDER_UNAVAILABLE);
});
