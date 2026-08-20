import assert from "node:assert/strict";
import test from "node:test";
import { assessProfileEvidence, profileInputSchema } from "./profile.ts";

test("accepts a partial profile", () => {
  const parsed = profileInputSchema.parse({
    fullName: "Alex Silva",
    headline: "Staff Engineer",
  });
  assert.equal(parsed.fullName, "Alex Silva");
  assert.equal(parsed.postLength, "MEDIUM");
  assert.deepEqual(parsed.experiences, []);
});

test("rejects oversized skill lists", () => {
  assert.throws(() =>
    profileInputSchema.parse({
      topSkills: Array.from({ length: 31 }, (_, i) => `skill-${i}`),
    }),
  );
});

test("warns when evidence is missing", () => {
  const warning = assessProfileEvidence(profileInputSchema.parse({}));
  assert.match(String(warning), /enough professional evidence/);
});

test("does not warn when experience exists", () => {
  const warning = assessProfileEvidence(
    profileInputSchema.parse({
      headline: "Platform Engineer",
      experiences: [{ role: "Platform Engineer", company: "Nimbus" }],
    }),
  );
  assert.equal(warning, null);
});
