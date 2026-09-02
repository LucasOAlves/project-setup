import assert from "node:assert/strict";
import test from "node:test";
import type { JobPublic, JobStatus, RecruiterPublic } from "@studio/shared";
import { computeCareerAnalytics } from "./career-analytics.ts";

function fakeJob(overrides: Partial<JobPublic> = {}): JobPublic {
  return {
    id: "job-1",
    companyId: "company-1",
    source: "manual",
    externalId: "",
    title: "Staff Platform Engineer",
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
    status: "SAVED",
    fitScore: null,
    discoveredAt: new Date().toISOString(),
    appliedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakeRecruiter(overrides: Partial<RecruiterPublic> = {}): RecruiterPublic {
  return {
    id: "recruiter-1",
    companyId: "company-1",
    relatedJobId: null,
    name: "Alex",
    role: "",
    linkedinUrl: "",
    connectionStatus: "NOT_CONNECTED",
    relevanceScore: null,
    notes: "",
    nextAction: "",
    lastInteractionAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test("counts total jobs and jobs by status, including untouched statuses at zero", () => {
  const analytics = computeCareerAnalytics({
    jobs: [
      fakeJob({ id: "1", status: "SAVED" }),
      fakeJob({ id: "2", status: "APPLIED", appliedAt: new Date().toISOString() }),
    ],
    recruiters: [],
    statusEventsByJobId: new Map(),
    gapsByJobId: new Map(),
  });

  assert.equal(analytics.totalJobs, 2);
  assert.equal(analytics.jobsByStatus.SAVED, 1);
  assert.equal(analytics.jobsByStatus.APPLIED, 1);
  assert.equal(analytics.jobsByStatus.OFFER, 0);
});

test("a job that reached interview and was later rejected still counts as having reached interview", () => {
  const events = new Map<string, Set<JobStatus>>([
    ["1", new Set<JobStatus>(["SAVED", "APPLIED", "INTERVIEW", "REJECTED"])],
  ]);
  const analytics = computeCareerAnalytics({
    jobs: [fakeJob({ id: "1", status: "REJECTED", appliedAt: new Date().toISOString() })],
    recruiters: [],
    statusEventsByJobId: events,
    gapsByJobId: new Map(),
  });

  assert.equal(analytics.interviewsReached, 1);
});

test("applicationToInterviewRate and rejectionRate are null with no applications, not zero or NaN", () => {
  const analytics = computeCareerAnalytics({
    jobs: [fakeJob({ id: "1", status: "SAVED" })],
    recruiters: [],
    statusEventsByJobId: new Map(),
    gapsByJobId: new Map(),
  });

  assert.equal(analytics.applicationToInterviewRate, null);
  assert.equal(analytics.rejectionRate, null);
});

test("a SAVED job that was never applied to does not count against the rejection rate", () => {
  const analytics = computeCareerAnalytics({
    jobs: [
      fakeJob({ id: "1", status: "REJECTED" }), // never applied — appliedAt stays null
      fakeJob({ id: "2", status: "APPLIED", appliedAt: new Date().toISOString() }),
    ],
    recruiters: [],
    statusEventsByJobId: new Map(),
    gapsByJobId: new Map(),
  });

  // Only job 2 counts as an application; job 1's REJECTED status is a "not pursuing it"
  // decision on a saved posting, not an actual rejection.
  assert.equal(analytics.applications, 1);
  assert.equal(analytics.rejectionRate, 0);
});

test("averageFitScore ignores unscored jobs", () => {
  const analytics = computeCareerAnalytics({
    jobs: [fakeJob({ id: "1", fitScore: 80 }), fakeJob({ id: "2", fitScore: null })],
    recruiters: [],
    statusEventsByJobId: new Map(),
    gapsByJobId: new Map(),
  });

  assert.equal(analytics.averageFitScore, 80);
});

test("companiesTargeted counts distinct companies with at least one tracked job", () => {
  const analytics = computeCareerAnalytics({
    jobs: [
      fakeJob({ id: "1", companyId: "a" }),
      fakeJob({ id: "2", companyId: "a" }),
      fakeJob({ id: "3", companyId: "b" }),
    ],
    recruiters: [],
    statusEventsByJobId: new Map(),
    gapsByJobId: new Map(),
  });

  assert.equal(analytics.companiesTargeted, 2);
});

test("topTechnologies tallies case-insensitively and returns the most common first", () => {
  const analytics = computeCareerAnalytics({
    jobs: [
      fakeJob({ id: "1", technologies: ["Kubernetes", "Node.js"] }),
      fakeJob({ id: "2", technologies: ["kubernetes", "Go"] }),
    ],
    recruiters: [],
    statusEventsByJobId: new Map(),
    gapsByJobId: new Map(),
  });

  assert.equal(analytics.topTechnologies[0]?.technology, "Kubernetes");
  assert.equal(analytics.topTechnologies[0]?.count, 2);
});

test("recruitersConnected only counts CONNECTED status", () => {
  const analytics = computeCareerAnalytics({
    jobs: [],
    recruiters: [
      fakeRecruiter({ id: "r1", connectionStatus: "CONNECTED" }),
      fakeRecruiter({ id: "r2", connectionStatus: "REQUESTED" }),
    ],
    statusEventsByJobId: new Map(),
    gapsByJobId: new Map(),
  });

  assert.equal(analytics.recruiterContacts, 2);
  assert.equal(analytics.recruitersConnected, 1);
});
