import assert from "node:assert/strict";
import test from "node:test";
import type { ProfilePublic } from "@studio/shared";
import { applyTailoringPlan, groundTailoringPlan } from "./resume-tailoring.ts";

function fakeExperience(id: string, role: string) {
  return {
    id,
    role,
    company: "",
    startPeriod: "",
    endPeriod: "",
    description: "",
    responsibilities: "",
    achievements: "",
    technologies: [],
    measurableOutcomes: "",
  };
}

function fakeProfile(overrides: Partial<ProfilePublic> = {}): ProfilePublic {
  return {
    id: "profile-1",
    fullName: "Jordan Rivera",
    headline: "",
    currentJobTitle: "",
    currentCompany: "",
    about: "",
    topSkills: ["Kubernetes", "Node.js"],
    technologies: ["Kubernetes", "Node.js", "PostgreSQL"],
    industries: [],
    yearsOfExperience: null,
    architectureExperience: "",
    leadershipExperience: "",
    businessImpact: "",
    subjectsOfInterest: [],
    subjectsToAvoid: [],
    targetAudience: "",
    preferredLanguage: "English",
    positioning: [],
    desiredPerception: "",
    writingTones: [],
    postLength: "MEDIUM",
    experiences: [fakeExperience("exp-a", "A"), fakeExperience("exp-b", "B")],
    writingSamples: [],
    photos: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    evidenceWarning: null,
    ...overrides,
  };
}

test("groundTailoringPlan drops ids and skills that do not exist in the profile", () => {
  const grounded = groundTailoringPlan(
    {
      rationale: "x",
      experienceOrder: ["exp-b", "not-real"],
      topSkillsOrder: ["Kubernetes", "Terraform"],
      technologiesOrder: ["postgresql"],
    },
    fakeProfile(),
  );

  assert.deepEqual(grounded.experienceOrder, ["exp-b", "exp-a"]);
  assert.deepEqual(grounded.topSkillsOrder, ["Kubernetes", "Node.js"]);
  // Case-insensitive match returns the profile's own casing, not the model's.
  assert.deepEqual(grounded.technologiesOrder, ["PostgreSQL", "Kubernetes", "Node.js"]);
});

test("groundTailoringPlan never drops a real experience the model forgot to mention", () => {
  const grounded = groundTailoringPlan(
    { rationale: "x", experienceOrder: [], topSkillsOrder: [], technologiesOrder: [] },
    fakeProfile(),
  );

  assert.deepEqual(grounded.experienceOrder.sort(), ["exp-a", "exp-b"]);
});

test("applyTailoringPlan reorders experiences and skills without changing their content", () => {
  const profile = fakeProfile();
  const grounded = groundTailoringPlan(
    {
      rationale: "x",
      experienceOrder: ["exp-b"],
      topSkillsOrder: ["Node.js"],
      technologiesOrder: [],
    },
    profile,
  );

  const tailored = applyTailoringPlan(profile, grounded);

  assert.deepEqual(
    tailored.experiences.map((experience) => experience.id),
    ["exp-b", "exp-a"],
  );
  assert.deepEqual(tailored.topSkills, ["Node.js", "Kubernetes"]);
  assert.equal(tailored.fullName, profile.fullName);
});
