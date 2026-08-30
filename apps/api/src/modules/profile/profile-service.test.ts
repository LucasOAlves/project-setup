import assert from "node:assert/strict";
import test from "node:test";
import { ProfileService, detectImageMime } from "./profile-service.ts";

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
