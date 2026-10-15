import {
  MATCH_DIMENSIONS,
  type FeedbackReason,
  type FeedbackSummary,
  type MatchDimensionName,
} from "@studio/shared";

// Relevance calibration (JOB-014): how the user's verdicts line up with matching v2. Pure.
// The summary informs a change to the match weights (spec A04: "adjustable through user
// feedback"); it does not change them by itself.

export type RatedEvaluation = {
  verdict: "RELEVANT" | "NOT_RELEVANT";
  reasons: FeedbackReason[];
  score: number | null;
  dimensions: Partial<Record<MatchDimensionName, { score: number; known: boolean }>> | null;
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function summarizeFeedback(entries: RatedEvaluation[], threshold: number): FeedbackSummary {
  const relevant = entries.filter((entry) => entry.verdict === "RELEVANT");
  const notRelevant = entries.filter((entry) => entry.verdict === "NOT_RELEVANT");

  const scored = entries.filter((entry) => entry.score !== null);
  const agreeing = scored.filter((entry) =>
    entry.verdict === "RELEVANT" ? (entry.score as number) >= threshold : (entry.score as number) < threshold,
  );

  const knownScores = (group: RatedEvaluation[], key: MatchDimensionName) =>
    group.flatMap((entry) => {
      const dimension = entry.dimensions?.[key];
      return dimension?.known ? [dimension.score] : [];
    });

  const dimensions = Object.fromEntries(
    MATCH_DIMENSIONS.map((key) => [
      key,
      { relevantAverage: average(knownScores(relevant, key)), notRelevantAverage: average(knownScores(notRelevant, key)) },
    ]),
  ) as FeedbackSummary["dimensions"];

  const counts = new Map<FeedbackReason, number>();
  for (const entry of entries) {
    for (const reason of entry.reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const reasons = [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    threshold,
    rated: entries.length,
    relevant: relevant.length,
    notRelevant: notRelevant.length,
    agreementRate: scored.length === 0 ? null : agreeing.length / scored.length,
    dimensions,
    reasons,
  };
}
