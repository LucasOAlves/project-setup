import assert from "node:assert/strict";
import test from "node:test";
import { parseJsonObject } from "./parse-json.ts";

test("parses raw and fenced JSON", () => {
  assert.deepEqual(parseJsonObject('{"ok":true}'), { ok: true });
  assert.deepEqual(parseJsonObject('```json\n{"ok":true}\n```'), { ok: true });
});

test("rejects invalid JSON", () => {
  assert.throws(() => parseJsonObject("not json"), /valid JSON/);
});
