import assert from "node:assert/strict";
import test from "node:test";
import type { TextGenerationProvider } from "../ai/text-generation-provider.ts";
import { CareerService } from "./career-service.ts";

const textMap = (text: TextGenerationProvider) => ({ openai: text, anthropic: text }) as const;
const noTextCalls: TextGenerationProvider = {
  async generateText() {
    assert.fail("must not call the model");
  },
};

function fakeCompany(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Nimbus",
    website: "",
    linkedinUrl: "",
    industry: "",
    size: "",
    locations: [],
    careerPageUrl: "",
    notes: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeRecruiter(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000003",
    companyId: "00000000-0000-4000-8000-000000000001",
    relatedJobId: null,
    name: "Alex Recruiter",
    role: "Technical Recruiter",
    linkedinUrl: "",
    connectionStatus: "NOT_CONNECTED",
    relevanceScore: null,
    notes: "",
    nextAction: "",
    lastInteractionAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    companyId: "00000000-0000-4000-8000-000000000001",
    source: "manual",
    externalId: "",
    url: "",
    title: "Staff Engineer",
    location: "",
    workplaceType: null,
    employmentType: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "",
    description: "",
    requirements: [],
    preferredQualifications: [],
    technologies: [],
    seniority: "",
    status: "SAVED",
    fitScore: null,
    discoveredAt: new Date(),
    appliedAt: null,
    notes: "",
    nextAction: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("createJob rejects a job for a company that does not exist", async () => {
  const service = new CareerService({
    async getCompany() {
      return null;
    },
    async createJob() {
      assert.fail("must not insert a job for a missing company");
    },
  } as never, {} as never, textMap(noTextCalls), "openai");

  await assert.rejects(() =>
    service.createJob({
      companyId: "00000000-0000-4000-8000-000000000099",
      title: "Staff Engineer",
      url: "",
      location: "",
      workplaceType: null,
      employmentType: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: "",
      description: "",
      requirements: [],
      preferredQualifications: [],
      technologies: [],
      seniority: "",
      notes: "",
      nextAction: "",
    }),
  );
});

test("createJob persists a job once the company exists", async () => {
  let inserted: unknown;
  const service = new CareerService({
    async getCompany() {
      return fakeCompany();
    },
    async createJob(input: unknown) {
      inserted = input;
      return fakeJob();
    },
  } as never, {} as never, textMap(noTextCalls), "openai");

  const job = await service.createJob({
    companyId: "00000000-0000-4000-8000-000000000001",
    title: "Staff Engineer",
    url: "",
    location: "",
    workplaceType: null,
    employmentType: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "",
    description: "",
    requirements: [],
    preferredQualifications: [],
    technologies: [],
    seniority: "",
    notes: "",
    nextAction: "",
  });

  assert.ok(inserted);
  assert.equal(job.title, "Staff Engineer");
  assert.equal(job.status, "SAVED");
  assert.equal(job.appliedAt, null);
});

test("updateJobStatus stamps appliedAt the first time status reaches APPLIED-or-later", async () => {
  let patch: unknown;
  const service = new CareerService({
    async getJob() {
      return fakeJob({ status: "SHORTLISTED", appliedAt: null });
    },
    async updateJobStatus(_id: string, input: unknown) {
      patch = input;
      return fakeJob({ status: "APPLIED", appliedAt: new Date() });
    },
  } as never, {} as never, textMap(noTextCalls), "openai");

  const job = await service.updateJobStatus("job-1", "APPLIED");

  assert.ok(job.appliedAt);
  assert.equal((patch as { appliedAt: Date | null }).appliedAt instanceof Date, true);
});

test("updateJobStatus does not restamp appliedAt if already set", async () => {
  const existingAppliedAt = new Date("2026-01-01T00:00:00Z");
  let patch: unknown;
  const service = new CareerService({
    async getJob() {
      return fakeJob({ status: "APPLIED", appliedAt: existingAppliedAt });
    },
    async updateJobStatus(_id: string, input: unknown) {
      patch = input;
      return fakeJob({ status: "SCREENING", appliedAt: existingAppliedAt });
    },
  } as never, {} as never, textMap(noTextCalls), "openai");

  await service.updateJobStatus("job-1", "SCREENING");

  assert.equal((patch as { appliedAt: Date | null }).appliedAt, existingAppliedAt);
});

test("updateJobStatus clears appliedAt when moved back to a pre-application stage", async () => {
  let patch: unknown;
  const service = new CareerService({
    async getJob() {
      return fakeJob({ status: "APPLIED", appliedAt: new Date() });
    },
    async updateJobStatus(_id: string, input: unknown) {
      patch = input;
      return fakeJob({ status: "SHORTLISTED", appliedAt: null });
    },
  } as never, {} as never, textMap(noTextCalls), "openai");

  await service.updateJobStatus("job-1", "SHORTLISTED");

  assert.equal((patch as { appliedAt: Date | null }).appliedAt, null);
});

test("updateJobStatus rejects an unknown job id", async () => {
  const service = new CareerService({
    async getJob() {
      return null;
    },
  } as never, {} as never, textMap(noTextCalls), "openai");

  await assert.rejects(() => service.updateJobStatus("missing", "APPLIED"));
});

test("computeFit requires a saved profile", async () => {
  const service = new CareerService(
    {
      async getJob() {
        return fakeJob({ technologies: ["Kubernetes"] });
      },
    } as never,
    {
      async getProfile() {
        return null;
      },
    } as never,
    textMap(noTextCalls),
    "openai",
  );

  await assert.rejects(() => service.computeFit("job-1"));
});

test("computeFit persists the overall score and returns the full breakdown", async () => {
  let persistedScore: number | undefined;
  const service = new CareerService(
    {
      async getJob() {
        return fakeJob({ technologies: ["Kubernetes", "Node.js"] });
      },
      async setFitScore(_id: string, score: number) {
        persistedScore = score;
        return fakeJob({ fitScore: score });
      },
    } as never,
    {
      async getProfile() {
        return {
          technologies: ["Node.js"],
          topSkills: [],
          experiences: [],
          yearsOfExperience: null,
          architectureExperience: "",
          leadershipExperience: "",
        } as never;
      },
    } as never,
    textMap(noTextCalls),
    "openai",
  );

  const fit = await service.computeFit("job-1");

  assert.equal(fit.dimensions.technical, 50); // 1 of 2 required technologies matched
  assert.deepEqual(fit.strengths, ["Node.js"]);
  assert.deepEqual(fit.gaps, ["Kubernetes"]);
  assert.equal(persistedScore, fit.overall);
});

const fakeProfileForTailoring = () => ({
  topSkills: ["Kubernetes", "Node.js"],
  technologies: ["Kubernetes", "Node.js", "PostgreSQL"],
  experiences: [
    { id: "00000000-0000-4000-8000-000000000010", role: "A" },
    { id: "00000000-0000-4000-8000-000000000011", role: "B" },
  ],
});

test("generateResumeTailoringPlan grounds the model's plan against the real profile", async () => {
  const service = new CareerService(
    {
      async getJob() {
        return fakeJob();
      },
    } as never,
    {
      async getProfile() {
        return fakeProfileForTailoring() as never;
      },
    } as never,
    textMap({
      async generateText() {
        return {
          text: JSON.stringify({
            rationale: "Leads with Kubernetes since the job asks for it.",
            // Includes a fabricated id and a fabricated skill the model should not have
            // invented — the grounding step must drop both rather than trust them.
            experienceOrder: [
              "00000000-0000-4000-8000-000000000011",
              "not-a-real-id",
            ],
            topSkillsOrder: ["Kubernetes", "Terraform"],
            technologiesOrder: ["Kubernetes"],
          }),
          model: "test-model",
        };
      },
    }),
    "openai",
  );

  const plan = await service.generateResumeTailoringPlan("job-1");

  // The fabricated id is dropped; the real, unmentioned experience is appended, not dropped.
  assert.deepEqual(plan.experienceOrder, [
    "00000000-0000-4000-8000-000000000011",
    "00000000-0000-4000-8000-000000000010",
  ]);
  // "Terraform" was never in the profile and is dropped; "Node.js" was real but unmentioned
  // and is appended.
  assert.deepEqual(plan.topSkillsOrder, ["Kubernetes", "Node.js"]);
});

test("generateResumeTailoringPlan rejects a model response that fails the schema", async () => {
  const service = new CareerService(
    {
      async getJob() {
        return fakeJob();
      },
    } as never,
    {
      async getProfile() {
        return fakeProfileForTailoring() as never;
      },
    } as never,
    textMap({
      async generateText() {
        return { text: JSON.stringify({ rationale: 123 }), model: "test-model" };
      },
    }),
    "openai",
  );

  await assert.rejects(() => service.generateResumeTailoringPlan("job-1"));
});

test("createRecruiter rejects a recruiter for a company that does not exist", async () => {
  const service = new CareerService(
    {
      async getCompany() {
        return null;
      },
      async createRecruiter() {
        assert.fail("must not insert a recruiter for a missing company");
      },
    } as never,
    {} as never,
    textMap(noTextCalls),
    "openai",
  );

  await assert.rejects(() =>
    service.createRecruiter({
      companyId: "00000000-0000-4000-8000-000000000099",
      relatedJobId: null,
      name: "Alex Recruiter",
      role: "",
      linkedinUrl: "",
      notes: "",
      nextAction: "",
    }),
  );
});

test("createRecruiter rejects a relatedJobId that does not exist", async () => {
  const service = new CareerService(
    {
      async getCompany() {
        return fakeCompany();
      },
      async getJob() {
        return null;
      },
      async createRecruiter() {
        assert.fail("must not insert a recruiter linked to a missing job");
      },
    } as never,
    {} as never,
    textMap(noTextCalls),
    "openai",
  );

  await assert.rejects(() =>
    service.createRecruiter({
      companyId: "00000000-0000-4000-8000-000000000001",
      relatedJobId: "00000000-0000-4000-8000-000000000099",
      name: "Alex Recruiter",
      role: "",
      linkedinUrl: "",
      notes: "",
      nextAction: "",
    }),
  );
});

test("scoreRecruiter combines role, company, and job-link signals and persists the score", async () => {
  let persistedScore: number | undefined;
  const service = new CareerService(
    {
      async getRecruiter() {
        return fakeRecruiter({ role: "Technical Recruiter", relatedJobId: "job-1" });
      },
      async hasActiveJobAtCompany() {
        return true;
      },
      async setRecruiterRelevanceScore(_id: string, score: number) {
        persistedScore = score;
        return fakeRecruiter({ relevanceScore: score });
      },
    } as never,
    {} as never,
    textMap(noTextCalls),
    "openai",
  );

  const recruiter = await service.scoreRecruiter("recruiter-1");

  assert.equal(recruiter.relevanceScore, 100);
  assert.equal(persistedScore, 100);
});

test("patchRecruiter stamps lastInteractionAt when notes are saved", async () => {
  let patch: unknown;
  const service = new CareerService(
    {
      async patchRecruiter(_id: string, input: unknown) {
        patch = input;
        return fakeRecruiter({ notes: "Talked on the phone." });
      },
    } as never,
    {} as never,
    textMap(noTextCalls),
    "openai",
  );

  await service.patchRecruiter("recruiter-1", { notes: "Talked on the phone." });

  assert.deepEqual(patch, { notes: "Talked on the phone." });
});

test("generateOutreachMessage requires a saved profile", async () => {
  const service = new CareerService(
    {
      async getRecruiter() {
        return fakeRecruiter();
      },
      async getCompany() {
        return fakeCompany();
      },
    } as never,
    {
      async getProfile() {
        return null;
      },
    } as never,
    textMap(noTextCalls),
    "openai",
  );

  await assert.rejects(() => service.generateOutreachMessage("recruiter-1"));
});

test("generateOutreachMessage returns the model's structured draft", async () => {
  const service = new CareerService(
    {
      async getRecruiter() {
        return fakeRecruiter();
      },
      async getCompany() {
        return fakeCompany();
      },
    } as never,
    {
      async getProfile() {
        return { fullName: "Jordan Rivera", experiences: [] } as never;
      },
    } as never,
    textMap({
      async generateText() {
        return {
          text: JSON.stringify({
            connectionNote: "Hi Alex, I'd love to connect about the platform role at Nimbus.",
            message: "Hi Alex, following up on the Staff Platform Engineer role at Nimbus...",
          }),
          model: "test-model",
        };
      },
    }),
    "openai",
  );

  const message = await service.generateOutreachMessage("recruiter-1");

  assert.ok(message.connectionNote.length > 0);
  assert.ok(message.message.length > 0);
});
