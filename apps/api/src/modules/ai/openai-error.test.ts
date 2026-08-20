import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "@studio/shared";
import { mapOpenAiError } from "./openai-error.ts";

test("maps auth, rate limit, and unknown failures", () => {
  assert.equal(mapOpenAiError({ status: 401 }).code, ERROR_CODES.PROVIDER_UNAVAILABLE);
  assert.equal(mapOpenAiError({ status: 429 }).statusCode, 503);
  assert.equal(mapOpenAiError(new Error("network")).code, ERROR_CODES.PROVIDER_UNAVAILABLE);
});
