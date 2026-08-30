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

test("tolerates a raw unescaped newline inside a string value", () => {
  const withRawNewline = '{"imagePrompt":"first line\nsecond line"}';
  assert.deepEqual(parseJsonObject(withRawNewline), {
    imagePrompt: "first line second line",
  });
});
