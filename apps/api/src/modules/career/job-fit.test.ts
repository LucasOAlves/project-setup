import assert from "node:assert/strict";
import test from "node:test";
import type { JobPublic, ProfilePublic } from "@studio/shared";
import { computeJobFit } from "./job-fit.ts";

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

test("technical dimension is a full match when there is no required technology", () => {
  const fit = computeJobFit(fakeJob({ technologies: [] }), fakeProfile());
  assert.equal(fit.dimensions.technical, 100);
});

test("technical dimension matches technologies case-insensitively", () => {
  const fit = computeJobFit(
    fakeJob({ technologies: ["Kubernetes", "Node.js"] }),
    fakeProfile({ technologies: ["kubernetes", "React"] }),
  );
  assert.equal(fit.dimensions.technical, 50);
  assert.deepEqual(fit.strengths, ["Kubernetes"]);
  assert.deepEqual(fit.gaps, ["Node.js"]);
});

test("seniority dimension scores a full match when bands align", () => {
  const fit = computeJobFit(
    fakeJob({ seniority: "Staff Engineer" }),
    fakeProfile({ yearsOfExperience: 9 }),
  );
  assert.equal(fit.dimensions.seniority, 100);
});

test("seniority dimension penalizes a large band gap", () => {
  const fit = computeJobFit(
    fakeJob({ seniority: "Principal Engineer" }),
    fakeProfile({ yearsOfExperience: 1 }),
  );
  assert.equal(fit.dimensions.seniority, 0);
});

test("seniority dimension is neutral when either side has no signal", () => {
  const fit = computeJobFit(fakeJob({ seniority: "" }), fakeProfile({ yearsOfExperience: 9 }));
  assert.equal(fit.dimensions.seniority, 70);
});

test("architecture dimension is only scored when the job actually asks for it", () => {
  const notRequired = computeJobFit(fakeJob({ description: "Build features." }), fakeProfile());
  assert.equal(notRequired.dimensions.architecture, 100);

  const requiredNoEvidence = computeJobFit(
    fakeJob({ description: "Own system design and architecture decisions." }),
    fakeProfile({ architectureExperience: "" }),
  );
  assert.equal(requiredNoEvidence.dimensions.architecture, 30);
  assert.ok(requiredNoEvidence.gaps.includes("Architecture / system design evidence"));

  const requiredWithEvidence = computeJobFit(
    fakeJob({ description: "Own system design and architecture decisions." }),
    fakeProfile({ architectureExperience: "Led architecture for a payments platform." }),
  );
  assert.equal(requiredWithEvidence.dimensions.architecture, 90);
  assert.ok(requiredWithEvidence.strengths.includes("Architecture experience"));
});

test("leadership dimension checks experience text, not just the dedicated field", () => {
  const fit = computeJobFit(
    fakeJob({ description: "Mentor and lead a team of engineers." }),
    fakeProfile({
      leadershipExperience: "",
      experiences: [
        {
          id: "exp-1",
          role: "Tech Lead",
          company: "Nimbus",
          startPeriod: "",
          endPeriod: "",
          description: "",
          responsibilities: "Mentored junior engineers and led sprint planning.",
          achievements: "",
          technologies: [],
          measurableOutcomes: "",
        },
      ],
    }),
  );
  assert.equal(fit.dimensions.leadership, 90);
});

test("recommendation tiers follow the overall score", () => {
  const strong = computeJobFit(
    fakeJob({ technologies: ["Node.js"], seniority: "Senior" }),
    fakeProfile({ technologies: ["Node.js"], yearsOfExperience: 6 }),
  );
  assert.equal(strong.recommendation, "STRONG_APPLY");

  const weak = computeJobFit(
    fakeJob({ technologies: ["Kubernetes", "Terraform", "Go"], seniority: "Principal" }),
    fakeProfile({ technologies: [], yearsOfExperience: 1 }),
  );
  assert.equal(weak.recommendation, "WEAK_FIT");
});
