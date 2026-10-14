import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApplicationDetailsPublic, ProfilePublic, TailoredCvContent } from "@studio/shared";
import { AppError } from "../../app-error.js";
import { TailoredCvGenerator } from "./tailored-cv-generator.js";
import { buildTailoredCvPdf } from "./tailored-cv-pdf.js";

const EXP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JOB = "11111111-1111-4111-8111-111111111111";

const profile = {
  fullName: "Dana Example",
  headline: "Senior Backend Engineer",
  currentJobTitle: "Tech Lead",
  yearsOfExperience: 10,
  topSkills: ["System design"],
  technologies: ["Node.js", "PostgreSQL"],
  architectureExperience: "",
  leadershipExperience: "",
  experiences: [
    {
      id: EXP,
      role: "Tech Lead",
      company: "SecretEmployer",
      startPeriod: "2021",
      endPeriod: "Present",
      description: "Led a team of 6 engineers building a payments platform.",
      responsibilities: "",
      achievements: "Cut checkout latency by 40%.",
      measurableOutcomes: "",
      technologies: ["Node.js"],
    },
  ],
} as unknown as ProfilePublic;

const details = {
  contact: { email: "dana@example.com", phone: "+55 11 0000-0000", city: "São Paulo", country: "Brazil", linkedinUrl: "https://linkedin.com/in/dana", githubUrl: "", portfolioUrl: "" },
  education: [{ institution: "Example University", degree: "BSc", field: "Computer Science", startYear: 2010, endYear: 2014 }],
  certifications: [],
  spokenLanguages: [{ language: "English", level: "FLUENT" }],
  workAuthorization: "",
  requiresVisaSponsorship: null,
  noticePeriod: "",
  timeZone: "",
  salaryExpectation: null,
  version: 3,
  updatedAt: "2026-10-14T12:00:00Z",
} as ApplicationDetailsPublic;

function setup(modelOutput: unknown, options: { details?: ApplicationDetailsPublic | null; profile?: ProfilePublic | null } = {}) {
  const prompts: Array<{ system: string; user: string }> = [];
  const saved: Array<Record<string, unknown>> = [];
  const generator = new TailoredCvGenerator({
    careerRepo: {
      async getJob(id: string) {
        return id === JOB
          ? ({ id, companyId: "c1", title: "Senior Backend Engineer", description: "Node.js and Kubernetes.", rawDescription: "", requirements: [], technologies: [] } as never)
          : null;
      },
      async getCompany() {
        return { name: "Hiring Co" } as never;
      },
      async getProfileVersion() {
        return 7;
      },
    },
    getProfile: async () => (options.profile === undefined ? profile : options.profile),
    getApplicationDetails: async () => (options.details === undefined ? details : options.details),
    textProviders: {
      openai: {
        async generateText(input: { system: string; user: string }) {
          prompts.push(input);
          return { text: JSON.stringify(modelOutput), model: "fake" };
        },
      },
      anthropic: {} as never,
    } as never,
    defaultTextProvider: "openai",
    documents: {
      async save(input) {
        saved.push(input as never);
        return { document: { id: "d1", version: 1 } as never, created: true };
      },
    },
    renderPdf: async () => Buffer.from("%PDF-fake"),
  });
  return { generator, prompts, saved };
}

const output = {
  rationale: "Payments backend first.",
  summary: [
    { text: "Led a team of 6 engineers on a payments platform.", evidence: ["Led a team of 6 engineers"] },
    { text: "Expert in Kubernetes at scale.", evidence: ["Kubernetes at scale"] },
  ],
  experiences: [{ id: EXP, bulletIds: [`${EXP}#2`] }],
  topSkillsOrder: [],
  technologiesOrder: ["PostgreSQL"],
};

test("sends no name, contact details or employer to the model", async () => {
  const { generator, prompts } = setup(output);
  await generator.generate(JOB);
  const sent = prompts[0]!.user;
  for (const secret of ["Dana", "dana@example.com", "SecretEmployer", "São Paulo", "linkedin.com"]) {
    assert.ok(!sent.includes(secret), `prompt leaked ${secret}`);
  }
  assert.ok(sent.includes(`${EXP}#2`));
});

test("saves a grounded CV with the header from application details and the versions it used", async () => {
  const { generator, saved } = setup(output);
  await generator.generate(JOB);
  const input = saved[0]!;
  const content = input.content as TailoredCvContent;
  assert.equal(input.type, "CV");
  assert.equal(input.profileVersion, 7);
  assert.equal(input.detailsVersion, 3);
  assert.ok((input.file as { bytes: Buffer }).bytes.length > 0);
  assert.deepEqual(content.summary, ["Led a team of 6 engineers on a payments platform."]);
  assert.equal(content.droppedSummarySentences, 1);
  assert.deepEqual(content.experiences[0]!.highlights, ["Cut checkout latency by 40%."]);
  assert.equal(content.experiences[0]!.company, "SecretEmployer");
  assert.deepEqual(content.technologies, ["PostgreSQL", "Node.js"]);
  assert.deepEqual(content.gaps, ["Kubernetes"]);
  assert.equal(content.header.fullName, "Dana Example");
  assert.equal(content.header.contactLine, "dana@example.com · +55 11 0000-0000 · São Paulo, Brazil");
  assert.deepEqual(content.header.links, ["https://linkedin.com/in/dana"]);
  assert.deepEqual(content.education, ["BSc, Computer Science, Example University (2010–2014)"]);
  assert.deepEqual(content.languages, ["English (Fluent)"]);
  assert.deepEqual(content.missingDetails, []);
  assert.equal(content.job.companyName, "Hiring Co");
});

test("lists missing application details instead of failing without them", async () => {
  const { generator, saved } = setup(output, { details: null });
  await generator.generate(JOB);
  const content = saved[0]!.content as TailoredCvContent;
  assert.deepEqual(content.missingDetails, ["Application details"]);
  assert.equal(content.header.contactLine, "");
  assert.equal(saved[0]!.detailsVersion, null);
});

test("rejects an unknown job, a missing profile and malformed model output", async () => {
  await assert.rejects(setup(output).generator.generate("22222222-2222-4222-8222-222222222222"), (e: unknown) => e instanceof AppError && e.statusCode === 404);
  await assert.rejects(setup(output, { profile: null }).generator.generate(JOB), (e: unknown) => e instanceof AppError && e.statusCode === 404);
  await assert.rejects(setup({ summary: "not a list" }).generator.generate(JOB), (e: unknown) => e instanceof AppError);
});

test("the PDF renderer produces a PDF", async () => {
  const { generator, saved } = setup(output);
  await generator.generate(JOB);
  const pdf = await buildTailoredCvPdf(saved[0]!.content as TailoredCvContent);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});
