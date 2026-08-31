import assert from "node:assert/strict";
import test from "node:test";
import type { ProfilePublic } from "@studio/shared";
import { buildResumePdf } from "./resume-pdf.ts";

function fakeProfile(overrides: Partial<ProfilePublic> = {}): ProfilePublic {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    fullName: "Jordan Rivera",
    headline: "Staff Platform Engineer",
    currentJobTitle: "Staff Engineer",
    currentCompany: "Nimbus",
    about: "Builds internal platforms.",
    topSkills: ["Kubernetes"],
    technologies: ["Go"],
    industries: ["SaaS"],
    yearsOfExperience: 10,
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
    experiences: [
      {
        id: "00000000-0000-4000-8000-000000000002",
        role: "Staff Engineer",
        company: "Nimbus",
        startPeriod: "2021",
        endPeriod: "Present",
        description: "Leads platform reliability.",
        responsibilities: "",
        achievements: "Cut incident rate in half.",
        technologies: ["Kubernetes"],
        measurableOutcomes: "50% fewer incidents.",
      },
    ],
    writingSamples: [],
    photos: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    evidenceWarning: null,
    ...overrides,
  };
}

test("buildResumePdf produces a non-empty PDF buffer", async () => {
  const pdf = await buildResumePdf(fakeProfile());
  assert.ok(pdf.length > 0);
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
});

test("buildResumePdf handles an empty profile without throwing", async () => {
  const pdf = await buildResumePdf(
    fakeProfile({
      fullName: "",
      headline: "",
      currentJobTitle: "",
      currentCompany: "",
      about: "",
      topSkills: [],
      technologies: [],
      industries: [],
      experiences: [],
    }),
  );
  assert.ok(pdf.length > 0);
});
