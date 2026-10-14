import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ApplicationDetailsPublic } from "@studio/shared";
import { buildApplicationAnswers, yearsWithTechnology } from "./application-answers.js";

const NOW = new Date("2026-10-14T12:00:00Z");

const details = {
  contact: { email: "dev@example.com", phone: "", city: "Recife", country: "Brazil", linkedinUrl: "https://linkedin.com/in/x", githubUrl: "", portfolioUrl: "" },
  education: [],
  certifications: [],
  spokenLanguages: [{ language: "Portuguese", level: "NATIVE" }, { language: "English", level: "FLUENT" }],
  workAuthorization: "Brazilian citizen working as a contractor.",
  requiresVisaSponsorship: false,
  noticePeriod: "30 days",
  timeZone: "America/Sao_Paulo (UTC-3)",
  salaryExpectation: { amount: 7000, currency: "USD", period: "MONTH" },
  version: 1,
  updatedAt: "2026-10-14T12:00:00Z",
} as ApplicationDetailsPublic;

const profile = {
  yearsOfExperience: 10,
  experiences: [
    { startPeriod: "2021", endPeriod: "Present", technologies: ["Node.js", "PostgreSQL"] },
    { startPeriod: "Jan 2017", endPeriod: "Dec 2021", technologies: ["nodejs", "Angular"] },
    { startPeriod: "2015", endPeriod: "2016", technologies: ["Java"] },
  ],
};

const byId = (answers: ReturnType<typeof buildApplicationAnswers>) => new Map(answers.map((answer) => [answer.id, answer]));

describe("yearsWithTechnology", () => {
  it("adds up the years of every experience listing the technology, counting overlaps once", () => {
    assert.deepEqual(yearsWithTechnology(profile.experiences, "Node.js", NOW), { years: 9 });
    assert.deepEqual(yearsWithTechnology(profile.experiences, "Java", NOW), { years: 1 });
  });

  it("reports when no experience lists it, or when a period has no year", () => {
    assert.deepEqual(yearsWithTechnology(profile.experiences, "Kubernetes", NOW), { years: null, reason: "NOT_IN_PROFILE" });
    assert.deepEqual(
      yearsWithTechnology([{ startPeriod: "recently", endPeriod: "", technologies: ["Go"] }], "Go", NOW),
      { years: null, reason: "UNDATED" },
    );
  });
});

describe("buildApplicationAnswers", () => {
  it("answers the standard questions from application details and the profile", () => {
    const answers = byId(buildApplicationAnswers({ profile, details, jobTechnologies: [], now: NOW }));
    assert.deepEqual(answers.get("WORK_AUTHORIZATION"), {
      id: "WORK_AUTHORIZATION",
      question: "What is your work authorization status?",
      answer: "Brazilian citizen working as a contractor.",
      status: "FROM_PROFILE",
    });
    assert.equal(answers.get("VISA_SPONSORSHIP")!.answer, "No, I do not require visa sponsorship.");
    assert.equal(answers.get("NOTICE_PERIOD")!.answer, "30 days");
    assert.equal(answers.get("SALARY_EXPECTATION")!.answer, "USD 7,000 per month");
    assert.equal(answers.get("LOCATION")!.answer, "Recife, Brazil");
    assert.equal(answers.get("TIME_ZONE")!.answer, "America/Sao_Paulo (UTC-3)");
    assert.equal(answers.get("ENGLISH_LEVEL")!.answer, "Fluent");
    assert.equal(answers.get("YEARS_OF_EXPERIENCE")!.answer, "10 years");
    assert.equal(answers.get("LINKEDIN")!.answer, "https://linkedin.com/in/x");
  });

  it("marks every answer it cannot back as needing the user's input, never guessing", () => {
    const answers = buildApplicationAnswers({ profile: { yearsOfExperience: null, experiences: [] }, details: null, jobTechnologies: [], now: NOW });
    for (const answer of answers) {
      assert.equal(answer.status, "NEEDS_INPUT", answer.id);
      assert.equal(answer.answer, "", answer.id);
    }
    const partial = byId(
      buildApplicationAnswers({
        profile,
        details: { ...details, requiresVisaSponsorship: null, spokenLanguages: [{ language: "Spanish", level: "BASIC" }], salaryExpectation: null },
        jobTechnologies: [],
        now: NOW,
      }),
    );
    assert.equal(partial.get("VISA_SPONSORSHIP")!.status, "NEEDS_INPUT");
    assert.equal(partial.get("ENGLISH_LEVEL")!.status, "NEEDS_INPUT");
    assert.equal(partial.get("SALARY_EXPECTATION")!.status, "NEEDS_INPUT");
  });

  it("says yes to sponsorship when the user said they need it", () => {
    const answers = byId(buildApplicationAnswers({ profile, details: { ...details, requiresVisaSponsorship: true }, jobTechnologies: [], now: NOW }));
    assert.equal(answers.get("VISA_SPONSORSHIP")!.answer, "Yes, I would require visa sponsorship.");
  });

  it("adds a years-with question for up to three of the job's technologies", () => {
    const answers = buildApplicationAnswers({ profile, details, jobTechnologies: ["Node.js", "Kubernetes", "Java", "Angular"], now: NOW });
    const tech = answers.filter((answer) => answer.id.startsWith("YEARS_WITH:"));
    assert.deepEqual(
      tech.map(({ id, question, answer, status }) => ({ id, question, answer, status })),
      [
        { id: "YEARS_WITH:Node.js", question: "How many years of professional experience do you have with Node.js?", answer: "9 years", status: "FROM_PROFILE" },
        { id: "YEARS_WITH:Kubernetes", question: "How many years of professional experience do you have with Kubernetes?", answer: "", status: "NEEDS_INPUT" },
        { id: "YEARS_WITH:Java", question: "How many years of professional experience do you have with Java?", answer: "1 year", status: "FROM_PROFILE" },
      ],
    );
    assert.equal(tech[1]!.note, "Your profile lists no experience with Kubernetes.");
  });
});
