import assert from "node:assert/strict";
import test from "node:test";
import type { PersonaPayload } from "@studio/shared";
import { buildSearchTopics } from "./search-topics.ts";

const persona = (overrides: Partial<PersonaPayload> = {}): PersonaPayload => ({
  positioningStatement: "Platform engineer",
  coreExpertise: ["Platform engineering"],
  supportingExpertise: ["Go"],
  technologies: ["Kubernetes"],
  industries: ["SaaS"],
  careerNarrative: "Builds platforms",
  seniority: "Staff-plus",
  technicalDepth: "Hands-on",
  leadershipExposure: "Tech lead",
  differentiators: [],
  proofPoints: [],
  targetAudience: "Engineers",
  desiredPerception: "Practical",
  contentPillars: ["Reliability"],
  strongAuthorityTopics: [{ topic: "Kubernetes internals", evidence: "Repeated K8s work" }],
  credibleTopics: [{ topic: "AWS networking", evidence: "Some cloud work" }],
  adjacentTopics: [{ topic: "Mobile", evidence: "Weak" }],
  riskyTopics: [{ topic: "Quantum computing", evidence: "None" }],
  professionalKeywords: ["EKS"],
  businessImpactThemes: [],
  repeatedCareerPatterns: [],
  ...overrides,
});

test("builds queries from authority not from risky topics", () => {
  const topics = buildSearchTopics(persona());
  assert.ok(topics.includes("Kubernetes internals"));
  assert.ok(topics.includes("Kubernetes"));
  assert.equal(topics.includes("Quantum computing"), false);
});
