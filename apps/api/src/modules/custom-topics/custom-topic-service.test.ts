import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES, profileInputSchema } from "@studio/shared";
import type { PersonaPublic, ProfilePublic } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import { CustomTopicService } from "./custom-topic-service.ts";

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

function customTopicRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "topic-1",
    title: "Why we stopped trusting green CI badges",
    hook: "A green pipeline is not the same thing as a correct deploy.",
    objective: "",
    keyPoints: ["Coverage is not correctness", "Flaky tests hide real failures"],
    cta: "",
    angle: "CONTRARIAN",
    pillar: "",
    sourceUrl: null,
    status: "PLANNED",
    contentOpportunityId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function buildService(overrides?: { hasPersona?: boolean; row?: ReturnType<typeof customTopicRow> | null }) {
  let createdOpportunity: { articleId: string; matchScore: number; payload: unknown } | null =
    null;
  const upserted: Array<{ id: string; status: string; contentOpportunityId?: string | null }> = [];
  const sources: { research?: unknown; opportunities?: unknown; select?: unknown } = {};
  const row = overrides?.row === undefined ? customTopicRow() : overrides.row;

  const service = new CustomTopicService(
    { async getProfile() { return profile(); } } as never,
    {
      async getPersona() {
        return overrides?.hasPersona === false ? null : persona();
      },
    } as never,
    {
      async create(input: { articles: Array<{ id?: string }>; source?: unknown }) {
        sources.research = input.source;
        return {
          run: { id: "run-1" },
          articles: input.articles.map((article, index) => ({
            ...article,
            id: `article-${index}`,
          })),
        };
      },
    } as never,
    {
      async create(input: {
        opportunities: Array<{ articleId: string; matchScore: number; payload: unknown }>;
        source?: unknown;
      }) {
        createdOpportunity = input.opportunities[0] ?? null;
        sources.opportunities = input.source;
        return { rows: [{ id: "opportunity-1" }] };
      },
    } as never,
    {
      async select(opportunityId: string, source?: unknown) {
        sources.select = source;
        return {
          id: "set-1",
          createdAt: new Date().toISOString(),
          promptVersion: "custom-topic.v1",
          model: "deterministic",
          emptyReason: null,
          selectedOpportunityId: opportunityId,
          opportunities: [],
        };
      },
    } as never,
    {
      async getById() {
        return row;
      },
      async updateStatus(id: string, patch: { status: string; contentOpportunityId?: string | null }) {
        upserted.push({ id, ...patch });
        return {} as never;
      },
      async list() {
        return row ? [row] : [];
      },
    } as never,
  );

  return { service, getCreatedOpportunity: () => createdOpportunity, upserted, sources };
}

test("rejects an unknown topic id", async () => {
  const { service } = buildService({ row: null });
  await assert.rejects(
    () => service.selectTopic("missing"),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.NOT_FOUND,
  );
});

test("requires a persona before selecting a topic", async () => {
  const { service } = buildService({ hasPersona: false });
  await assert.rejects(
    () => service.selectTopic("topic-1"),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.NOT_FOUND,
  );
});

test("grounds the opportunity in the topic's own key points and angle, tagged as a custom source", async () => {
  const { service, getCreatedOpportunity, upserted, sources } = buildService();
  const result = await service.selectTopic("topic-1");

  const created = getCreatedOpportunity();
  assert.ok(created);
  const payload = created.payload as { evidence: string[]; angle: string };
  assert.deepEqual(payload.evidence, ["Coverage is not correctness", "Flaky tests hide real failures"]);
  assert.equal(payload.angle, "CONTRARIAN");

  assert.equal(result.selectedOpportunityId, "opportunity-1");
  assert.equal(upserted[0]?.status, "SELECTED");
  assert.equal(upserted[0]?.id, "topic-1");

  assert.equal(sources.research, "custom");
  assert.equal(sources.opportunities, "custom");
  assert.equal(sources.select, "custom");
});
