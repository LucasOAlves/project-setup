import assert from "node:assert/strict";
import test from "node:test";
import { scoreRecruiterRelevance } from "./recruiter-scoring.ts";

test("scores highest for a recruiter at a tracked company, tied to a job, with a recruiting role", () => {
  const score = scoreRecruiterRelevance({
    role: "Technical Recruiter",
    companyHasTrackedJob: true,
    linkedToJob: true,
  });
  assert.equal(score, 100);
});

test("still credits a hiring-manager role even without the word 'recruiter'", () => {
  const score = scoreRecruiterRelevance({
    role: "Engineering Manager",
    companyHasTrackedJob: true,
    linkedToJob: false,
  });
  assert.equal(score, 87); // 0.4*100 + 0.35*90 + 0.25*60 = 86.5, rounds up
});

test("an unrelated role at an unrelated company scores low, not zero", () => {
  const score = scoreRecruiterRelevance({
    role: "Sales Director",
    companyHasTrackedJob: false,
    linkedToJob: false,
  });
  assert.equal(score, 45); // 0.4*40 + 0.35*40 + 0.25*60
});

test("a bare 'director' title does not false-positive as a hiring role", () => {
  const score = scoreRecruiterRelevance({
    role: "Director of Marketing",
    companyHasTrackedJob: false,
    linkedToJob: false,
  });
  assert.equal(score, 45);
});

test("an empty role is neutral, not penalized as irrelevant", () => {
  const score = scoreRecruiterRelevance({
    role: "",
    companyHasTrackedJob: true,
    linkedToJob: false,
  });
  assert.equal(score, 73); // 0.4*100 + 0.35*50 + 0.25*60 = 72.5, rounds up
});
