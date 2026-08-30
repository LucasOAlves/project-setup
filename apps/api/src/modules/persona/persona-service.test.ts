import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES, profileInputSchema } from "@studio/shared";
import type { PersonaPayload } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import type { TextGenerationProvider } from "../ai/text-generation-provider.ts";
import { groundPersona } from "./ground-persona.ts";
import { PersonaService, buildPersonaPrompt } from "./persona-service.ts";

const textMap = (text: TextGenerationProvider) => ({ openai: text, anthropic: text }) as const;

const validPersona = (): PersonaPayload => ({
  positioningStatement: "A staff platform engineer who keeps production boring.",
  coreExpertise: ["Platform engineering"],
  supportingExpertise: ["Kubernetes"],
  technologies: ["Kubernetes", "AWS"],
  industries: ["SaaS"],
  careerNarrative: "Built internal platforms at Nimbus.",
  seniority: "Staff-plus",
  technicalDepth: "Hands-on platform and reliability work.",
  leadershipExposure: "Technical leadership without people-manager evidence.",
  differentiators: ["Production-first platform thinking"],
  proofPoints: [
    {
      claim: "Staff platform work at Nimbus",
      evidence: "Current role Staff Engineer at Nimbus",
    },
  ],
  targetAudience: "Engineering leaders",
  desiredPerception: "Practical authority",
  contentPillars: ["Platform", "Reliability"],
  strongAuthorityTopics: [
    { topic: "Kubernetes platform design", evidence: "Skill Kubernetes and Staff role" },
    { topic: "Invented quantum computing", evidence: "none" },
  ],
  credibleTopics: [],
  adjacentTopics: [],
  riskyTopics: [],
  professionalKeywords: ["Kubernetes"],
  businessImpactThemes: ["Reduce operational toil"],
  repeatedCareerPatterns: ["Platform ownership"],
});

test("prompt context includes profile evidence, not photos", () => {
  const profile = {
    ...profileInputSchema.parse({
      fullName: "Alex Silva",
      headline: "Staff Platform Engineer",
      currentCompany: "Nimbus",
      topSkills: ["Kubernetes"],
      experiences: [{ role: "Staff Engineer", company: "Nimbus" }],
    }),
    id: "00000000-0000-4000-8000-000000000001",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    evidenceWarning: null,
    photos: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        mimeType: "image/png",
        sizeBytes: 12,
        url: "/api/profile/photos/secret",
        createdAt: new Date().toISOString(),
      },
    ],
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
        technologies: [],
        measurableOutcomes: "",
      },
    ],
    writingSamples: [],
  };

  const prompt = buildPersonaPrompt(profile);
  assert.match(prompt.user, /Staff Platform Engineer/);
  assert.match(prompt.user, /Nimbus/);
  assert.match(prompt.user, /Kubernetes/);
  assert.doesNotMatch(prompt.user, /secret/);
});

test("malformed model output is not treated as a persona", async () => {
  const text: TextGenerationProvider = {
    async generateText() {
      return { text: '{"nope":true}', model: "fake" };
    },
  };
  const service = new PersonaService(
    {
      async getProfile() {
        return {
          ...profileInputSchema.parse({ headline: "Engineer", topSkills: ["Go"] }),
          id: "00000000-0000-4000-8000-000000000001",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          evidenceWarning: null,
          photos: [],
          experiences: [],
          writingSamples: [],
        };
      },
    } as never,
    {
      async insert() {
        assert.fail("malformed output must not be persisted");
      },
      async getLatest() {
        return null;
      },
    } as never,
    textMap(text),
    "openai",
  );

  await assert.rejects(
    () => service.generatePersona(),
    (error: unknown) =>
      error instanceof AppError && error.code === ERROR_CODES.MALFORMED_AI_OUTPUT,
  );
});

test("provider failure is retryable and not persisted", async () => {
  const service = new PersonaService(
    {
      async getProfile() {
        return {
          ...profileInputSchema.parse({ headline: "Engineer", topSkills: ["Go"] }),
          id: "00000000-0000-4000-8000-000000000001",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          evidenceWarning: null,
          photos: [],
          experiences: [],
          writingSamples: [],
        };
      },
    } as never,
    {
      async insert() {
        assert.fail("provider failure must not be persisted");
      },
      async getLatest() {
        return null;
      },
    } as never,
    textMap({
      async generateText() {
        throw new AppError(ERROR_CODES.PROVIDER_UNAVAILABLE, "down", 503);
      },
    }),
    "openai",
  );

  await assert.rejects(
    () => service.generatePersona(),
    (error: unknown) =>
      error instanceof AppError && error.code === ERROR_CODES.PROVIDER_UNAVAILABLE,
  );
});

test("thin profiles demote strong authority topics", () => {
  const empty = profileInputSchema.parse({});
  const grounded = groundPersona(validPersona(), empty);
  assert.equal(grounded.strongAuthorityTopics.length, 0);
  assert.ok(grounded.adjacentTopics.length >= 2);
});
