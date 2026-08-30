import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES, profileInputSchema } from "@studio/shared";
import type { PersonaPublic, PostPublic, ProfilePublic } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import { ImageService } from "./image-service.ts";

const profile = (): ProfilePublic => ({
  ...profileInputSchema.parse({
    headline: "Staff Platform Engineer",
    currentCompany: "Nimbus",
  }),
  id: "00000000-0000-4000-8000-000000000001",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  evidenceWarning: null,
  photos: [],
  experiences: [],
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
    strongAuthorityTopics: [],
    credibleTopics: [],
    adjacentTopics: [],
    riskyTopics: [],
    professionalKeywords: ["Kubernetes"],
    businessImpactThemes: [],
    repeatedCareerPatterns: [],
  },
});

const SECRET_BODY = "This exact sentence must never reach the image prompt call.";

const post = (): PostPublic => ({
  id: "post-1",
  createdAt: new Date().toISOString(),
  promptVersion: "post.v1",
  model: "fake",
  tone: "Direct",
  angle: "EDUCATIONAL",
  opportunityId: "opp-1",
  sourceTitle: "Migration checklists",
  sourceUrl: "https://example.com",
  hook: "Hook",
  body: SECRET_BODY,
  storyStrategy: {
    structure: "checklist",
    hookApproach: "h",
    narrativeArc: "n",
    evidenceToUse: ["e"],
    claimsToAvoid: [],
    takeaway: "Name the contract before moving data.",
  },
  writingReview: { summary: "s", revisedSections: [], remainingRisks: [] },
  factReview: { summary: "s", claims: [], unsupportedClaims: [] },
  seoReview: { summary: "s", keywordsUsed: [], stuffingRisk: "low" },
  quality: { score: 80, explanation: "e", strengths: [], improvements: [] },
  status: "DRAFT",
  publishedAt: null,
  outcome: null,
  outcomeNotes: null,
});

const validBriefJson = JSON.stringify({
  visualConcept: "An abstract data pipeline rendered as clean architectural lines.",
  style: "editorial illustration",
  composition: "centered, wide negative space",
  colorPalette: "cool blues and warm accent",
  avoid: ["text", "logos"],
  imagePrompt: "A minimalist editorial illustration of data flowing through clean boundaries.",
});

function buildService(overrides?: {
  generateText?: (request: { system: string; user: string }) => Promise<{ text: string; model: string }>;
  generateImage?: () => Promise<{ bytes: Buffer; mimeType: string; model: string }>;
}) {
  const created: Array<Record<string, unknown>> = [];
  const service = new ImageService(
    { async getProfile() { return profile(); } } as never,
    { async getPersona() { return persona(); } } as never,
    {
      async getById() { return post(); },
      async getLatest() { return post(); },
    } as never,
    {
      openai: {
        async generateText(request: { system: string; user: string }) {
          if (overrides?.generateText) {
            return overrides.generateText(request);
          }
          return { text: validBriefJson, model: "fake-text-model" };
        },
      },
      anthropic: {
        async generateText(request: { system: string; user: string }) {
          if (overrides?.generateText) {
            return overrides.generateText(request);
          }
          return { text: validBriefJson, model: "fake-text-model" };
        },
      },
    },
    "openai",
    {
      openai: {
        async generateImage() {
          if (overrides?.generateImage) {
            return overrides.generateImage();
          }
          return { bytes: Buffer.from("fake-bytes"), mimeType: "image/png", model: "fake-image-model" };
        },
      },
      pollinations: {
        async generateImage() {
          if (overrides?.generateImage) {
            return overrides.generateImage();
          }
          return { bytes: Buffer.from("fake-bytes"), mimeType: "image/png", model: "fake-image-model" };
        },
      },
    },
    "openai",
    {
      async put(input: { bytes: Buffer; mimeType: string; extension: string }) {
        return { key: `stored.${input.extension}` };
      },
      async get() { return null; },
      async delete() {},
    } as never,
    {
      async create(input: Record<string, unknown>) {
        created.push(input);
        return {
          id: "image-1",
          postId: input.postId,
          briefPayload: input.briefPayload,
          prompt: input.prompt,
          storageKey: input.storageKey,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          model: input.model,
          promptVersion: input.promptVersion,
          createdAt: new Date(),
        };
      },
    } as never,
  );
  return { service, getCreated: () => created };
}

test("the image brief prompt never contains the post's raw body", async () => {
  let capturedUser = "";
  const { service } = buildService({
    generateText: async (request) => {
      capturedUser = request.user;
      return { text: validBriefJson, model: "fake-text-model" };
    },
  });

  await service.generate("post-1");
  assert.equal(capturedUser.includes(SECRET_BODY), false);
});

test("persists a generated image grounded in the brief", async () => {
  const { service, getCreated } = buildService();
  const image = await service.generate("post-1");

  assert.equal(image.postId, "post-1");
  assert.equal(image.url, "/api/images/image-1");
  const created = getCreated();
  assert.equal(created.length, 1);
  assert.equal(
    (created[0]?.briefPayload as { imagePrompt: string }).imagePrompt,
    "A minimalist editorial illustration of data flowing through clean boundaries.",
  );
});

test("malformed brief JSON is not persisted", async () => {
  const { service, getCreated } = buildService({
    generateText: async () => ({ text: '{"nope":true}', model: "fake" }),
  });

  await assert.rejects(
    () => service.generate("post-1"),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.MALFORMED_AI_OUTPUT,
  );
  assert.equal(getCreated().length, 0);
});

test("rejects generating an image without a post to attach it to", async () => {
  const service = new ImageService(
    {} as never,
    {} as never,
    { async getById() { return null; }, async getLatest() { return null; } } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () => service.generate("missing-post"),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.NOT_FOUND,
  );
});
