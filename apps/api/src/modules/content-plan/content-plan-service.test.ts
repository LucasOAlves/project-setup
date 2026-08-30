import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES, profileInputSchema } from "@studio/shared";
import type { PersonaPublic, ProfilePublic } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import { ContentPlanService } from "./content-plan-service.ts";
import { PLAN_TOPICS } from "./plan-data.ts";

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

function buildService(overrides?: { hasPersona?: boolean }) {
  let createdOpportunity: { articleId: string; matchScore: number; payload: unknown } | null =
    null;
  const upserted: Array<{ topicId: string; status: string; contentOpportunityId?: string | null }> =
    [];
  const sources: { research?: unknown; opportunities?: unknown; select?: unknown } = {};

  const service = new ContentPlanService(
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
          promptVersion: "content-plan.v1",
          model: "deterministic",
          emptyReason: null,
          selectedOpportunityId: opportunityId,
          opportunities: [],
        };
      },
    } as never,
    {
      async listStatuses() {
        return new Map();
      },
      async upsertStatus(
        topicId: string,
        patch: { status: string; contentOpportunityId?: string | null },
      ) {
        upserted.push({ topicId, ...patch });
        return {} as never;
      },
    } as never,
  );

  return { service, getCreatedOpportunity: () => createdOpportunity, upserted, sources };
}

test("rejects unknown topic ids", async () => {
  const { service } = buildService();
  await assert.rejects(
    () => service.selectTopic("T99"),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.NOT_FOUND,
  );
});

test("requires a persona before selecting a topic", async () => {
  const { service } = buildService({ hasPersona: false });
  await assert.rejects(
    () => service.selectTopic("T01"),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.NOT_FOUND,
  );
});

test("grounds the opportunity in the brief's key points and never uses an experience-driven angle", async () => {
  const { service, getCreatedOpportunity, upserted, sources } = buildService();
  const result = await service.selectTopic("T01");

  const topic = PLAN_TOPICS.find((item) => item.id === "T01");
  assert.ok(topic);

  const created = getCreatedOpportunity();
  assert.ok(created);
  const payload = created.payload as { evidence: string[]; angle: string };
  assert.deepEqual(payload.evidence, topic.keyPoints);
  assert.notEqual(payload.angle, "EXPERIENCE_DRIVEN");

  assert.equal(result.selectedOpportunityId, "opportunity-1");
  assert.equal(upserted[0]?.status, "SELECTED");
  assert.equal(upserted[0]?.topicId, "T01");

  assert.equal(sources.research, "content_plan");
  assert.equal(sources.opportunities, "content_plan");
  assert.equal(sources.select, "content_plan");
});
