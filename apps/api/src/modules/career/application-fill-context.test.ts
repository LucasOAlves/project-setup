import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApplicationDocumentPublic } from "@studio/shared";
import { ApplicationFillPlanner } from "./application-fill-context.js";

const JOB = "11111111-1111-4111-8111-111111111111";

function document(type: ApplicationDocumentPublic["type"], content: Record<string, unknown>, hasFile = true): ApplicationDocumentPublic {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    jobId: JOB,
    type,
    version: 1,
    origin: "GENERATED",
    profileVersion: 1,
    detailsVersion: null,
    content,
    contentHash: "h",
    hasFile,
    fileHash: null,
    createdAt: "2026-10-14T12:00:00.000Z",
  };
}

test("the plan uses the current employer, the latest CV and prepared answers", async () => {
  const planner = new ApplicationFillPlanner({
    getProfile: async () => ({
      fullName: "Ada Lovelace",
      experiences: [
        { company: "Old Co", startPeriod: "2015", endPeriod: "2019", technologies: [] },
        { company: "Now Co", startPeriod: "2019", endPeriod: "Present", technologies: ["Node.js"] },
      ],
    }),
    getDetails: async () => null,
    latestDocument: async (_jobId, type) =>
      type === "CV"
        ? document("CV", {})
        : type === "APPLICATION_ANSWERS"
          ? document("APPLICATION_ANSWERS", {
              format: "application-answers@1",
              promptVersion: null,
              job: { title: "x", companyName: "y" },
              answers: [{ id: "YEARS_OF_EXPERIENCE", question: "Years?", answer: "11 years", status: "FROM_PROFILE" }],
              droppedSentences: 0,
            }, false)
          : null,
    savedAnswers: async () => ({}),
    now: () => new Date("2026-10-14T12:00:00Z"),
  });

  const plan = await planner.plan(JOB, [
    { key: "a", label: "Current company", kind: "TEXT", required: false, options: [], name: "org" },
    { key: "b", label: "Resume", kind: "FILE", required: true, options: [], name: "resume" },
    { key: "c", label: "Years of professional experience", kind: "NUMBER", required: true, options: [], name: "" },
    { key: "d", label: "Full name", kind: "TEXT", required: true, options: [], name: "name" },
  ]);
  assert.deepEqual(
    plan.map((field) => [field.key, field.status, field.value]),
    [
      ["a", "FILLED", "Now Co"],
      ["b", "FILLED", "CV PDF"],
      ["c", "FILLED", "11"],
      ["d", "FILLED", "Ada Lovelace"],
    ],
  );
});
