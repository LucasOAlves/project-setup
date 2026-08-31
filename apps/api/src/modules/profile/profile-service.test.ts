import assert from "node:assert/strict";
import test from "node:test";
import type { TextGenerationProvider } from "../ai/text-generation-provider.ts";
import { ProfileService, detectImageMime } from "./profile-service.ts";

const textMap = (text: TextGenerationProvider) => ({ openai: text, anthropic: text }) as const;
const noTextCalls: TextGenerationProvider = {
  async generateText() {
    assert.fail("must not call the model");
  },
};

function fakeRecord(experiences: Array<Record<string, unknown>> = []) {
  return {
    profile: {
      id: "00000000-0000-4000-8000-000000000001",
      fullName: "",
      headline: "Staff Platform Engineer",
      currentJobTitle: "",
      currentCompany: "",
      about: "",
      topSkills: [],
      technologies: [],
      industries: [],
      yearsOfExperience: null,
      architectureExperience: "",
      leadershipExperience: "",
      businessImpact: "",
      subjectsOfInterest: [],
      subjectsToAvoid: [],
      targetAudience: "",
      preferredLanguage: "English",
      positioning: [],
      desiredPerception: "",
      writingTones: [],
      postLength: "MEDIUM",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    experiences: experiences.map((experience, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index}`,
      role: "",
      company: "",
      startPeriod: "",
      endPeriod: "",
      description: "",
      responsibilities: "",
      achievements: "",
      technologies: [],
      measurableOutcomes: "",
      sortOrder: index,
      ...experience,
    })),
    samples: [],
    photos: [],
  };
}

test("addExperience appends to the existing experiences and re-saves the whole profile", async () => {
  let savedInput: unknown;
  const service = new ProfileService(
    {
      async getWorkspaceProfile() {
        return fakeRecord([{ role: "Staff Engineer", company: "Nimbus" }]);
      },
      async upsertProfile(input: unknown) {
        savedInput = input;
        const typed = input as { experiences: Array<Record<string, unknown>> };
        return fakeRecord(typed.experiences);
      },
    } as never,
    {} as never,
    8_000_000,
    textMap(noTextCalls),
    "openai",
  );

  const updated = await service.addExperience({
    role: "",
    company: "",
    description: "Migrating an undocumented legacy system to a documented one.",
  });

  assert.equal(updated.experiences.length, 2);
  const persisted = savedInput as { experiences: Array<{ description: string }> };
  assert.equal(persisted.experiences.length, 2);
  assert.equal(
    persisted.experiences[1]?.description,
    "Migrating an undocumented legacy system to a documented one.",
  );
});

test("addExperience rejects an invalid experience payload", async () => {
  const service = new ProfileService(
    {
      async getWorkspaceProfile() {
        assert.fail("must validate before reading the profile");
      },
    } as never,
    {} as never,
    8_000_000,
    textMap(noTextCalls),
    "openai",
  );

  await assert.rejects(() => service.addExperience({ technologies: "not-an-array" }));
});

test("detects png jpeg and webp magic bytes", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(8)]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const webp = Buffer.alloc(12);
  webp.write("RIFF", 0);
  webp.write("WEBP", 8);

  assert.equal(detectImageMime(png), "image/png");
  assert.equal(detectImageMime(jpeg), "image/jpeg");
  assert.equal(detectImageMime(webp), "image/webp");
  assert.equal(detectImageMime(Buffer.from("not-an-image")), null);
});

async function buildTestPdf(text: string): Promise<Buffer> {
  const { default: PDFDocument } = await import("pdfkit");
  const doc = new PDFDocument();
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  doc.text(text);
  doc.end();
  return done;
}

test("extractResumeDraft parses the PDF and validates the model's structured output", async () => {
  const pdfBytes = await buildTestPdf("Jordan Rivera, Staff Platform Engineer");
  const service = new ProfileService(
    {} as never,
    {} as never,
    8_000_000,
    textMap({
      async generateText() {
        return {
          text: JSON.stringify({
            fullName: "Jordan Rivera",
            headline: "Staff Platform Engineer",
            experiences: [],
          }),
          model: "test-model",
        };
      },
    }),
    "openai",
  );

  const draft = await service.extractResumeDraft(pdfBytes);
  assert.equal(draft.fullName, "Jordan Rivera");
  assert.equal(draft.headline, "Staff Platform Engineer");
});

test("extractResumeDraft rejects a model response that fails the schema", async () => {
  const pdfBytes = await buildTestPdf("Jordan Rivera, Staff Platform Engineer");
  const service = new ProfileService(
    {} as never,
    {} as never,
    8_000_000,
    textMap({
      async generateText() {
        return { text: JSON.stringify({ yearsOfExperience: "a lot" }), model: "test-model" };
      },
    }),
    "openai",
  );

  await assert.rejects(() => service.extractResumeDraft(pdfBytes));
});
