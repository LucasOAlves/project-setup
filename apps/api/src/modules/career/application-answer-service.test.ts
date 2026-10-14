import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApplicationPublic, FieldPlan } from "@studio/shared";
import { AppError } from "../../app-error.js";
import type { SavedAnswer } from "./saved-answer-repository.js";
import { ApplicationAnswerService } from "./application-answer-service.js";

function field(questionKey: string, overrides: Partial<FieldPlan> = {}): FieldPlan {
  return { key: questionKey, questionKey, label: questionKey, kind: "TEXT", required: true, options: [], status: "NEEDS_INPUT", value: null, source: null, ...overrides };
}

const application = {
  id: "00000000-0000-4000-8000-000000000001",
  jobId: "11111111-1111-4111-8111-111111111111",
  status: "NEEDS_INFORMATION",
  plan: [
    field("are you authorized to work", { kind: "YES_NO", options: ["Yes", "No"] }),
    field("how did you hear", { kind: "SELECT", options: ["LinkedIn", "Referral"], required: false }),
    field("i agree to store my data", { kind: "CHECKBOX" }),
    field("resume", { kind: "FILE" }),
  ],
} as unknown as ApplicationPublic;

function setup(current: ApplicationPublic = application) {
  const saved: SavedAnswer[] = [];
  const agreed: string[][] = [];
  const withdrawn: string[] = [];
  const service = new ApplicationAnswerService({
    applications: {
      get: async () => current,
      withdrawApproval: async (id, reason) => {
        withdrawn.push(`${id}: ${reason}`);
        return current;
      },
    },
    saveAnswers: async (answers) => {
      saved.push(...answers);
    },
    setAgreed: async (_id, keys) => {
      agreed.push(keys);
    },
    audit: { record: async () => undefined },
  });
  return { service, saved, agreed, withdrawn };
}

async function rejects(promise: Promise<unknown>, status: number) {
  await assert.rejects(promise, (error: unknown) => error instanceof AppError && error.statusCode === status);
}

test("answers are saved with the question's label, and consent is kept for this application", async () => {
  const { service, saved, agreed } = setup();
  const result = await service.save(application.id, {
    answers: [
      { questionKey: "are you authorized to work", answer: "Yes" },
      { questionKey: "how did you hear", answer: "LinkedIn" },
    ],
    agreed: ["i agree to store my data"],
  });
  assert.deepEqual(result, { saved: 2, agreed: 1 });
  assert.deepEqual(saved, [
    { questionKey: "are you authorized to work", label: "are you authorized to work", answer: "Yes" },
    { questionKey: "how did you hear", label: "how did you hear", answer: "LinkedIn" },
  ]);
  assert.deepEqual(agreed, [["i agree to store my data"]]);
});

test("an answer outside the field's options is refused", async () => {
  const { service } = setup();
  await rejects(service.save(application.id, { answers: [{ questionKey: "are you authorized to work", answer: "Maybe" }] }), 400);
});

test("questions the form does not ask, files and consent-as-text are refused", async () => {
  const { service } = setup();
  await rejects(service.save(application.id, { answers: [{ questionKey: "made up", answer: "x" }] }), 400);
  await rejects(service.save(application.id, { answers: [{ questionKey: "resume", answer: "x" }] }), 400);
  await rejects(service.save(application.id, { answers: [{ questionKey: "i agree to store my data", answer: "Yes" }] }), 400);
  await rejects(service.save(application.id, { agreed: ["how did you hear"] }), 400);
});

test("answers wait while a run is in progress", async () => {
  const { service } = setup({ ...application, status: "PREPARING" });
  await rejects(service.save(application.id, { answers: [] }), 409);
});

test("new answers withdraw a live approval first", async () => {
  const { service, withdrawn, saved } = setup({ ...application, status: "APPROVED" } as ApplicationPublic);
  await service.save(application.id, { answers: [{ questionKey: "how did you hear", answer: "Referral" }] });
  assert.equal(withdrawn.length, 1);
  assert.match(withdrawn[0]!, /approval was withdrawn/);
  assert.equal(saved.length, 1);
});

test("answers cannot change during or after a submission", async () => {
  for (const status of ["SUBMITTING", "SUBMITTED", "SUBMISSION_UNKNOWN"]) {
    const { service } = setup({ ...application, status } as ApplicationPublic);
    await rejects(service.save(application.id, { answers: [{ questionKey: "how did you hear", answer: "Referral" }] }), 409);
  }
});
