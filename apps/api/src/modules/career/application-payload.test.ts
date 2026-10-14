import { test } from "node:test";
import assert from "node:assert/strict";
import type { FieldPlan } from "@studio/shared";
import { applicationPayloadHash, type PayloadInput } from "./application-payload.js";

const CV1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CV2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function field(questionKey: string, overrides: Partial<FieldPlan> = {}): FieldPlan {
  return {
    key: `f-${questionKey}`,
    questionKey,
    label: questionKey,
    kind: "TEXT",
    required: false,
    options: [],
    status: "FILLED",
    value: `value of ${questionKey}`,
    source: "YOUR_DETAILS",
    ...overrides,
  };
}

const base: PayloadInput = {
  jobId: "11111111-1111-4111-8111-111111111111",
  destinationUrl: "https://jobs.lever.co/acme/abc/apply",
  portal: "lever",
  plan: [
    field("full name", { required: true }),
    field("email", { kind: "EMAIL", required: true }),
    field("resume cv", { kind: "FILE", value: "CV PDF", documentId: CV1, source: "CV" }),
    field("portfolio url", { status: "LEFT_EMPTY", value: null, source: null }),
  ],
  fileHashes: { [CV1]: "hash-cv-1", [CV2]: "hash-cv-2" },
};

const hash = (input: PayloadInput) => applicationPayloadHash(input);

test("the hash is a sha256 hex digest and is stable", () => {
  assert.match(hash(base), /^[0-9a-f]{64}$/);
  assert.equal(hash(base), hash(structuredClone(base)));
});

test("field order and per-run keys do not change the payload", () => {
  const reordered = { ...base, plan: [...base.plan].reverse().map((plan, index) => ({ ...plan, key: `f${index + 7}` })) };
  assert.equal(hash(reordered), hash(base));
});

test("notes, labels and sources are not part of the payload", () => {
  const cosmetic = { ...base, plan: base.plan.map((plan) => ({ ...plan, note: "Review it", label: plan.label.toUpperCase(), source: null })) };
  assert.equal(hash(cosmetic), hash(base));
});

test("a changed answer changes the payload", () => {
  const changed = { ...base, plan: base.plan.map((plan) => (plan.questionKey === "email" ? { ...plan, value: "other@example.com" } : plan)) };
  assert.notEqual(hash(changed), hash(base));
});

test("filling a field that was left empty changes the payload", () => {
  const filled = {
    ...base,
    plan: base.plan.map((plan) => (plan.questionKey === "portfolio url" ? { ...plan, status: "FILLED" as const, value: "https://ada.dev" } : plan)),
  };
  assert.notEqual(hash(filled), hash(base));
});

test("attaching another CV version, or the same version with a different file, changes the payload", () => {
  const otherVersion = { ...base, plan: base.plan.map((plan) => (plan.kind === "FILE" ? { ...plan, documentId: CV2 } : plan)) };
  assert.notEqual(hash(otherVersion), hash(base));
  const otherFile = { ...base, fileHashes: { ...base.fileHashes, [CV1]: "tampered" } };
  assert.notEqual(hash(otherFile), hash(base));
});

test("a different destination or job changes the payload; a URL fragment does not", () => {
  assert.notEqual(hash({ ...base, destinationUrl: "https://jobs.lever.co/acme/other/apply" }), hash(base));
  assert.notEqual(hash({ ...base, jobId: "22222222-2222-4222-8222-222222222222" }), hash(base));
  assert.equal(hash({ ...base, destinationUrl: "https://JOBS.lever.co/acme/abc/apply#top" }), hash(base));
});

test("a revised form (a new or now-required field) changes the payload", () => {
  const extraField = { ...base, plan: [...base.plan, field("cover letter", { status: "LEFT_EMPTY", value: null, source: null })] };
  assert.notEqual(hash(extraField), hash(base));
  const nowRequired = { ...base, plan: base.plan.map((plan) => (plan.questionKey === "portfolio url" ? { ...plan, required: true } : plan)) };
  assert.notEqual(hash(nowRequired), hash(base));
});
