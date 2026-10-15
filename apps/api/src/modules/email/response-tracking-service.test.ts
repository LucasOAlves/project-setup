import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuditEventInput } from "../audit/audit-repository.js";
import { classifyStoredMessage } from "./email-setup.js";
import type { RecruiterMessageRow } from "./recruiter-message-repository.js";
import { ResponseTrackingService } from "./response-tracking-service.js";

const NOW = new Date("2026-10-20T12:00:00Z");
const APP = "11111111-1111-4111-8111-111111111111";
const JOB = "22222222-2222-4222-8222-222222222222";

function row(overrides: Partial<RecruiterMessageRow>): RecruiterMessageRow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    source: "GMAIL",
    providerMessageId: "m1",
    applicationId: APP,
    senderDomain: "hire.lever.co",
    subject: "Next steps",
    body: "We would like to schedule an interview.",
    receivedAt: new Date("2026-10-15T12:00:00Z"),
    matchConfidence: "HIGH",
    matchReason: "from the company's domain",
    classification: "INTERVIEW_REQUEST",
    evidence: "We would like to schedule an interview",
    classifiedBy: "recruiter-message.v1",
    suggestedStatus: "INTERVIEW",
    decision: "",
    decidedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

function setup(messages: RecruiterMessageRow[], jobStatus = "APPLIED", submittedAt = new Date("2026-10-01T12:00:00Z")) {
  const store = new Map(messages.map((message) => [message.id, { ...message }]));
  const statusChanges: Array<[string, string]> = [];
  const audits: AuditEventInput[] = [];
  const repo = {
    async sentApplications() {
      return [{ applicationId: APP, applicationStatus: "SUBMITTED", submittedAt, jobId: JOB, jobTitle: "Engineer", jobStatus, company: "Acme" }];
    },
    async forApplications() {
      return [...store.values()];
    },
    async get(id: string) {
      return store.get(id) ?? null;
    },
    async decide(id: string, decision: string, at: Date) {
      const found = store.get(id);
      if (!found || found.decision) return null;
      Object.assign(found, { decision, decidedAt: at });
      return found;
    },
    async jobFor() {
      return { jobId: JOB, status: jobStatus };
    },
  };
  const service = new ResponseTrackingService(repo, async (jobId, status) => void statusChanges.push([jobId, status]), { record: async (input) => void audits.push(input) }, 10, () => NOW);
  return { service, statusChanges, audits, store };
}

test("accepting a suggestion moves the job, records who decided, and only once", async () => {
  const { service, statusChanges, audits } = setup([row({})]);
  const accepted = await service.accept(row({}).id);
  assert.equal(accepted.decision, "ACCEPTED");
  assert.deepEqual(statusChanges, [[JOB, "INTERVIEW"]]);
  assert.equal(audits[0]?.eventType, "STATUS_SUGGESTION_ACCEPTED");
  assert.equal(audits[0]?.actor, "USER");
  await assert.rejects(service.accept(row({}).id), /already answered/);
  assert.equal(statusChanges.length, 1);
});

test("dismissing changes nothing on the job", async () => {
  const { service, statusChanges } = setup([row({})]);
  assert.equal((await service.dismiss(row({}).id)).decision, "DISMISSED");
  assert.equal(statusChanges.length, 0);
});

test("a message without a suggestion cannot be accepted", async () => {
  const { service, statusChanges } = setup([row({ classification: "UNCLEAR", evidence: "", suggestedStatus: "" })]);
  await assert.rejects(service.accept(row({}).id), /suggests no status change/);
  await assert.rejects(service.accept("44444444-4444-4444-8444-444444444444"), /not found/);
  assert.equal(statusChanges.length, 0);
});

test("the list shows each sent application with its messages and follow-up flag", async () => {
  const replied = setup([row({})]);
  const [item] = await replied.service.list();
  assert.equal(item?.messages.length, 1);
  assert.deepEqual(item?.followUp, { due: false, waitingDays: 19 });

  const silent = setup([row({ classification: "APPLICATION_RECEIVED", suggestedStatus: "" })]);
  assert.deepEqual((await silent.service.list())[0]?.followUp, { due: true, waitingDays: 19 });
});

test("a stored message is classified and suggests a status only when it moves the job forward", async () => {
  const saved: Array<{ suggestedStatus: string; classification: string }> = [];
  const classifier = { classify: async () => ({ classification: "APPLICATION_RECEIVED" as const, evidence: "Thanks for applying to Acme", classifiedBy: "RULES", model: "", inputTokens: 0, outputTokens: 0 }) };
  const repoAt = (status: string) => ({
    jobFor: async () => ({ jobId: JOB, status }),
    setClassification: async (_id: string, result: { suggestedStatus: string; classification: string }) => {
      saved.push(result);
      return null;
    },
  });
  await classifyStoredMessage(repoAt("PREPARING"), classifier)(row({}));
  await classifyStoredMessage(repoAt("INTERVIEW"), classifier)(row({}));
  await classifyStoredMessage(repoAt("APPLIED"), classifier)(row({ body: null }));
  assert.deepEqual(saved.map((item) => item.suggestedStatus), ["APPLIED", ""]);
});
