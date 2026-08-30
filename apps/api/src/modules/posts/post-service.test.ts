import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES, profileInputSchema, type OpportunityPublic, type PersonaPublic } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import { buildPostDraftPrompt, PostService } from "./post-service.ts";
import type { TextGenerationProvider } from "../ai/text-generation-provider.ts";

const textMap = (text: TextGenerationProvider) => ({ openai: text, anthropic: text }) as const;

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

test("reviewSectionComments requires a saved profile", async () => {
  const service = new PostService(
    { async getProfile() { return null; } } as never,
    {} as never,
    {} as never,
    {} as never,
    textMap({
      async generateText() {
        assert.fail("must not call the model without a profile");
      },
    }),
    "openai",
  );

  await assert.rejects(
    () => service.reviewSectionComments([{ excerpt: "Old hook.", comment: "Less direct." }]),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.NOT_FOUND,
  );
});

test("reviewSectionComments returns the model's per-comment classification", async () => {
  const service = new PostService(
    { async getProfile() { return profile(); } } as never,
    {} as never,
    {} as never,
    {} as never,
    textMap({
      async generateText() {
        return {
          text: JSON.stringify({
            reviews: [
              { index: 0, hasNewExperience: false },
              {
                index: 1,
                hasNewExperience: true,
                draftExperience: {
                  role: "",
                  company: "",
                  startPeriod: "",
                  endPeriod: "",
                  description: "Migrating an undocumented legacy system.",
                  responsibilities: "",
                  achievements: "",
                  technologies: [],
                  measurableOutcomes: "",
                },
              },
            ],
          }),
          model: "fake",
        };
      },
    }),
    "openai",
  );

  const reviews = await service.reviewSectionComments([
    { excerpt: "Start with Crucially.", comment: "Add the word Crucially at the start." },
    { excerpt: "On one engagement...", comment: "Use my current legacy migration project instead." },
  ]);

  assert.equal(reviews.length, 2);
  assert.equal(reviews[0]?.hasNewExperience, false);
  assert.equal(reviews[1]?.hasNewExperience, true);
  assert.equal(
    reviews[1]?.draftExperience?.description,
    "Migrating an undocumented legacy system.",
  );
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
    textMap({
      async generateText() {
        assert.fail("must not call the model without a selected angle");
      },
    }),
    "openai",
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
    textMap({
      async generateText() {
        return { text: '{"hook":"nope"}', model: "fake" };
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

function opportunityWithId(id: string): OpportunityPublic {
  return { ...opportunity(), id };
}

test("generate uses an explicit opportunityId instead of the globally selected one", async () => {
  let receivedId: string | undefined;
  const namedOpportunity = opportunityWithId("22222222-2222-4222-8222-222222222222");
  const service = new PostService(
    { async getProfile() { return profile(); } } as never,
    { async getPersona() { return persona(); } } as never,
    {
      async getById(id: string) {
        receivedId = id;
        return namedOpportunity;
      },
      async getSelected() {
        assert.fail("must not fall back to the selected opportunity when an id is given");
      },
    } as never,
    {
      async create(input: { opportunityId: string }) {
        return { ...input, id: "post-1", createdAt: new Date() } as never;
      },
    } as never,
    textMap({
      async generateText() {
        return {
          text: JSON.stringify({
            storyStrategy: {
              structure: "s",
              hookApproach: "h",
              narrativeArc: "n",
              evidenceToUse: ["Staff Engineer at Nimbus"],
              claimsToAvoid: [],
              takeaway: "t",
            },
            hook: "Hook",
            body: "Body",
            writingReview: { summary: "s", revisedSections: [], remainingRisks: [] },
            factReview: { summary: "s", claims: [], unsupportedClaims: [] },
            seoReview: { summary: "s", keywordsUsed: [], stuffingRisk: "low" },
            quality: { score: 80, explanation: "e", strengths: [], improvements: [] },
          }),
          model: "fake",
        };
      },
    }),
    "openai",
  );

  await service.generate(namedOpportunity.id);
  assert.equal(receivedId, namedOpportunity.id);
});

test("edit with a postId grounds the write context on that post's own opportunity, not the latest post's", async () => {
  const historicalOpportunity = opportunityWithId("33333333-3333-4333-8333-333333333333");
  const historicalPost = buildRow({ id: "historical-post", opportunityId: historicalOpportunity.id });

  let requestedOpportunityId: string | undefined;
  const service = new PostService(
    { async getProfile() { return profile(); } } as never,
    { async getPersona() { return persona(); } } as never,
    {
      async getById(id: string) {
        requestedOpportunityId = id;
        return historicalOpportunity;
      },
      async getSelected() {
        assert.fail("edit() must not fall back to the selected opportunity when postId is given");
      },
    } as never,
    {
      async getLatest() {
        assert.fail("must not read the latest post when an explicit postId is given");
      },
      async getById(id: string) {
        return id === historicalPost.id ? historicalPost : null;
      },
      async create(input: { opportunityId: string }) {
        return { ...historicalPost, ...input, id: "new-revision" };
      },
    } as never,
    textMap({
      async generateText(request: { system: string }) {
        if (request.system.includes("editor")) {
          return {
            text: JSON.stringify({
              hook: "New hook",
              body: "New body",
              writingReview: { summary: "s", revisedSections: [], remainingRisks: [] },
              factReview: { summary: "s", claims: [], unsupportedClaims: [] },
              seoReview: { summary: "s", keywordsUsed: [], stuffingRisk: "low" },
              quality: { score: 80, explanation: "e", strengths: [], improvements: [] },
            }),
            model: "fake",
          };
        }
        return { text: JSON.stringify({ hook: "New hook", body: "New body" }), model: "fake" };
      },
    }),
    "openai",
  );

  await service.edit({ action: "HOOK", postId: historicalPost.id });
  assert.equal(requestedOpportunityId, historicalOpportunity.id);
});

function buildRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "ccccccccc-cccc-4ccc-8ccc-cccccccccccc",
    profileId: "00000000-0000-4000-8000-000000000001",
    opportunityId: opportunity().id,
    promptVersion: "post.v1",
    model: "fake",
    tone: "Direct",
    angle: "PRODUCTION_REALITY",
    hook: "Hook",
    body: "Body",
    storyStrategy: {
      structure: "s",
      hookApproach: "h",
      narrativeArc: "n",
      evidenceToUse: ["e"],
      claimsToAvoid: [],
      takeaway: "t",
    },
    writingReview: { summary: "s", revisedSections: [], remainingRisks: [] },
    factReview: { summary: "s", claims: [], unsupportedClaims: [] },
    seoReview: { summary: "s", keywordsUsed: [], stuffingRisk: "low" },
    quality: { score: 80, explanation: "e", strengths: [], improvements: [] },
    status: "DRAFT",
    publishedAt: null,
    outcome: null,
    outcomeNotes: null,
    createdAt: new Date(),
    ...overrides,
  };
}

test("updateTracking rejects an unknown post id", async () => {
  const service = new PostService(
    {} as never,
    {} as never,
    { async getById() { return opportunity(); } } as never,
    { async getById() { return null; } } as never,
    {} as never,
  );

  await assert.rejects(
    () => service.updateTracking("missing", { status: "PUBLISHED" }),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.NOT_FOUND,
  );
});

test("updateTracking stamps publishedAt on publish and clears it back on draft", async () => {
  let stored = buildRow();
  const service = new PostService(
    {} as never,
    {} as never,
    { async getById() { return opportunity(); } } as never,
    {
      async getById() { return stored; },
      async updateTracking(_id: string, patch: Record<string, unknown>) {
        stored = { ...stored, ...patch };
        return stored;
      },
    } as never,
    {} as never,
  );

  const published = await service.updateTracking(stored.id, { status: "PUBLISHED" });
  assert.equal(published.status, "PUBLISHED");
  assert.ok(published.publishedAt);

  const backToDraft = await service.updateTracking(stored.id, { status: "DRAFT" });
  assert.equal(backToDraft.status, "DRAFT");
  assert.equal(backToDraft.publishedAt, null);
});

test("updateTracking passes outcome and notes through untouched when status is omitted", async () => {
  const stored = buildRow({ status: "PUBLISHED", publishedAt: new Date("2026-01-01") });
  const service = new PostService(
    {} as never,
    {} as never,
    { async getById() { return opportunity(); } } as never,
    {
      async getById() { return stored; },
      async updateTracking(_id: string, patch: Record<string, unknown>) {
        return { ...stored, ...patch };
      },
    } as never,
    {} as never,
  );

  const result = await service.updateTracking(stored.id, {
    outcome: "GOOD",
    outcomeNotes: "Strong engagement",
  });
  assert.equal(result.status, "PUBLISHED");
  assert.equal(result.publishedAt, stored.publishedAt.toISOString());
  assert.equal(result.outcome, "GOOD");
  assert.equal(result.outcomeNotes, "Strong engagement");
});

test("list forwards the query to the repository and returns the paginated shape", async () => {
  const rows = [buildRow(), buildRow({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" })];
  let receivedQuery: unknown;
  const service = new PostService(
    {} as never,
    {} as never,
    { async getById() { return opportunity(); } } as never,
    {
      async listAll(query: unknown) {
        receivedQuery = query;
        return { rows, total: 2 };
      },
    } as never,
    {} as never,
  );

  const query = {
    page: 1,
    pageSize: 10,
    q: "checklist",
    sortBy: "score" as const,
    sortDir: "desc" as const,
  };
  const result = await service.list(query);

  assert.deepEqual(receivedQuery, query);
  assert.equal(result.posts.length, 2);
  assert.equal(result.total, 2);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 10);
});

test("list forwards an opportunityId filter so History can be scoped to one topic", async () => {
  const rows = [buildRow()];
  let receivedQuery: unknown;
  const service = new PostService(
    {} as never,
    {} as never,
    { async getById() { return opportunity(); } } as never,
    {
      async listAll(query: unknown) {
        receivedQuery = query;
        return { rows, total: 1 };
      },
    } as never,
    {} as never,
  );

  const query = {
    page: 1,
    pageSize: 10,
    sortBy: "createdAt" as const,
    sortDir: "desc" as const,
    opportunityId: opportunity().id,
  };
  const result = await service.list(query);

  assert.deepEqual(receivedQuery, query);
  assert.equal(result.posts.length, 1);
});
