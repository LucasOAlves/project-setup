import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES, profileInputSchema, type OpportunityPublic, type PersonaPublic } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import { buildPostDraftPrompt, PostService } from "./post-service.ts";

const profile = () => ({
  ...profileInputSchema.parse({
    headline: "Staff Platform Engineer",
    currentCompany: "Nimbus",
    currentJobTitle: "Staff Engineer",
    topSkills: ["Kubernetes"],
    writingTones: ["Direct"],
    experiences: [{ role: "Staff Engineer", company: "Nimbus" }],
  }),
  id: "00000000-0000-4000-8000-000000000001",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  evidenceWarning: null,
  photos: [],
  experiences: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      role: "Staff Engineer",
      company: "Nimbus",
      startPeriod: "",
      endPeriod: "",
      description: "",
      responsibilities: "",
      achievements: "",
      technologies: ["Kubernetes"],
      measurableOutcomes: "",
    },
  ],
  writingSamples: [],
});

const persona = (): PersonaPublic => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  promptVersion: "persona.v1",
  model: "fake",
  createdAt: new Date().toISOString(),
  stale: false,
  evidenceWarning: null,
  persona: {
    positioningStatement: "A staff platform engineer.",
    coreExpertise: ["Platform engineering"],
    supportingExpertise: [],
    technologies: ["Kubernetes"],
    industries: [],
    careerNarrative: "Platform work",
    seniority: "Staff-plus",
    technicalDepth: "Hands-on",
    leadershipExposure: "None claimed",
    differentiators: [],
    proofPoints: [],
    targetAudience: "Platform leads",
    desiredPerception: "Practical",
    contentPillars: ["Reliability"],
    strongAuthorityTopics: [{ topic: "Kubernetes", evidence: "Role at Nimbus" }],
    credibleTopics: [],
    adjacentTopics: [],
    riskyTopics: [],
    professionalKeywords: ["Kubernetes"],
    businessImpactThemes: [],
    repeatedCareerPatterns: [],
  },
});

const opportunity = (): OpportunityPublic => ({
  id: "11111111-1111-4111-8111-111111111111",
  matchScore: 82,
  selected: true,
  article: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    title: "Kubernetes 1.32 released",
    description: "Release notes",
    source: "Kubernetes",
    url: "https://kubernetes.io/blog/1-32",
    publishedAt: new Date().toISOString(),
    topics: ["Kubernetes"],
  },
  payload: {
    topic: "Kubernetes 1.32",
    sourceEvent: "Kubernetes 1.32 released",
    whyItMatters: "Upgrades",
    whyItFits: "This person runs Kubernetes at Nimbus",
    audienceCare: "Platform leads",
    targetAudience: "Platform engineers",
    thesis: "Watch the scheduler",
    pointOfView: "Upgrade with a contract",
    storytellingDirection: "Event to production",
    readerTakeaway: "Measure the contract",
    credibilityRisk: "No invented fleet size",
    evidence: ["Staff Engineer at Nimbus"],
    angle: "PRODUCTION_REALITY",
  },
});

test("draft prompt includes evidence, article, and untrusted data warning", () => {
  const prompt = buildPostDraftPrompt({
    profile: profile(),
    persona: persona(),
    opportunity: opportunity(),
  });
  assert.match(prompt.user, /Staff Platform Engineer/);
  assert.match(prompt.user, /Kubernetes 1.32 released/);
  assert.match(prompt.user, /untrusted external data/);
  assert.match(prompt.system, /Never invent employers/);
});

test("refuses to write without a selected angle", async () => {
  const service = new PostService(
    { async getProfile() { return profile(); } } as never,
    { async getPersona() { return persona(); } } as never,
    { async getSelected() { return null; } } as never,
    {
      async create() {
        assert.fail("must not persist without a selected angle");
      },
    } as never,
    {
      async generateText() {
        assert.fail("must not call the model without a selected angle");
      },
    },
  );

  await assert.rejects(
    () => service.generate(),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.VALIDATION,
  );
});

test("malformed draft JSON is not persisted", async () => {
  const service = new PostService(
    { async getProfile() { return profile(); } } as never,
    { async getPersona() { return persona(); } } as never,
    { async getSelected() { return opportunity(); } } as never,
    {
      async create() {
        assert.fail("malformed draft must not be persisted");
      },
    } as never,
    {
      async generateText() {
        return { text: '{"hook":"nope"}', model: "fake" };
      },
    },
  );

  await assert.rejects(
    () => service.generate(),
    (error: unknown) =>
      error instanceof AppError && error.code === ERROR_CODES.MALFORMED_AI_OUTPUT,
  );
});
