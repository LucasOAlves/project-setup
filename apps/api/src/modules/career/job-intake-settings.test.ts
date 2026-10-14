import assert from "node:assert/strict";
import test from "node:test";
import { evaluationSettingsFromEnv } from "./job-intake.ts";
import { DEFAULT_MATCH_PREFERENCES } from "./job-matching.ts";

const BASE = { MATCH_TARGET_USD_MONTHLY: 7000, EXPLANATION_MIN_SCORE: 60, EXPLANATION_DAILY_LIMIT: 25 };

test("an empty target role list keeps the default roles", () => {
  const settings = evaluationSettingsFromEnv({ ...BASE, MATCH_TARGET_ROLES: [] });
  assert.deepEqual(settings.matchPreferences.targetRoleKeywords, DEFAULT_MATCH_PREFERENCES.targetRoleKeywords);
  assert.equal(settings.matchPreferences.targetUsdMonthly, 7000);
});

test("a configured target role list replaces the defaults", () => {
  const settings = evaluationSettingsFromEnv({ ...BASE, MATCH_TARGET_ROLES: ["design engineer", "senior"] });
  assert.deepEqual(settings.matchPreferences.targetRoleKeywords, ["design engineer", "senior"]);
});
