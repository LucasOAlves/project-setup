import assert from "node:assert/strict";
import test from "node:test";
import { personaPayloadSchema } from "./persona.ts";

test("rejects a persona missing evidence on a proof point", () => {
  assert.throws(() =>
    personaPayloadSchema.parse({
      positioningStatement: "A platform engineer.",
      coreExpertise: ["Platform"],
      supportingExpertise: [],
      technologies: ["Kubernetes"],
      industries: [],
      careerNarrative: "Worked on platforms.",
      seniority: "Senior IC",
      technicalDepth: "Hands-on platform work.",
      leadershipExposure: "No people management mentioned.",
      differentiators: [],
      proofPoints: [{ claim: "Led a team of 40", evidence: "" }],
      targetAudience: "Engineers",
      desiredPerception: "Practical",
      contentPillars: ["Platform"],
      strongAuthorityTopics: [],
      credibleTopics: [],
      adjacentTopics: [],
      riskyTopics: [],
      professionalKeywords: [],
      businessImpactThemes: [],
      repeatedCareerPatterns: [],
    }),
  );
});
