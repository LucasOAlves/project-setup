import assert from "node:assert/strict";
import test from "node:test";
import type { JobPublic, ProfilePublic } from "@studio/shared";
import { computeContentTopicSuggestions } from "./content-suggestions.ts";

function fakeJob(overrides: Partial<JobPublic> = {}): JobPublic {
  return {
    id: "job-1",
    companyId: "company-1",
    source: "manual",
    externalId: "",
    title: "Staff Platform Engineer",
    url: "",
    location: "",
    workplaceType: null,
    employmentType: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "",
    description: "",
    requirements: [],
    preferredQualifications: [],
    technologies: [],
    seniority: "",
    notes: "",
    nextAction: "",
    status: "SAVED",
    fitScore: null,
    discoveredAt: new Date().toISOString(),
    appliedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakeExperience(overrides: Partial<ProfilePublic["experiences"][number]> = {}) {
  return {
    id: "exp-1",
    role: "Staff Engineer",
    company: "Nimbus",
    startPeriod: "",
    endPeriod: "",
    description: "",
    responsibilities: "",
    achievements: "",
    technologies: [] as string[],
    measurableOutcomes: "",
    ...overrides,
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
    topSkills: [],
    technologies: [],
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
    experiences: [],
    writingSamples: [],
    photos: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    evidenceWarning: null,
    ...overrides,
  };
}

test("returns nothing when no tracked job lists any technology", () => {
  const suggestions = computeContentTopicSuggestions([fakeJob()], fakeProfile());
  assert.deepEqual(suggestions, []);
});

test("never suggests a technology the profile has no evidence for", () => {
  const suggestions = computeContentTopicSuggestions(
    [fakeJob({ technologies: ["Kubernetes"] })],
    fakeProfile({ technologies: [], topSkills: [] }),
  );
  assert.deepEqual(suggestions, []);
});

test("suggests a technology with real profile evidence, with a concrete experience reference", () => {
  const suggestions = computeContentTopicSuggestions(
    [
      fakeJob({ id: "1", technologies: ["Kubernetes"] }),
      fakeJob({ id: "2", technologies: ["Kubernetes", "Go"] }),
    ],
    fakeProfile({
      technologies: ["Kubernetes"],
      experiences: [fakeExperience({ technologies: ["Kubernetes"], achievements: "Led a migration to Kubernetes." })],
    }),
  );

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.technology, "Kubernetes");
  assert.equal(suggestions[0]?.jobCount, 2);
  assert.equal(suggestions[0]?.totalJobs, 2);
  assert.equal(suggestions[0]?.demandPercent, 100);
  assert.ok(suggestions[0]?.evidence.includes("Staff Engineer at Nimbus"));
  assert.ok(suggestions[0]?.hook.includes("2 of 2 tracked jobs"));
});

test("falls back to a skills-list evidence line when no specific experience lists the technology", () => {
  const suggestions = computeContentTopicSuggestions(
    [fakeJob({ technologies: ["Kubernetes"] })],
    fakeProfile({ topSkills: ["Kubernetes"], experiences: [] }),
  );

  assert.equal(suggestions.length, 1);
  assert.ok(suggestions[0]?.evidence.includes("already in your profile"));
});

test("ranks technologies by how many tracked jobs request them", () => {
  const suggestions = computeContentTopicSuggestions(
    [
      fakeJob({ id: "1", technologies: ["Kubernetes", "Go"] }),
      fakeJob({ id: "2", technologies: ["Kubernetes"] }),
      fakeJob({ id: "3", technologies: ["Go"] }),
    ],
    fakeProfile({ technologies: ["Kubernetes", "Go"] }),
  );

  assert.equal(suggestions[0]?.technology, "Kubernetes");
  assert.equal(suggestions[0]?.jobCount, 2);
});

test("counts a technology at most once per job even if listed twice", () => {
  const suggestions = computeContentTopicSuggestions(
    [fakeJob({ technologies: ["Kubernetes", "kubernetes"] })],
    fakeProfile({ technologies: ["Kubernetes"] }),
  );

  assert.equal(suggestions[0]?.jobCount, 1);
});
