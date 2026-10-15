import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import type { ApplicationDetailsPublic, FieldPlan, FormField, SupportedApplicationPortal } from "@studio/shared";
import type { AuditEventInput } from "../audit/audit-repository.js";
import { mapFormFields } from "../career/application-field-mapper.js";
import { applicationPayloadHash } from "../career/application-payload.js";
import type {
  ApplicationEventRow,
  ApplicationPatch,
  ApplicationRow,
  ApprovalRow,
  ExecutionFinish,
  ExecutionRow,
  NewApproval,
  TransitionRecord,
} from "../career/application-repository.js";
import { ApplicationService } from "../career/application-service.js";
import { BrowserApplicationPreparer } from "./application-preparer.js";
import { ApplicationSubmitProcessor } from "./application-submit-processor.js";
import { BrowserApplicationSubmitter } from "./application-submitter.js";
import type { BrowserSessionOptions, MockResponse } from "./browser-session.js";
import { MOCK_POSTINGS, mockPortalResponse } from "./mock-portals.js";

// Milestone 4, ticket 7 (spec acceptance criteria 6 to 9): the whole submission path, from
// preparation and approval to the click, against the mock portals in a real headless Chromium.
// The application service and the processor are the real ones; only the database is in memory.
// "A submit request left" means the guard let it through to the portal (here, the mock).
const executablePath = process.env.BROWSER_EXECUTABLE_PATH || chromium.executablePath();
const skip = existsSync(executablePath) ? false : `no Chromium at ${executablePath}`;

const JOB = "11111111-1111-4111-8111-111111111111";
const CV_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PORTAL: SupportedApplicationPortal = "ashby";
const SAVED = { "are you authorized to work in your country of residence": "Yes" };

const DETAILS: ApplicationDetailsPublic = {
  contact: {
    email: "ada@example.com",
    phone: "+55 48 99999-0000",
    city: "Florianópolis",
    country: "Brazil",
    linkedinUrl: "https://linkedin.com/in/ada-mock",
    githubUrl: "https://github.com/ada-mock",
    portfolioUrl: "",
  },
  education: [],
  certifications: [],
  spokenLanguages: [],
  workAuthorization: "Brazilian citizen",
  requiresVisaSponsorship: false,
  noticePeriod: "30 days",
  timeZone: "UTC-3",
  salaryExpectation: { amount: 8000, currency: "USD", period: "MONTH" },
  version: 1,
  updatedAt: "2026-10-14T12:00:00.000Z",
};

function planWith(details: ApplicationDetailsPublic) {
  return async (fields: FormField[]): Promise<FieldPlan[]> =>
    mapFormFields({
      fields,
      person: { fullName: "Ada Mock", currentCompany: "Engines Inc" },
      details,
      answers: [{ id: "WHY_COMPANY", question: "Why?", answer: "I build payment APIs.", status: "DRAFTED" }],
      experiences: [{ startPeriod: "2018", endPeriod: "Present", technologies: ["Node.js"] }],
      documents: { cv: { id: CV_ID, hasFile: true }, coverLetter: null },
      saved: SAVED,
      agreed: [],
      now: new Date("2026-10-14T12:00:00Z"),
    });
}

const loadFile = async () => ({ name: "cv-v1.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 mock") });
const fileHash = async () => "f".repeat(64);

function hashOf(plan: FieldPlan[]): string {
  return applicationPayloadHash({ jobId: JOB, destinationUrl: MOCK_POSTINGS[PORTAL], portal: PORTAL, plan, fileHashes: { [CV_ID]: "f".repeat(64) } });
}

// The applications tables, in memory, with the same guarantees the SQL gives: a transition
// applies only from the state it was read in, leaving the approved path invalidates the live
// approval, and an approval can be claimed by one execution only.
function memoryRepository() {
  const rows: ApplicationRow[] = [];
  const events: ApplicationEventRow[] = [];
  const approvals: ApprovalRow[] = [];
  const executions: ExecutionRow[] = [];
  let ids = 0;
  const nextId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;
  const now = () => new Date();
  const event = (applicationId: string, fromStatus: string | null, toStatus: string, record: TransitionRecord) =>
    events.push({ id: nextId(), applicationId, fromStatus, toStatus, createdAt: now(), ...record });
  const invalidate = (applicationId: string, reason: string) => {
    for (const approval of approvals) {
      if (approval.applicationId === applicationId && !approval.invalidatedAt) Object.assign(approval, { invalidatedAt: now(), invalidationReason: reason });
    }
  };
  const repo = {
    async get(id: string) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async findByJob(jobId: string) {
      return rows.find((row) => row.jobId === jobId) ?? null;
    },
    async create(input: Pick<ApplicationRow, "jobId" | "status" | "mode" | "portal" | "destinationUrl">, record: TransitionRecord) {
      const row = {
        id: nextId(),
        lastError: "",
        formSnapshot: null,
        fieldPlan: null,
        preview: null,
        payloadHash: null,
        agreed: [],
        submittedAt: null,
        confirmationReference: "",
        createdAt: now(),
        updatedAt: now(),
        ...input,
      } as ApplicationRow;
      rows.push(row);
      event(row.id, null, row.status, record);
      return row;
    },
    async transition(id: string, from: string, to: string, record: TransitionRecord, patch: ApplicationPatch = {}) {
      const row = rows.find((candidate) => candidate.id === id && candidate.status === from);
      if (!row) return null;
      Object.assign(row, patch, { status: to, updatedAt: now() });
      if (!["SUBMITTING", "SUBMITTED", "SUBMISSION_UNKNOWN"].includes(to)) invalidate(id, record.reason);
      event(id, from, to, record);
      return row;
    },
    async approve(id: string, record: TransitionRecord, input: NewApproval) {
      const row = rows.find((candidate) => candidate.id === id && candidate.status === "READY_FOR_REVIEW");
      if (!row) return null;
      Object.assign(row, { status: "APPROVED", updatedAt: now() });
      const approval: ApprovalRow = { id: nextId(), applicationId: id, decision: "APPROVED", invalidatedAt: null, invalidationReason: "", ...input };
      approvals.push(approval);
      event(id, "READY_FOR_REVIEW", "APPROVED", record);
      return { row, approval };
    },
    // No await between the check and the write: like the guarded UPDATE, two claims cannot both win.
    async claimSubmission(id: string, approvalId: string, record: TransitionRecord) {
      const row = rows.find((candidate) => candidate.id === id && candidate.status === "APPROVED");
      if (!row || executions.some((execution) => execution.approvalId === approvalId)) return null;
      Object.assign(row, { status: "SUBMITTING", updatedAt: now() });
      const execution: ExecutionRow = {
        id: nextId(),
        applicationId: id,
        approvalId,
        attemptNumber: executions.filter((candidate) => candidate.applicationId === id).length + 1,
        startedAt: now(),
        clickedAt: null,
        finishedAt: null,
        result: "",
        errorType: "",
        submitStatus: null,
        confirmationReference: "",
      };
      executions.push(execution);
      event(id, "APPROVED", "SUBMITTING", record);
      return { row, execution };
    },
    async markClicked(executionId: string, at: Date) {
      const execution = executions.find((candidate) => candidate.id === executionId);
      if (execution) execution.clickedAt = at;
    },
    async finishExecution(executionId: string, finish: ExecutionFinish, at: Date) {
      const execution = executions.find((candidate) => candidate.id === executionId);
      if (execution) Object.assign(execution, finish, { finishedAt: at });
    },
    async finishOpenExecutions(applicationId: string, finish: ExecutionFinish, at: Date) {
      for (const execution of executions) if (execution.applicationId === applicationId && !execution.finishedAt) Object.assign(execution, finish, { finishedAt: at });
    },
    async executions(applicationId: string) {
      return executions.filter((execution) => execution.applicationId === applicationId);
    },
    async listWithJobs(statuses: readonly string[]) {
      return rows.filter((row) => statuses.includes(row.status)).map((row) => ({ row, title: "Engineer", company: "Acme" }));
    },
    async liveApproval(applicationId: string) {
      return approvals.filter((approval) => approval.applicationId === applicationId && !approval.invalidatedAt).at(-1) ?? null;
    },
    async events(applicationId: string) {
      return events.filter((candidate) => candidate.applicationId === applicationId);
    },
  };
  return { repo, rows, approvals, executions };
}

// One world: the mock portal (recording every request the guard let through), the service with
// submission switched on, the preparer and the submit processor.
function world(options: { details?: ApplicationDetailsPublic; portal?: (url: string, method: string) => MockResponse | null } = {}) {
  const passed: Array<{ url: string; method: string }> = [];
  const portal = options.portal ?? mockPortalResponse;
  const browser: BrowserSessionOptions = {
    executablePath,
    runTimeoutMs: 40_000,
    resolveHost: async () => ["104.18.1.1"],
    mockResponse: (url, method) => {
      passed.push({ url, method });
      return portal(url, method);
    },
  };
  const memory = memoryRepository();
  const audits: AuditEventInput[] = [];
  const audit = { record: async (input: AuditEventInput) => void audits.push(input) };
  const permit = { allowed: true };
  const service = new ApplicationService(
    memory.repo,
    audit,
    async (id) => (id === JOB ? { id, url: MOCK_POSTINGS[PORTAL] } : null),
    () => new Date(),
    async () => (permit.allowed ? { allowed: true } : { allowed: false, reason: "SWITCHED_OFF" }),
  );
  const processor = new ApplicationSubmitProcessor({
    applications: service,
    executions: memory.repo,
    submitter: new BrowserApplicationSubmitter(browser),
    planner: { plan: (_jobId, fields) => planWith(options.details ?? DETAILS)(fields) },
    files: { load: loadFile, fileHash },
    audit,
  });
  // Only writes that reached the portal count: page loads and the form's own reads are GETs.
  const submitRequests = () => passed.filter((request) => request.method !== "GET");
  return { ...memory, service, processor, browser, audits, permit, passed, submitRequests };
}

// Prepares the application in the browser, as the preparation worker does, and returns it
// READY_FOR_REVIEW with the payload hash the user would see.
async function prepared(w: ReturnType<typeof world>) {
  const started = await w.service.startPreparation(JOB);
  const outcome = await new BrowserApplicationPreparer(w.browser).prepare({
    portal: PORTAL,
    destinationUrl: MOCK_POSTINGS[PORTAL],
    planFields: planWith(DETAILS),
    loadFile,
  });
  assert.equal(outcome.status, "READY_FOR_REVIEW", outcome.reason);
  return w.service.recordOutcome(started.id, "READY_FOR_REVIEW", "WORKER", outcome.reason, {
    formSnapshot: outcome.form,
    fieldPlan: outcome.plan,
    payloadHash: hashOf(outcome.plan!),
  });
}

test("criterion 6: without an approval no submit request leaves, and none leaves while preparing", { skip }, async () => {
  const w = world();
  const ready = await prepared(w);
  assert.equal(w.submitRequests().length, 0, "preparing filled the form and sent nothing");

  const result = await w.processor.process({ applicationId: ready.id, approvalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
  assert.equal(result.status, "SKIPPED");
  assert.equal(w.submitRequests().length, 0);
  assert.equal(w.executions.length, 0);
  assert.equal((await w.service.get(ready.id)).status, "READY_FOR_REVIEW");

  // Approved, then withdrawn before the run: the run finds no live approval.
  const approved = await w.service.approve(ready.id, { payloadHash: ready.payloadHash });
  await w.service.withdrawApproval(ready.id);
  const late = await w.processor.process({ applicationId: ready.id, approvalId: approved.approval!.id });
  assert.equal(late.status, "SKIPPED");
  assert.equal(w.submitRequests().length, 0);
});

test("criterion 7: a payload that changed after approval is refused before the click and goes back to review", { skip }, async () => {
  const w = world({ details: { ...DETAILS, contact: { ...DETAILS.contact, email: "changed@example.com" } } });
  const ready = await prepared(w);
  const approved = await w.service.approve(ready.id, { payloadHash: ready.payloadHash });

  const result = await w.processor.process({ applicationId: ready.id, approvalId: approved.approval!.id });
  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(w.submitRequests().length, 0, "nothing was sent");
  const after = await w.service.get(ready.id);
  assert.match(after.events.at(-1)?.reason ?? "", /differs from what you approved.*Nothing was sent/);
  assert.equal(after.approval, null);
  assert.ok(w.approvals[0]?.invalidatedAt, "the approval cannot be used again");
  assert.equal(w.executions[0]?.clickedAt, null);
  assert.equal(w.executions[0]?.errorType, "APPROVAL_CHECK_FAILED");
});

test("criterion 8: two runs on one approval, even at the same time, submit once", { skip }, async () => {
  const w = world();
  const ready = await prepared(w);
  const approved = await w.service.approve(ready.id, { payloadHash: ready.payloadHash });
  const job = { applicationId: ready.id, approvalId: approved.approval!.id };

  const results = await Promise.all([w.processor.process(job), w.processor.process(job)]);
  const again = await w.processor.process(job);
  assert.deepEqual(results.map((result) => result.status).sort(), ["SKIPPED", "SUBMITTED"]);
  assert.equal(again.status, "SKIPPED");
  assert.equal(w.submitRequests().length, 1, "exactly one submit request reached the portal");
  assert.equal(w.executions.length, 1);
  assert.equal(w.executions[0]?.result, "SUBMITTED");
  assert.ok(w.executions[0]?.clickedAt);
  assert.equal((await w.service.get(ready.id)).status, "SUBMITTED");
});

test("criterion 9: a dropped response after the click becomes SUBMISSION_UNKNOWN and is never retried", { skip }, async () => {
  // The portal pages load, but the submit request gets no answer (the connection drops).
  const w = world({ portal: (url, method) => (method === "GET" ? mockPortalResponse(url, method) : null) });
  const ready = await prepared(w);
  const approved = await w.service.approve(ready.id, { payloadHash: ready.payloadHash });
  const job = { applicationId: ready.id, approvalId: approved.approval!.id };

  const result = await w.processor.process(job);
  assert.equal(result.status, "SUBMISSION_UNKNOWN");
  assert.equal(w.submitRequests().length, 1);
  assert.equal(w.executions[0]?.submitStatus, null);
  assert.ok(w.executions[0]?.clickedAt);

  // The same job again (a redelivery) does nothing, and only the user can settle it.
  assert.equal((await w.processor.process(job)).status, "SKIPPED");
  assert.equal(w.submitRequests().length, 1);
  const after = await w.service.get(ready.id);
  assert.equal(after.status, "SUBMISSION_UNKNOWN");
  assert.equal((await w.service.markNotSent(ready.id)).status, "READY_FOR_REVIEW");
  assert.equal((await w.processor.process(job)).status, "SKIPPED", "the used approval stays used");
  assert.equal(w.submitRequests().length, 1);
});

// The mock pages already carry a note telling automated agents to click Submit. This page also
// runs script that tries to send the form on its own, by submit() and by fetch, as soon as it
// loads and again when the worker starts typing.
function injectedPage(url: string, method: string): MockResponse | null {
  const response = mockPortalResponse(url, method);
  if (!response || method !== "GET" || !response.contentType.startsWith("text/html")) return response;
  const script = `<script>
    const send = () => {
      fetch("https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiSubmitSingleApplicationFormAction", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operationName: "ApiSubmitSingleApplicationFormAction", variables: { jobPostingId: "${MOCK_POSTINGS[PORTAL].split("/").pop()}" } }),
      }).catch(() => {});
      const form = document.querySelector("form");
      if (form) try { form.requestSubmit ? form.requestSubmit() : form.submit(); } catch {}
    };
    setTimeout(send, 50);
    document.addEventListener("input", send, { once: true });
  </script>`;
  return { ...response, body: response.body.replace("</body>", `${script}</body>`) };
}

test("an injected-instruction page cannot make the worker submit: its own attempts are blocked, and only the approved click goes out", { skip }, async () => {
  const w = world({ portal: injectedPage });
  const started = await w.service.startPreparation(JOB);
  const outcome = await new BrowserApplicationPreparer(w.browser).prepare({
    portal: PORTAL,
    destinationUrl: MOCK_POSTINGS[PORTAL],
    planFields: planWith(DETAILS),
    loadFile,
  });
  assert.equal(w.submitRequests().length, 0, "the page's own attempts were blocked while preparing");
  assert.ok((outcome.preview?.blockedRequests ?? 0) > 0, "and the guard recorded them");

  // During a submission run the gate is armed only after the last check, for one request.
  const ready = await w.service.recordOutcome(started.id, "READY_FOR_REVIEW", "WORKER", outcome.reason, {
    formSnapshot: outcome.form,
    fieldPlan: outcome.plan,
    payloadHash: hashOf(outcome.plan!),
  });
  const approved = await w.service.approve(ready.id, { payloadHash: ready.payloadHash });
  // The run is claimed, then submission is switched off before the click, so the gate is never armed.
  const claimOnly = w.service.claimSubmission.bind(w.service);
  w.service.claimSubmission = async (...args) => {
    const claim = await claimOnly(...args);
    w.permit.allowed = false;
    return claim;
  };
  const result = await w.processor.process({ applicationId: ready.id, approvalId: approved.approval!.id });
  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(w.submitRequests().length, 0, "the page's attempts before the click were blocked too");
  assert.equal(w.executions[0]?.clickedAt, null);

  // With a new approval and submission on, the worker's one click is the only request that leaves.
  w.service.claimSubmission = claimOnly;
  w.permit.allowed = true;
  const again = await w.service.approve(ready.id, { payloadHash: ready.payloadHash });
  const submitted = await w.processor.process({ applicationId: ready.id, approvalId: again.approval!.id });
  assert.equal(submitted.status, "SUBMITTED");
  assert.equal(w.submitRequests().length, 1);
});
