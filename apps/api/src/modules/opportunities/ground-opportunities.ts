import type { ModelOpportunityEvaluation, OpportunityPayload, PersonaPayload } from "@studio/shared";
import { combineMatchScore, isRiskyForPersona, type ScoredCandidate } from "./relevance.js";

export type GroundedOpportunity = {
  articleId: string;
  matchScore: number;
  payload: OpportunityPayload;
};

export function groundEvaluations(input: {
  evaluations: ModelOpportunityEvaluation[];
  candidates: ScoredCandidate[];
  persona: PersonaPayload;
}): GroundedOpportunity[] {
  const byId = new Map(input.candidates.map((candidate) => [candidate.articleId, candidate]));
  const seenArticles = new Set<string>();
  const kept: GroundedOpportunity[] = [];

  const ranked = [...input.evaluations].sort(
    (left, right) => right.semanticMatch - left.semanticMatch,
  );

  for (const evaluation of ranked) {
    if (!evaluation.keep || !evaluation.opportunity) {
      continue;
    }
    const candidate = byId.get(evaluation.articleId);
    if (!candidate || seenArticles.has(evaluation.articleId)) {
      continue;
    }
    if (evaluation.opportunity.evidence.length === 0) {
      continue;
    }
    if (
      isRiskyForPersona(evaluation.opportunity.topic, riskyTopics(input.persona)) ||
      isRiskyForPersona(candidate.title, riskyTopics(input.persona))
    ) {
      continue;
    }

    const matchScore = combineMatchScore(candidate.combined, evaluation.semanticMatch);
    seenArticles.add(evaluation.articleId);
    kept.push({
      articleId: evaluation.articleId,
      matchScore,
      payload: evaluation.opportunity,
    });
    if (kept.length === 3) {
      break;
    }
  }

  return kept.sort((left, right) => right.matchScore - left.matchScore);
}

function riskyTopics(persona: PersonaPayload): string[] {
  return persona.riskyTopics.map((item) => item.topic);
}
