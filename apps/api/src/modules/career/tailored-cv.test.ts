import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { experienceBullets, groundTailoredCv, type TailoredCvProfile } from "./tailored-cv.js";

const EXP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const profile: TailoredCvProfile = {
  topSkills: ["System design", "Technical leadership"],
  technologies: ["TypeScript", "Node.js", "Angular", "PostgreSQL"],
  experiences: [
    {
      id: EXP_A,
      role: "Tech Lead",
      company: "Acme",
      startPeriod: "2021",
      endPeriod: "Present",
      description: "Led a team of 6 engineers building a payments platform.",
      responsibilities: "- Owned the Node.js service architecture\n- Ran code reviews and hiring loops",
      achievements: "Cut checkout latency by 40%. Migrated billing to PostgreSQL without downtime.",
      measurableOutcomes: "",
      technologies: ["Node.js", "PostgreSQL"],
    },
    {
      id: EXP_B,
      role: "Frontend Engineer",
      company: "Beta",
      startPeriod: "2018",
      endPeriod: "2021",
      description: "Built Angular dashboards for logistics customers.",
      responsibilities: "",
      achievements: "",
      measurableOutcomes: "",
      technologies: ["Angular"],
    },
  ],
};

const profileText = [
  "Technologies: TypeScript, Node.js, Angular, PostgreSQL",
  "Led a team of 6 engineers building a payments platform.",
  "Owned the Node.js service architecture",
  "Cut checkout latency by 40%. Migrated billing to PostgreSQL without downtime.",
  "Built Angular dashboards for logistics customers.",
].join("\n");

const jobText = "Senior Backend Engineer. Node.js, PostgreSQL and Kubernetes required; Golang is a plus.";

describe("experienceBullets", () => {
  it("splits list lines and sentences into numbered bullets, in field order, without list markers", () => {
    assert.deepEqual(experienceBullets(profile.experiences[0]!), [
      { id: `${EXP_A}#1`, text: "Led a team of 6 engineers building a payments platform." },
      { id: `${EXP_A}#2`, text: "Owned the Node.js service architecture" },
      { id: `${EXP_A}#3`, text: "Ran code reviews and hiring loops" },
      { id: `${EXP_A}#4`, text: "Cut checkout latency by 40%." },
      { id: `${EXP_A}#5`, text: "Migrated billing to PostgreSQL without downtime." },
    ]);
  });

  it("does not split on a dot inside a name like Node.js, and drops duplicates and blanks", () => {
    const bullets = experienceBullets({
      ...profile.experiences[0]!,
      description: "Owned the Node.js service architecture",
      responsibilities: "\n\n- Owned the Node.js service architecture\n* \n",
      achievements: "",
    });
    assert.deepEqual(bullets.map((bullet) => bullet.text), ["Owned the Node.js service architecture"]);
  });
});

describe("groundTailoredCv", () => {
  const raw = {
    rationale: "Backend payments work first.",
    summary: [
      { text: "Tech lead who led a team of 6 engineers on a payments platform.", evidence: ["Led a team of 6 engineers"] },
      { text: "Cut checkout latency by 40% on Node.js services.", evidence: ["Cut checkout latency by 40%"] },
    ],
    experiences: [
      { id: EXP_B, bulletIds: [] },
      { id: EXP_A, bulletIds: [`${EXP_A}#4`, `${EXP_A}#2`, `${EXP_A}#4`, `${EXP_B}#1`, "made-up#9"] },
    ],
    topSkillsOrder: ["Technical leadership"],
    technologiesOrder: ["PostgreSQL", "Node.js", "Rust"],
  };

  it("keeps supported summary sentences, the model's experience order and its chosen bullets, verbatim", () => {
    const cv = groundTailoredCv(raw, profile, { profileText, jobText });
    assert.deepEqual(cv.summary, [
      "Tech lead who led a team of 6 engineers on a payments platform.",
      "Cut checkout latency by 40% on Node.js services.",
    ]);
    assert.equal(cv.droppedSummarySentences, 0);
    assert.deepEqual(cv.experiences.map((item) => item.id), [EXP_B, EXP_A]);
    assert.deepEqual(cv.experiences[1]!.highlights, ["Cut checkout latency by 40%.", "Owned the Node.js service architecture"]);
    assert.equal(cv.experiences[1]!.company, "Acme");
  });

  it("falls back to an experience's first three bullets when the model picked none of its own", () => {
    const cv = groundTailoredCv(raw, profile, { profileText, jobText });
    assert.deepEqual(cv.experiences[0]!.highlights, ["Built Angular dashboards for logistics customers."]);
    const noPicks = groundTailoredCv({ ...raw, experiences: [] }, profile, { profileText, jobText });
    assert.equal(noPicks.experiences.find((item) => item.id === EXP_A)!.highlights.length, 3);
  });

  it("never drops an experience, skill or technology, and ignores ones the profile does not have", () => {
    const cv = groundTailoredCv(raw, profile, { profileText, jobText });
    assert.equal(cv.experiences.length, 2);
    assert.deepEqual(cv.topSkills, ["Technical leadership", "System design"]);
    assert.deepEqual(cv.technologies, ["PostgreSQL", "Node.js", "TypeScript", "Angular"]);
  });

  it("drops a summary sentence without evidence, or whose quote is not in the profile", () => {
    const cv = groundTailoredCv(
      {
        ...raw,
        summary: [
          { text: "Passionate engineer who loves hard problems.", evidence: [] },
          { text: "Led a team of 12 engineers.", evidence: ["Led a team of 12 engineers"] },
        ],
      },
      profile,
      { profileText, jobText },
    );
    assert.deepEqual(cv.summary, []);
    assert.equal(cv.droppedSummarySentences, 2);
  });

  it("drops a sentence that adds a number or a technology the profile does not have, even with a valid quote", () => {
    const cv = groundTailoredCv(
      {
        ...raw,
        summary: [
          { text: "Cut checkout latency by 60%.", evidence: ["Cut checkout latency by 40%"] },
          { text: "Owned Node.js and Kubernetes service architecture.", evidence: ["Owned the Node.js service architecture"] },
          { text: "Owned the Node.js service architecture.", evidence: ["Owned the Node.js service architecture"] },
        ],
      },
      profile,
      { profileText, jobText },
    );
    assert.deepEqual(cv.summary, ["Owned the Node.js service architecture."]);
    assert.equal(cv.droppedSummarySentences, 2);
  });

  it("keeps at most three summary sentences", () => {
    const sentence = { text: "Owned the Node.js service architecture.", evidence: ["Owned the Node.js service architecture"] };
    const cv = groundTailoredCv({ ...raw, summary: [sentence, sentence, sentence, sentence] }, profile, { profileText, jobText });
    assert.equal(cv.summary.length, 3);
  });

  it("lists technologies the job names that the profile lacks as gaps, never adding them to the CV", () => {
    const cv = groundTailoredCv(raw, profile, { profileText, jobText });
    assert.deepEqual(cv.gaps, ["Kubernetes", "Go"]);
    assert.ok(!cv.technologies.includes("Kubernetes"));
  });
});
