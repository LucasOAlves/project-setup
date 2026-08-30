import assert from "node:assert/strict";
import test from "node:test";
import { mapFormatToAngle } from "./content-plan-angle.ts";

test("diagrams map to an architectural angle", () => {
  assert.equal(mapFormatToAngle("DIAGRAM"), "ARCHITECTURAL");
});

test("every other format maps to an educational angle, never experience-driven", () => {
  for (const format of ["NARRATIVE", "CHECKLIST", "DOCUMENT", "CAROUSEL"] as const) {
    assert.equal(mapFormatToAngle(format), "EDUCATIONAL");
  }
});
