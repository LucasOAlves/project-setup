import assert from "node:assert/strict";
import test from "node:test";
import type { JobBoardSource, JobSearchSource } from "@studio/shared";
import type { TextGenerationProvider } from "../ai/text-generation-provider.ts";
import type { JobProvider } from "./job-provider.ts";
import type { JobSearchProvider } from "./job-search-provider.ts";
import { CareerService } from "./career-service.ts";

const textMap = (text: TextGenerationProvider) => ({ openai: text, anthropic: text }) as const;
const noTextCalls: TextGenerationProvider = {
  async generateText() {
    assert.fail("must not call the model");
  },
};

function noBoardProviders(message = "must not call the job provider"): Record<JobBoardSource, JobProvider> {
  const fail: JobProvider = {
    async listJobs() {
      assert.fail(message);
    },
  };
  return { greenhouse: fail, lever: fail, ashby: fail };
}

function noSearchProviders(message = "must not call the search provider"): Record<JobSearchSource, JobSearchProvider> {
  const fail: JobSearchProvider = {
    async searchJobs() {
      assert.fail(message);
    },
  };
  return { remoteok: fail, arbeitnow: fail, adzuna: fail };
}

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
  const service = new CareerService(
    {
      async getCompany() {
        return null;
      },
      async createJob() {
        assert.fail("must not insert a job for a missing company");
      },
    } as never,
    {} as never,
    textMap(noTextCalls),
    "openai",
    noBoardProviders(),
    noSearchProviders(),
  );

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
  const service = new CareerService(
    {
      async getCompany() {
        return fakeCompany();
      },
      async createJob(input: unknown) {
        inserted = input;
        return fakeJob();
      },
    } as never,
    {} as never,
    textMap(noTextCalls),
    "openai",
    noBoardProviders(),
    noSearchProviders(),
  );

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
  const service = new CareerService(
    {
      async getJob() {
        return fakeJob({ status: "SHORTLISTED", appliedAt: null });
      },
      async updateJobStatus(_id: string, input: unknown) {
        patch = input;
        return fakeJob({ status: "APPLIED", appliedAt: new Date() });
      },
    } as never,
    {} as never,
    textMap(noTextCalls),
    "openai",
    noBoardProviders(),
    noSearchProviders(),
  );

  const job = await service.updateJobStatus("job-1", "APPLIED");

  assert.ok(job.appliedAt);
  assert.equal((patch as { appliedAt: Date | null }).appliedAt instanceof Date, true);
});

test("updateJobStatus does not restamp appliedAt if already set", async () => {
  const existingAppliedAt = new Date("2026-01-01T00:00:00Z");
  let patch: unknown;
  const service = new CareerService(
    {
      async getJob() {
        return fakeJob({ status: "APPLIED", appliedAt: existingAppliedAt });
      },
      async updateJobStatus(_id: string, input: unknown) {
        patch = input;
        return fakeJob({ status: "SCREENING", appliedAt: existingAppliedAt });
      },
    } as never,
    {} as never,
    textMap(noTextCalls),
    "openai",
    noBoardProviders(),
    noSearchProviders(),
  );

  await service.updateJobStatus("job-1", "SCREENING");

  assert.equal((patch as { appliedAt: Date | null }).appliedAt, existingAppliedAt);
});

test("updateJobStatus clears appliedAt when moved back to a pre-application stage", async () => {
  let patch: unknown;
  const service = new CareerService(
    {
      async getJob() {
        return fakeJob({ status: "APPLIED", appliedAt: new Date() });
      },
      async updateJobStatus(_id: string, input: unknown) {
        patch = input;
        return fakeJob({ status: "SHORTLISTED", appliedAt: null });
      },
    } as never,
    {} as never,
    textMap(noTextCalls),
    "openai",
    noBoardProviders(),
    noSearchProviders(),
  );

  await service.updateJobStatus("job-1", "SHORTLISTED");

  assert.equal((patch as { appliedAt: Date | null }).appliedAt, null);
});

test("updateJobStatus rejects an unknown job id", async () => {
  const service = new CareerService(
    {
      async getJob() {
        return null;
      },
    } as never,
    {} as never,
    textMap(noTextCalls),
    "openai",
    noBoardProviders(),
    noSearchProviders(),
  );

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
    noBoardProviders(),
    noSearchProviders(),
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
    noBoardProviders(),
    noSearchProviders(),
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
    noBoardProviders(),
    noSearchProviders(),
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
    noBoardProviders(),
    noSearchProviders(),
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
    noBoardProviders(),
    noSearchProviders(),
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
    noBoardProviders(),
    noSearchProviders(),
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
    noBoardProviders(),
    noSearchProviders(),
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
    noBoardProviders(),
    noSearchProviders(),
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
    noBoardProviders(),
    noSearchProviders(),
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
    noBoardProviders(),
    noSearchProviders(),
  );

  const message = await service.generateOutreachMessage("recruiter-1");

  assert.ok(message.connectionNote.length > 0);
  assert.ok(message.message.length > 0);
});

test("getAnalytics composes jobs, recruiters, and status history into one report", async () => {
  const service = new CareerService(
    {
      async listJobs() {
        return [fakeJob({ status: "APPLIED", appliedAt: new Date() })];
      },
      async listRecruiters() {
        return [fakeRecruiter()];
      },
      async listJobStatusEvents() {
        return [{ jobId: "00000000-0000-4000-8000-000000000002", status: "APPLIED" }];
      },
    } as never,
    {
      async getProfile() {
        return null;
      },
    } as never,
    textMap(noTextCalls),
    "openai",
    noBoardProviders(),
    noSearchProviders(),
  );

  const analytics = await service.getAnalytics();

  assert.equal(analytics.totalJobs, 1);
  assert.equal(analytics.applications, 1);
  assert.equal(analytics.recruiterContacts, 1);
});

test("importFromBoard rejects an unknown company without calling the provider", async () => {
  const service = new CareerService(
    {
      async getCompany() {
        return null;
      },
    } as never,
    {} as never,
    textMap(noTextCalls),
    "openai",
    noBoardProviders("must not call the job provider for a missing company"),
    noSearchProviders(),
  );

  await assert.rejects(() => service.importFromBoard("company-1", "greenhouse", "nimbus"));
});

test("importFromBoard skips postings already imported and only creates the new ones", async () => {
  const created: unknown[] = [];
  const boardProviders = noBoardProviders();
  boardProviders.greenhouse = {
    async listJobs() {
      return [
        {
          externalId: "1",
          title: "Already imported",
          url: "https://x/1",
          location: "",
          description: "",
          companyNameFromSource: "Nimbus",
          updatedAt: new Date(),
        },
        {
          externalId: "2",
          title: "New posting",
          url: "https://x/2",
          location: "",
          description: "",
          companyNameFromSource: "Nimbus",
          updatedAt: new Date(),
        },
      ];
    },
  };
  const service = new CareerService(
    {
      async getCompany() {
        return fakeCompany();
      },
      async getJobByExternalId(_source: string, externalId: string) {
        return externalId === "1" ? fakeJob({ externalId: "1" }) : null;
      },
      async createImportedJob(input: unknown) {
        created.push(input);
        return fakeJob({ ...(input as Record<string, unknown>) });
      },
    } as never,
    {} as never,
    textMap(noTextCalls),
    "openai",
    boardProviders,
    noSearchProviders(),
  );

  const result = await service.importFromBoard("company-1", "greenhouse", "nimbus");

  assert.equal(result.skipped, 1);
  assert.equal(result.imported.length, 1);
  assert.equal(created.length, 1);
  assert.equal((created[0] as { externalId: string }).externalId, "2");
});

test("searchJobs returns normalized postings from the chosen search provider", async () => {
  const searchProviders = noSearchProviders();
  searchProviders.remoteok = {
    async searchJobs() {
      return [
        {
          externalId: "42",
          title: "Backend Engineer",
          url: "https://x/42",
          location: "Remote",
          description: "Build things.",
          companyNameFromSource: "Nimbus",
          updatedAt: new Date(),
        },
      ];
    },
  };
  const service = new CareerService(
    {} as never,
    {} as never,
    textMap(noTextCalls),
    "openai",
    noBoardProviders(),
    searchProviders,
  );

  const results = await service.searchJobs("remoteok", "backend");

  assert.equal(results.length, 1);
  assert.equal(results[0]?.companyName, "Nimbus");
});

test("importSearchResult reuses an existing company matched case-insensitively", async () => {
  let createCompanyCalled = false;
  const service = new CareerService(
    {
      async getJobByExternalId() {
        return null;
      },
      async findCompanyByName(name: string) {
        return name.toLowerCase() === "nimbus" ? fakeCompany() : null;
      },
      async createCompany() {
        createCompanyCalled = true;
        return fakeCompany();
      },
      async createImportedJob(input: unknown) {
        return fakeJob({ ...(input as Record<string, unknown>) });
      },
    } as never,
    {} as never,
    textMap(noTextCalls),
    "openai",
    noBoardProviders(),
    noSearchProviders(),
  );

  await service.importSearchResult("remoteok", {
    externalId: "42",
    title: "Backend Engineer",
    url: "https://x/42",
    location: "Remote",
    description: "Build things.",
    companyName: "NIMBUS",
  });

  assert.equal(createCompanyCalled, false);
});

test("importSearchResult creates a new company when none matches", async () => {
  let createdCompanyName: string | undefined;
  const service = new CareerService(
    {
      async getJobByExternalId() {
        return null;
      },
      async findCompanyByName() {
        return null;
      },
      async createCompany(input: { name: string }) {
        createdCompanyName = input.name;
        return fakeCompany({ name: input.name });
      },
      async createImportedJob(input: unknown) {
        return fakeJob({ ...(input as Record<string, unknown>) });
      },
    } as never,
    {} as never,
    textMap(noTextCalls),
    "openai",
    noBoardProviders(),
    noSearchProviders(),
  );

  await service.importSearchResult("arbeitnow", {
    externalId: "7",
    title: "Platform Engineer",
    url: "https://x/7",
    location: "Berlin",
    description: "",
    companyName: "Acme GmbH",
  });

  assert.equal(createdCompanyName, "Acme GmbH");
});

test("importSearchResult is idempotent on re-import", async () => {
  let createImportedJobCalls = 0;
  const service = new CareerService(
    {
      async getJobByExternalId() {
        return fakeJob({ externalId: "42", source: "remoteok" });
      },
      async createImportedJob(input: unknown) {
        createImportedJobCalls += 1;
        return fakeJob({ ...(input as Record<string, unknown>) });
      },
    } as never,
    {} as never,
    textMap(noTextCalls),
    "openai",
    noBoardProviders(),
    noSearchProviders(),
  );

  await service.importSearchResult("remoteok", {
    externalId: "42",
    title: "Backend Engineer",
    url: "https://x/42",
    location: "Remote",
    description: "",
    companyName: "Nimbus",
  });

  assert.equal(createImportedJobCalls, 0);
});

test("getContentSuggestions returns nothing without a saved profile", async () => {
  const service = new CareerService(
    {
      async listJobs() {
        assert.fail("must not need jobs when there is no profile to ground against");
      },
    } as never,
    {
      async getProfile() {
        return null;
      },
    } as never,
    textMap(noTextCalls),
    "openai",
    noBoardProviders(),
    noSearchProviders(),
  );

  const suggestions = await service.getContentSuggestions();
  assert.deepEqual(suggestions, []);
});

test("getContentSuggestions grounds market demand against the real saved profile", async () => {
  const service = new CareerService(
    {
      async listJobs() {
        return [fakeJob({ technologies: ["Kubernetes"] })];
      },
    } as never,
    {
      async getProfile() {
        return {
          topSkills: ["Kubernetes"],
          technologies: [],
          experiences: [],
        } as never;
      },
    } as never,
    textMap(noTextCalls),
    "openai",
    noBoardProviders(),
    noSearchProviders(),
  );

  const suggestions = await service.getContentSuggestions();
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.technology, "Kubernetes");
});
