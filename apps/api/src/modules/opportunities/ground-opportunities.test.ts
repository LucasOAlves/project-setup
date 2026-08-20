import assert from "node:assert/strict";
import test from "node:test";
import type { ModelOpportunityEvaluation, PersonaPayload } from "@studio/shared";
import { groundEvaluations } from "./ground-opportunities.ts";
import type { ScoredCandidate } from "./relevance.ts";

const payload = {
  topic: "Kubernetes 1.32",
  sourceEvent: "Kubernetes 1.32 released",
  whyItMatters: "Scheduling changes affect platform teams.",
  whyItFits: "This person runs Kubernetes platforms at Nimbus.",
  audienceCare: "Platform leads decide upgrade risk.",
  targetAudience: "Platform engineers",
  thesis: "The overlooked part is the scheduler, not the headline feature.",
  pointOfView: "Upgrade when the operational contract is clear.",
  storytellingDirection: "Current event to production implication",
  readerTakeaway: "Measure the operational contract, not the demo.",
  credibilityRisk: "Do not claim cluster counts not in the profile.",
  evidence: ["Staff Engineer at Nimbus", "Skill Kubernetes"],
  angle: "PRODUCTION_REALITY" as const,
};

const persona = (): PersonaPayload => ({
  positioningStatement: "Platform engineer",
  coreExpertise: ["Platform engineering"],
  supportingExpertise: [],
  technologies: ["Kubernetes"],
  industries: [],
  careerNarrative: "Builds platforms",
  seniority: "Staff-plus",
  technicalDepth: "Hands-on",
  leadershipExposure: "None claimed",
  differentiators: [],
  proofPoints: [],
  targetAudience: "Engineers",
  desiredPerception: "Practical",
  contentPillars: ["Reliability"],
  strongAuthorityTopics: [{ topic: "Kubernetes", evidence: "Repeated work" }],
  credibleTopics: [],
  adjacentTopics: [],
  riskyTopics: [{ topic: "Quantum computing", evidence: "None" }],
  professionalKeywords: ["Kubernetes"],
  businessImpactThemes: [],
  repeatedCareerPatterns: [],
});

const candidate = (id: string, title: string): ScoredCandidate => ({
  articleId: id,
  title,
  description: title,
  source: "Kubernetes",
  url: `https://kubernetes.io/${id}`,
  publishedAt: new Date("2026-08-16"),
  overlap: 80,
  recency: 90,
  sourceQuality: 100,
  combined: 88,
});

test("drops rejected unknown and risky items and does not pad to three", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  const evaluations: ModelOpportunityEvaluation[] = [
    {
      articleId: a,
      keep: true,
      rejectReason: null,
      semanticMatch: 80,
      opportunity: payload,
    },
    {
      articleId: b,
      keep: false,
      rejectReason: "Would only summarize the article",
      semanticMatch: 20,
      opportunity: null,
    },
    {
      articleId: "33333333-3333-4333-8333-333333333333",
      keep: true,
      rejectReason: null,
      semanticMatch: 99,
      opportunity: { ...payload, topic: "Unknown article" },
    },
    {
      articleId: a,
      keep: true,
      rejectReason: null,
      semanticMatch: 70,
      opportunity: { ...payload, topic: "Duplicate article" },
    },
  ];

  const kept = groundEvaluations({
    evaluations,
    candidates: [candidate(a, "Kubernetes 1.32 released"), candidate(b, "Ignore me")],
    persona: persona(),
  });

  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.articleId, a);
});

test("rejects opportunities that collide with risky topics", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const kept = groundEvaluations({
    evaluations: [
      {
        articleId: id,
        keep: true,
        rejectReason: null,
        semanticMatch: 90,
        opportunity: { ...payload, topic: "Quantum computing breakthrough" },
      },
    ],
    candidates: [candidate(id, "Quantum computing breakthrough")],
    persona: persona(),
  });
  assert.equal(kept.length, 0);
});
