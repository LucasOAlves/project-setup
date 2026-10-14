import assert from "node:assert/strict";
import { test } from "node:test";
import type { CoverLetterContent, ProfilePublic } from "@studio/shared";
import { AppError } from "../../app-error.js";
import { CoverLetterGenerator } from "./cover-letter-generator.js";
import { buildCoverLetterPdf } from "./cover-letter-pdf.js";

const JOB = "11111111-1111-4111-8111-111111111111";
const profile = {
  fullName: "Dana Example",
  yearsOfExperience: 10,
  topSkills: [],
  technologies: ["Node.js"],
  architectureExperience: "",
  leadershipExperience: "",
  experiences: [
    { id: "e1", role: "Tech Lead", company: "SecretEmployer", description: "Led a team of 6 engineers building a payments platform.", responsibilities: "", achievements: "", measurableOutcomes: "", technologies: ["Node.js"] },
  ],
} as unknown as ProfilePublic;

function setup(modelOutput: unknown) {
  const prompts: string[] = [];
  const saved: Array<Record<string, unknown>> = [];
  const generator = new CoverLetterGenerator({
    careerRepo: {
      async getJob(id: string) {
        return id === JOB ? ({ id, companyId: "c1", title: "Platform Engineer", description: "Hiring Co builds logistics software.", rawDescription: "", requirements: [], technologies: [] } as never) : null;
      },
      async getCompany() {
        return { name: "Hiring Co" } as never;
      },
      async getProfileVersion() {
        return 2;
      },
    },
    getProfile: async () => profile,
    getApplicationDetails: async () => null,
    textProviders: {
      openai: {
        async generateText(input: { user: string }) {
          prompts.push(input.user);
          return { text: JSON.stringify(modelOutput), model: "fake" };
        },
      },
      anthropic: {} as never,
    } as never,
    defaultTextProvider: "openai",
    documents: {
      async save(input) {
        saved.push(input as never);
        return { document: { id: "d1" } as never, created: true };
      },
    },
    renderPdf: async () => Buffer.from("%PDF"),
  });
  return { generator, prompts, saved };
}

const output = {
  paragraphs: [
    { sentences: [{ text: "Hiring Co builds logistics software, which is why this role stood out.", evidence: [{ source: "JOB", quote: "Hiring Co builds logistics software" }] }] },
    {
      sentences: [
        { text: "I led a team of 6 engineers building a payments platform.", evidence: [{ source: "PROFILE", quote: "Led a team of 6 engineers" }] },
        { text: "I scaled it to 1 million users.", evidence: [{ source: "PROFILE", quote: "scaled it to 1 million users" }] },
      ],
    },
  ],
};

test("generates a grounded letter, with greeting and sign-off added by code and no name sent to the model", async () => {
  const { generator, prompts, saved } = setup(output);
  await generator.generate(JOB);
  assert.ok(!prompts[0]!.includes("Dana"));
  assert.ok(!prompts[0]!.includes("SecretEmployer"));
  const content = saved[0]!.content as CoverLetterContent;
  assert.equal(saved[0]!.type, "COVER_LETTER");
  assert.equal(saved[0]!.origin, "GENERATED");
  assert.equal(content.greeting, "Dear Hiring Co hiring team,");
  assert.equal(content.signOff, "Best regards,\nDana Example");
  assert.deepEqual(content.paragraphs, [
    "Hiring Co builds logistics software, which is why this role stood out.",
    "I led a team of 6 engineers building a payments platform.",
  ]);
  assert.equal(content.droppedSentences, 1);
});

test("saves nothing when no sentence survives grounding", async () => {
  const { generator, saved } = setup({ paragraphs: [{ sentences: [{ text: "I am great.", evidence: [] }] }] });
  await assert.rejects(generator.generate(JOB), AppError);
  assert.equal(saved.length, 0);
});

test("saves the user's edit verbatim as an EDITED version, and rejects an empty one", async () => {
  const { generator, saved } = setup(output);
  await generator.saveEdit(JOB, { greeting: "Hi team,", paragraphs: ["My own words."], signOff: "Thanks,\nDana" });
  const content = saved[0]!.content as CoverLetterContent;
  assert.equal(saved[0]!.origin, "EDITED");
  assert.equal(content.promptVersion, null);
  assert.deepEqual(content.paragraphs, ["My own words."]);
  await assert.rejects(generator.saveEdit(JOB, { greeting: "Hi", paragraphs: [], signOff: "x" }), (e: unknown) => e instanceof AppError && e.statusCode === 400);
});

test("the PDF renderer produces a PDF", async () => {
  const { generator, saved } = setup(output);
  await generator.generate(JOB);
  const pdf = await buildCoverLetterPdf(saved[0]!.content as CoverLetterContent);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});
