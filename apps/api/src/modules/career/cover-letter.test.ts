import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groundCoverLetter } from "./cover-letter.js";

const profileText = [
  "Technologies: TypeScript, Node.js, PostgreSQL",
  "Led a team of 6 engineers building a payments platform.",
  "Cut checkout latency by 40%.",
].join("\n");
const jobText = "Hiring Co builds logistics software. You will own our Node.js and Kubernetes platform. Team of 30 engineers.";
const context = { profileText, jobText, profileTechnologies: ["TypeScript", "Node.js", "PostgreSQL"] };

const s = (text: string, ...evidence: Array<["PROFILE" | "JOB", string]>) => ({
  text,
  evidence: evidence.map(([source, quote]) => ({ source, quote })),
});

describe("groundCoverLetter", () => {
  it("keeps sentences whose quotes are in their sources and joins each paragraph", () => {
    const letter = groundCoverLetter(
      {
        paragraphs: [
          { sentences: [s("Hiring Co builds logistics software, and the platform role caught my attention.", ["JOB", "Hiring Co builds logistics software"]), s("I led a team of 6 engineers building a payments platform.", ["PROFILE", "Led a team of 6 engineers"])] },
          { sentences: [s("I cut checkout latency by 40%.", ["PROFILE", "Cut checkout latency by 40%"])] },
        ],
      },
      context,
    );
    assert.deepEqual(letter.paragraphs, [
      "Hiring Co builds logistics software, and the platform role caught my attention. I led a team of 6 engineers building a payments platform.",
      "I cut checkout latency by 40%.",
    ]);
    assert.equal(letter.droppedSentences, 0);
  });

  it("drops a sentence with no evidence or with a quote that is not in its source", () => {
    const letter = groundCoverLetter(
      {
        paragraphs: [
          {
            sentences: [
              s("I am passionate about your mission."),
              s("I led a team of 12 engineers.", ["PROFILE", "Led a team of 12 engineers"]),
              s("I cut checkout latency by 40%.", ["JOB", "Cut checkout latency by 40%"]),
            ],
          },
        ],
      },
      context,
    );
    assert.deepEqual(letter.paragraphs, []);
    assert.equal(letter.droppedSentences, 3);
  });

  it("drops a claim about the candidate backed only by the job posting", () => {
    const letter = groundCoverLetter(
      {
        paragraphs: [
          {
            sentences: [
              s("I have owned a Node.js platform like yours.", ["JOB", "own our Node.js and Kubernetes platform"]),
              s("You will own the Node.js platform.", ["JOB", "own our Node.js and Kubernetes platform"]),
            ],
          },
        ],
      },
      context,
    );
    assert.deepEqual(letter.paragraphs, ["You will own the Node.js platform."]);
    assert.equal(letter.droppedSentences, 1);
  });

  it("drops a sentence that adds a number or a technology its sources do not support", () => {
    const letter = groundCoverLetter(
      {
        paragraphs: [
          {
            sentences: [
              s("I cut checkout latency by 60%.", ["PROFILE", "Cut checkout latency by 40%"]),
              s("I led 6 engineers running Kubernetes.", ["PROFILE", "Led a team of 6 engineers"]),
              s("Your team of 30 engineers runs Node.js and Kubernetes.", ["JOB", "Team of 30 engineers"]),
              s("My Node.js and PostgreSQL work fits your team of 30.", ["PROFILE", "Led a team of 6 engineers"], ["JOB", "Team of 30 engineers"]),
            ],
          },
        ],
      },
      context,
    );
    assert.deepEqual(letter.paragraphs, [
      "Your team of 30 engineers runs Node.js and Kubernetes. My Node.js and PostgreSQL work fits your team of 30.",
    ]);
    assert.equal(letter.droppedSentences, 2);
  });

  it("keeps at most four paragraphs and drops empty ones", () => {
    const ok = s("I cut checkout latency by 40%.", ["PROFILE", "Cut checkout latency by 40%"]);
    const letter = groundCoverLetter(
      { paragraphs: [{ sentences: [] }, { sentences: [ok] }, { sentences: [ok] }, { sentences: [ok] }, { sentences: [ok] }, { sentences: [ok] }] },
      context,
    );
    assert.equal(letter.paragraphs.length, 4);
  });
});
