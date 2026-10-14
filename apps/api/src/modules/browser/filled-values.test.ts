import { test } from "node:test";
import assert from "node:assert/strict";
import type { FieldPlan } from "@studio/shared";
import { checkFilledValues } from "./filled-values.js";

function plan(key: string, kind: FieldPlan["kind"], value: string | null, overrides: Partial<FieldPlan> = {}): FieldPlan {
  return {
    key,
    questionKey: key,
    label: key,
    kind,
    required: true,
    options: [],
    status: value === null ? "LEFT_EMPTY" : "FILLED",
    value,
    source: "YOUR_DETAILS",
    ...overrides,
  };
}

test("values the page kept are confirmed", () => {
  const result = checkFilledValues(
    [plan("a", "TEXT", "Ada"), plan("b", "SELECT", "Brazil"), plan("c", "RADIO", "No"), plan("d", "FILE", "CV PDF", { documentId: "x" })],
    { a: { value: " Ada " }, b: { value: "brazil" }, c: { value: "No" }, d: { value: null, files: ["cv-v2.pdf"] } },
  );
  assert.deepEqual(result, { confirmed: ["a", "b", "c", "d"], mismatches: [], unverified: [] });
});

test("a value the page changed or dropped is a mismatch", () => {
  const result = checkFilledValues([plan("a", "EMAIL", "ada@example.com"), plan("b", "FILE", "CV PDF", { documentId: "x" })], {
    a: { value: "" },
    b: { value: null, files: [] },
  });
  assert.deepEqual(
    result.mismatches.map((mismatch) => [mismatch.key, mismatch.actual]),
    [
      ["a", ""],
      ["b", null],
    ],
  );
});

test("a combobox keeps what the portal suggested if it contains the planned value", () => {
  const result = checkFilledValues([plan("a", "COMBOBOX", "Florianópolis, Brazil"), plan("b", "COMBOBOX", "Recife, Brazil")], {
    a: { value: "Florianópolis, Santa Catarina, Brazil" },
    b: { value: "" },
  });
  assert.deepEqual(result.confirmed, ["a"]);
  assert.deepEqual(result.mismatches.map((mismatch) => mismatch.key), ["b"]);
});

test("a field the page cannot report back is unverified, not a mismatch", () => {
  const result = checkFilledValues([plan("a", "YES_NO", "No")], { a: { value: null } });
  assert.deepEqual(result, { confirmed: [], mismatches: [], unverified: ["a"] });
});

test("fields that were not filled are not checked", () => {
  const result = checkFilledValues([plan("a", "TEXT", null), plan("b", "TEXT", null, { status: "NEEDS_INPUT" })], {});
  assert.deepEqual(result, { confirmed: [], mismatches: [], unverified: [] });
});

test("a filled field missing from the page is a mismatch", () => {
  const result = checkFilledValues([plan("a", "TEXT", "Ada")], {});
  assert.deepEqual(result.mismatches, [{ key: "a", expected: "Ada", actual: null }]);
});
