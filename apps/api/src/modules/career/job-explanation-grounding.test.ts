import assert from "node:assert/strict";
import test from "node:test";
import type { ExplanationClaim, JobExplanation } from "@studio/shared";
import { groundExplanation, quoteAppearsIn } from "./job-explanation-grounding.ts";

const JOB_TEXT = [
  "Senior Backend Engineer",
  "Remote — open to candidates in Latin America.",
  "We use TypeScript and Node.js on PostgreSQL. 5+ years of experience required.",
  "Experience with Kubernetes is a plus. Salary: USD 7,000–9,000 per month.",
  "You’ll mentor two engineers.",
].join("\n");

const PROFILE_TEXT = [
  "Senior Software Engineer",
  "Built TypeScript services on Node.js for a payments platform.",
  "Cut p95 latency by 40%.",
].join("\n");

function claim(overrides: Partial<ExplanationClaim> = {}): ExplanationClaim {
  return { statement: "A claim.", kind: "FACT", evidence: [], ...overrides };
}

function explanation(overrides: Partial<JobExplanation> = {}): JobExplanation {
  return {
    executiveSummary: "A strong backend match.",
    whyShortlisted: [],
    matchedRequirements: [],
    gaps: [],
    geographicEligibility: [],
    compensation: [],
    technicalRelevance: [],
    applicationRisks: [],
    cvEmphasis: [],
    interviewTopics: [],
    recommendedAction: "APPLY",
    confidence: "HIGH",
    ...overrides,
  };
}

function ground(raw: JobExplanation, eligibility: "ELIGIBLE" | "UNKNOWN" = "ELIGIBLE") {
  return groundExplanation(raw, { jobText: JOB_TEXT, profileText: PROFILE_TEXT, eligibility });
}

// --- quote matching ---------------------------------------------------------------------

test("quoteAppearsIn ignores case, whitespace, curly quotes and dash styles", () => {
  assert.ok(quoteAppearsIn("remote - open to   candidates in latin america", JOB_TEXT));
  assert.ok(quoteAppearsIn("You'll mentor two engineers", JOB_TEXT));
  assert.ok(quoteAppearsIn("USD 7,000-9,000 per month", JOB_TEXT));
});

test("quoteAppearsIn rejects text that is not in the source", () => {
  assert.ok(!quoteAppearsIn("open to candidates worldwide", JOB_TEXT));
});

test("quoteAppearsIn rejects quotes too short to prove anything", () => {
  assert.ok(!quoteAppearsIn("the", JOB_TEXT));
  assert.ok(!quoteAppearsIn("  Node ", JOB_TEXT));
});

// --- material sections need valid evidence ------------------------------------------------

test("a matched requirement backed by a real profile quote is kept as is", () => {
  const kept = claim({
    statement: "Has built TypeScript and Node.js services.",
    evidence: [
      { source: "JOB", quote: "We use TypeScript and Node.js on PostgreSQL." },
      { source: "PROFILE", quote: "Built TypeScript services on Node.js" },
    ],
  });
  const result = ground(explanation({ matchedRequirements: [kept] }));
  assert.deepEqual(result.explanation.matchedRequirements, [kept]);
  assert.deepEqual(result.explanation.grounding, { droppedClaims: 0, downgradedClaims: 0, droppedQuotes: 0 });
});

test("a matched requirement whose profile quote was invented is dropped", () => {
  const result = ground(
    explanation({
      matchedRequirements: [
        claim({
          statement: "Has run Kubernetes in production.",
          evidence: [
            { source: "JOB", quote: "Experience with Kubernetes is a plus." },
            { source: "PROFILE", quote: "Ran Kubernetes clusters in production" },
          ],
        }),
      ],
    }),
  );
  assert.deepEqual(result.explanation.matchedRequirements, []);
  assert.equal(result.explanation.grounding.droppedClaims, 1);
  assert.equal(result.explanation.grounding.droppedQuotes, 1);
});

test("a matched requirement with only job evidence is dropped: the match is a claim about the candidate", () => {
  const result = ground(
    explanation({
      matchedRequirements: [
        claim({ evidence: [{ source: "JOB", quote: "We use TypeScript and Node.js on PostgreSQL." }] }),
      ],
    }),
  );
  assert.deepEqual(result.explanation.matchedRequirements, []);
});

test("a quote attributed to the wrong source does not count", () => {
  const result = ground(
    explanation({
      matchedRequirements: [
        claim({ evidence: [{ source: "PROFILE", quote: "We use TypeScript and Node.js on PostgreSQL." }] }),
      ],
    }),
  );
  assert.deepEqual(result.explanation.matchedRequirements, []);
});

test("a gap must quote the job's requirement", () => {
  const real = claim({
    statement: "No Kubernetes on the profile.",
    evidence: [{ source: "JOB", quote: "Experience with Kubernetes is a plus." }],
  });
  const invented = claim({
    statement: "No Terraform on the profile.",
    evidence: [{ source: "JOB", quote: "Terraform experience required." }],
  });
  const result = ground(explanation({ gaps: [real, invented] }));
  assert.deepEqual(result.explanation.gaps, [real]);
});

test("geographic and compensation claims without a real job quote are dropped", () => {
  const result = ground(
    explanation({
      geographicEligibility: [claim({ evidence: [{ source: "JOB", quote: "Open to candidates worldwide." }] })],
      compensation: [claim({ statement: "Pays well." })],
    }),
  );
  assert.deepEqual(result.explanation.geographicEligibility, []);
  assert.deepEqual(result.explanation.compensation, []);
  assert.equal(result.explanation.grounding.droppedClaims, 2);
});

test("invalid quotes are removed from a claim that still has valid evidence", () => {
  const result = ground(
    explanation({
      compensation: [
        claim({
          evidence: [
            { source: "JOB", quote: "Salary: USD 7,000–9,000 per month." },
            { source: "JOB", quote: "Equity and a 20% bonus." },
          ],
        }),
      ],
    }),
  );
  assert.deepEqual(result.explanation.compensation[0]?.evidence, [
    { source: "JOB", quote: "Salary: USD 7,000–9,000 per month." },
  ]);
  assert.equal(result.explanation.grounding.droppedQuotes, 1);
});

// --- other sections: facts need evidence, inferences may stand alone -----------------------

test("an unsupported fact outside the material sections is downgraded to an inference", () => {
  const result = ground(explanation({ whyShortlisted: [claim({ statement: "The team is growing fast." })] }));
  assert.deepEqual(result.explanation.whyShortlisted, [
    claim({ statement: "The team is growing fast.", kind: "INFERENCE" }),
  ]);
  assert.equal(result.explanation.grounding.downgradedClaims, 1);
});

test("an inference without evidence is kept as an inference", () => {
  const inference = claim({ statement: "Likely a small team.", kind: "INFERENCE" });
  const result = ground(explanation({ applicationRisks: [inference] }));
  assert.deepEqual(result.explanation.applicationRisks, [inference]);
  assert.equal(result.explanation.grounding.downgradedClaims, 0);
});

// --- eligibility --------------------------------------------------------------------------

test("when the rules left eligibility unknown, no geographic claim is presented as a fact", () => {
  const result = ground(
    explanation({
      geographicEligibility: [
        claim({
          statement: "Hires from Brazil.",
          evidence: [{ source: "JOB", quote: "open to candidates in Latin America" }],
        }),
      ],
    }),
    "UNKNOWN",
  );
  assert.equal(result.explanation.geographicEligibility[0]?.kind, "INFERENCE");
  assert.equal(result.explanation.grounding.downgradedClaims, 1);
});

// --- collected evidence -------------------------------------------------------------------

test("the evidence list holds every surviving quote once", () => {
  const quote = { source: "JOB" as const, quote: "We use TypeScript and Node.js on PostgreSQL." };
  const result = ground(
    explanation({
      whyShortlisted: [claim({ evidence: [quote] })],
      technicalRelevance: [claim({ evidence: [quote, { source: "JOB", quote: "Not in the posting at all." }] })],
    }),
  );
  assert.deepEqual(result.evidence, [quote]);
});

test("free-text fields pass through unchanged", () => {
  const raw = explanation({ cvEmphasis: ["Lead with the payments work."], interviewTopics: ["Node.js performance"] });
  const result = ground(raw);
  assert.equal(result.explanation.executiveSummary, raw.executiveSummary);
  assert.deepEqual(result.explanation.cvEmphasis, raw.cvEmphasis);
  assert.deepEqual(result.explanation.interviewTopics, raw.interviewTopics);
  assert.equal(result.explanation.recommendedAction, "APPLY");
});
