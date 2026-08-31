import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES, profileInputSchema, type ContentPlanTopic } from "@studio/shared";
import type { PersonaPublic, ProfilePublic } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import type { TextGenerationProvider } from "../ai/text-generation-provider.ts";
import { ContentPlanService } from "./content-plan-service.ts";
import { PLAN_TOPICS } from "./plan-data.ts";

const textMap = (text: TextGenerationProvider) => ({ openai: text, anthropic: text }) as const;
const noTextCalls: TextGenerationProvider = {
  async generateText() {
    assert.fail("must not call the model");
  },
};

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

function buildService(overrides?: {
  hasPersona?: boolean;
  activeTopics?: ContentPlanTopic[] | null;
  text?: TextGenerationProvider;
}) {
  let createdOpportunity: { articleId: string; matchScore: number; payload: unknown } | null =
    null;
  const upserted: Array<{ topicId: string; status: string; contentOpportunityId?: string | null }> =
    [];
  const sources: { research?: unknown; opportunities?: unknown; select?: unknown } = {};
  const savedUploads: Array<{ topics: unknown; sourceFilename: string }> = [];

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
      async getActiveTopics() {
        return overrides?.activeTopics ?? null;
      },
      async saveUpload(topics: unknown, sourceFilename: string) {
        savedUploads.push({ topics, sourceFilename });
      },
    } as never,
    textMap(overrides?.text ?? noTextCalls),
    "openai",
  );

  return {
    service,
    getCreatedOpportunity: () => createdOpportunity,
    upserted,
    sources,
    savedUploads,
  };
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

function uploadedTopic(id: string): ContentPlanTopic {
  return {
    id,
    week: 1,
    date: "2026-01-05",
    title: "Uploaded topic",
    format: "NARRATIVE",
    priority: 90,
    pillar: "Uploaded pillar",
    pillarValue: "Signals uploaded authority.",
    objective: "Give readers something uploaded.",
    hook: "An uploaded hook.",
    keyPoints: ["Uploaded point one"],
    cta: "What would you add?",
    evidenceNote: "Backed by the uploaded document.",
    confidentiality: "No proprietary detail.",
    sources: [
      { id: "S01", author: "Uploaded author", title: "Uploaded source", url: "https://example.com/uploaded" },
    ],
  };
}

async function buildTestPdf(text: string): Promise<Buffer> {
  const { default: PDFDocument } = await import("pdfkit");
  const doc = new PDFDocument();
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  doc.text(text);
  doc.end();
  return done;
}

test("list falls back to the example plan when nothing has been uploaded", async () => {
  const { service } = buildService({ activeTopics: null });
  const topics = await service.list();
  assert.equal(topics.length, PLAN_TOPICS.length);
  assert.equal(topics[0]?.id, PLAN_TOPICS[0]?.id);
});

test("list reads the uploaded plan once one has been saved", async () => {
  const uploaded = [uploadedTopic("T01")];
  const { service } = buildService({ activeTopics: uploaded });
  const topics = await service.list();
  assert.equal(topics.length, 1);
  assert.equal(topics[0]?.title, "Uploaded topic");
});

test("selectTopic resolves against the uploaded plan when one is active", async () => {
  const uploaded = [uploadedTopic("U01")];
  const { service } = buildService({ activeTopics: uploaded });
  const result = await service.selectTopic("U01");
  assert.equal(result.selectedOpportunityId, "opportunity-1");
});

test("extractFromDocument parses the PDF and validates the model's structured output", async () => {
  const pdfBytes = await buildTestPdf("Week 1: Uploaded topic");
  const { service } = buildService({
    text: {
      async generateText() {
        return {
          text: JSON.stringify({ topics: [uploadedTopic("T01")] }),
          model: "test-model",
        };
      },
    },
  });

  const topics = await service.extractFromDocument(pdfBytes);
  assert.equal(topics.length, 1);
  assert.equal(topics[0]?.title, "Uploaded topic");
});

test("extractFromDocument clamps an out-of-range priority instead of rejecting the batch", async () => {
  const pdfBytes = await buildTestPdf("Week 1: Uploaded topic");
  const { service } = buildService({
    text: {
      async generateText() {
        return {
          text: JSON.stringify({ topics: [{ ...uploadedTopic("T01"), priority: 105 }] }),
          model: "test-model",
        };
      },
    },
  });

  const topics = await service.extractFromDocument(pdfBytes);
  assert.equal(topics[0]?.priority, 100);
});

test("extractFromDocument rejects a model response that fails the schema", async () => {
  const pdfBytes = await buildTestPdf("Week 1: Uploaded topic");
  const { service } = buildService({
    text: {
      async generateText() {
        return { text: JSON.stringify({ topics: [{ id: "T01" }] }), model: "test-model" };
      },
    },
  });

  await assert.rejects(() => service.extractFromDocument(pdfBytes));
});

test("saveUploadedTopics rejects an invalid payload without persisting", async () => {
  const { service, savedUploads } = buildService();
  await assert.rejects(() => service.saveUploadedTopics([{ id: "T01" }], "plan.pdf"));
  assert.equal(savedUploads.length, 0);
});

test("saveUploadedTopics persists a valid payload and list reflects it", async () => {
  const { service, savedUploads } = buildService({ activeTopics: [uploadedTopic("T01")] });
  const topics = await service.saveUploadedTopics([uploadedTopic("T01")], "plan.pdf");
  assert.equal(savedUploads.length, 1);
  assert.equal(savedUploads[0]?.sourceFilename, "plan.pdf");
  assert.equal(topics.length, 1);
  assert.equal(topics[0]?.title, "Uploaded topic");
});
