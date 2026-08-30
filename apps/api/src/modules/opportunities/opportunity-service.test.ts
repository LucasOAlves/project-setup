import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES, profileInputSchema } from "@studio/shared";
import type { PersonaPublic, ProfilePublic } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import { buildOpportunityPrompt } from "./opportunity-service.ts";
import type { ScoredCandidate } from "./relevance.ts";
import type { TextGenerationProvider } from "../ai/text-generation-provider.ts";

const textMap = (text: TextGenerationProvider) => ({ openai: text, anthropic: text }) as const;

const profile = (): ProfilePublic => ({
  ...profileInputSchema.parse({
    headline: "Staff Platform Engineer",
    currentCompany: "Nimbus",
    topSkills: ["Kubernetes"],
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

test("prompt includes professional evidence and treats articles as data", () => {
  const candidates: ScoredCandidate[] = [
    {
      articleId: "11111111-1111-4111-8111-111111111111",
      title: "Kubernetes 1.32 released",
      description: "Release notes",
      source: "Kubernetes",
      url: "https://kubernetes.io/blog/1-32",
      publishedAt: new Date("2026-08-16"),
      overlap: 80,
      recency: 90,
      sourceQuality: 100,
      combined: 88,
    },
  ];

  const prompt = buildOpportunityPrompt({
    profile: profile(),
    persona: persona(),
    candidates,
  });

  assert.match(prompt.user, /Staff Platform Engineer/);
  assert.match(prompt.user, /Kubernetes 1.32 released/);
  assert.match(prompt.user, /untrusted external data/);
  assert.match(prompt.system, /Do not keep weak items just to reach three/);
});

test("requires discovered research before generating", async () => {
  const { OpportunityService } = await import("./opportunity-service.ts");
  let requestedSource: unknown;
  const service = new OpportunityService(
    { async getProfile() { return profile(); } } as never,
    { async getPersona() { return persona(); } } as never,
    {
      async getLatest(source: unknown) {
        requestedSource = source;
        return null;
      },
    } as never,
    {
      async create() {
        assert.fail("must not persist without research");
      },
    } as never,
    textMap({
      async generateText() {
        assert.fail("must not call the model without research");
      },
    }),
    "openai",
  );

  await assert.rejects(
    () => service.generate(),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.NOT_FOUND,
  );
  assert.equal(requestedSource, "discover");
});

test("maps malformed opportunity JSON", async () => {
  const { OpportunityService } = await import("./opportunity-service.ts");
  const service = new OpportunityService(
    { async getProfile() { return profile(); } } as never,
    { async getPersona() { return persona(); } } as never,
    {
      async getLatest() {
        return {
          run: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", queryTopics: ["Kubernetes"] },
          articles: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              title: "Kubernetes 1.32 released",
              description: "Release notes",
              source: "Kubernetes",
              url: "https://kubernetes.io/blog/1-32",
              publishedAt: new Date("2026-08-16"),
              topics: ["Kubernetes"],
            },
          ],
        };
      },
    } as never,
    {
      async create() {
        assert.fail("malformed output must not be persisted");
      },
    } as never,
    textMap({
      async generateText() {
        return { text: '{"evaluations":[{"nope":true}]}', model: "fake" };
      },
    }),
    "openai",
  );

  await assert.rejects(
    () => service.generate(),
    (error: unknown) =>
      error instanceof AppError && error.code === ERROR_CODES.MALFORMED_AI_OUTPUT,
  );
});

test("resolves the selected opportunity by most-recent selection, not by source", async () => {
  const { OpportunityService } = await import("./opportunity-service.ts");
  const set = {
    set: {
      id: "set-1",
      createdAt: new Date(),
      promptVersion: "v1",
      model: "deterministic",
      selectedOpportunityId: "opportunity-1",
    },
    rows: [
      {
        id: "opportunity-1",
        articleId: "article-1",
        matchScore: 100,
        payload: {
          topic: "Custom topic",
          sourceEvent: "",
          whyItMatters: "",
          whyItFits: "",
          audienceCare: "",
          targetAudience: "",
          thesis: "",
          pointOfView: "",
          storytellingDirection: "",
          readerTakeaway: "",
          credibilityRisk: "",
          evidence: [],
          angle: "EDUCATIONAL",
        },
      },
    ],
    articles: [
      {
        id: "article-1",
        title: "Custom topic",
        description: "",
        source: "Custom topic",
        url: "https://app.local/x",
        publishedAt: new Date(),
        topics: [],
      },
    ],
  };

  const service = new OpportunityService(
    { async getProfile() { return profile(); } } as never,
    { async getPersona() { return persona(); } } as never,
    { async getLatest() { assert.fail("must not use source-scoped latest"); } } as never,
    {
      async getMostRecentlySelected() {
        return set;
      },
    } as never,
    textMap({ async generateText() { assert.fail("must not call the model"); } }),
    "openai",
  );

  const selected = await service.getSelected();
  assert.equal(selected?.id, "opportunity-1");
});
