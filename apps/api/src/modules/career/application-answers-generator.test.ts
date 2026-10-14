import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApplicationAnswersContent, ApplicationDocumentPublic, ProfilePublic } from "@studio/shared";
import { AppError } from "../../app-error.js";
import { ApplicationAnswersGenerator } from "./application-answers-generator.js";

const JOB = "11111111-1111-4111-8111-111111111111";
const profile = {
  fullName: "Dana Example",
  yearsOfExperience: 8,
  topSkills: [],
  technologies: ["Node.js"],
  architectureExperience: "",
  leadershipExperience: "",
  experiences: [
    { id: "e1", role: "Tech Lead", company: "SecretEmployer", startPeriod: "2020", endPeriod: "Present", description: "Led a team of 6 engineers building a payments platform.", responsibilities: "", achievements: "", measurableOutcomes: "", technologies: ["Node.js"] },
  ],
} as unknown as ProfilePublic;

function setup(model: (user: string) => Promise<string>) {
  const saved: Array<Record<string, unknown>> = [];
  let latest: ApplicationDocumentPublic | null = null;
  const generator = new ApplicationAnswersGenerator(
    {
      careerRepo: {
        async getJob(id: string) {
          return id === JOB
            ? ({ id, companyId: "c1", title: "Platform Engineer", description: "Hiring Co builds logistics software with Node.js and Kubernetes.", rawDescription: "", requirements: [], technologies: [] } as never)
            : null;
        },
        async getCompany() {
          return { name: "Hiring Co" } as never;
        },
        async getProfileVersion() {
          return 5;
        },
      },
      getProfile: async () => profile,
      getApplicationDetails: async () => null,
      textProviders: { openai: { generateText: async (input: { user: string }) => ({ text: await model(input.user), model: "fake" }) }, anthropic: {} as never } as never,
      defaultTextProvider: "openai",
      documents: {
        async save(input) {
          saved.push(input as never);
          latest = { id: `d${saved.length}`, content: input.content } as never;
          return { document: latest!, created: true };
        },
        async latest() {
          return latest;
        },
      },
    },
    () => new Date("2026-10-14T12:00:00Z"),
  );
  return { generator, saved };
}

const draft = JSON.stringify({
  sentences: [
    { text: "Hiring Co builds logistics software, a domain where platform work matters.", evidence: [{ source: "JOB", quote: "Hiring Co builds logistics software" }] },
    { text: "I led a team of 6 engineers building a payments platform.", evidence: [{ source: "PROFILE", quote: "Led a team of 6 engineers" }] },
    { text: "I have run Kubernetes in production.", evidence: [{ source: "PROFILE", quote: "Led a team of 6 engineers" }] },
  ],
});

test("answers from the profile, asks about the job's technologies and drafts a grounded why-this-company", async () => {
  const { generator, saved } = setup(async () => draft);
  await generator.generate(JOB);
  const content = saved[0]!.content as ApplicationAnswersContent;
  const byId = new Map(content.answers.map((answer) => [answer.id, answer]));
  assert.equal(saved[0]!.type, "APPLICATION_ANSWERS");
  assert.equal(saved[0]!.file, undefined);
  assert.equal(byId.get("YEARS_OF_EXPERIENCE")!.answer, "8 years");
  assert.equal(byId.get("YEARS_WITH:Node.js")!.answer, "6 years");
  assert.equal(byId.get("YEARS_WITH:Kubernetes")!.status, "NEEDS_INPUT");
  assert.equal(byId.get("SALARY_EXPECTATION")!.status, "NEEDS_INPUT");
  assert.equal(byId.get("WHY_COMPANY")!.status, "DRAFTED");
  assert.equal(
    byId.get("WHY_COMPANY")!.answer,
    "Hiring Co builds logistics software, a domain where platform work matters. I led a team of 6 engineers building a payments platform.",
  );
  assert.equal(content.droppedSentences, 1);
});

test("still saves the other answers when the model fails, leaving why-this-company to the user", async () => {
  const { generator, saved } = setup(async () => {
    throw new Error("no API key");
  });
  await generator.generate(JOB);
  const why = (saved[0]!.content as ApplicationAnswersContent).answers.find((answer) => answer.id === "WHY_COMPANY")!;
  assert.equal(why.status, "NEEDS_INPUT");
  assert.match(why.note ?? "", /no API key/);
});

test("an edit fills answers as the user's own, clears blanks and rejects unknown questions", async () => {
  const { generator, saved } = setup(async () => draft);
  await assert.rejects(generator.saveEdit(JOB, { answers: [{ id: "NOTICE_PERIOD", answer: "2 weeks" }] }), (e: unknown) => e instanceof AppError && e.statusCode === 404);
  await generator.generate(JOB);
  await generator.saveEdit(JOB, {
    answers: [
      { id: "SALARY_EXPECTATION", answer: "USD 8,000 per month" },
      { id: "WHY_COMPANY", answer: "" },
    ],
  });
  const edited = saved[1]!;
  const byId = new Map((edited.content as ApplicationAnswersContent).answers.map((answer) => [answer.id, answer]));
  assert.equal(edited.origin, "EDITED");
  assert.deepEqual(byId.get("SALARY_EXPECTATION"), { id: "SALARY_EXPECTATION", question: "What are your salary expectations?", answer: "USD 8,000 per month", status: "FROM_YOU" });
  assert.equal(byId.get("WHY_COMPANY")!.status, "NEEDS_INPUT");
  assert.equal(byId.get("YEARS_OF_EXPERIENCE")!.status, "FROM_PROFILE");
  await assert.rejects(generator.saveEdit(JOB, { answers: [{ id: "MADE_UP", answer: "x" }] }), (e: unknown) => e instanceof AppError && e.statusCode === 400);
});
