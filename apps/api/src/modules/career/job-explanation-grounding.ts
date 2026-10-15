import type {
  ExplanationClaim,
  ExplanationEvidence,
  GroundedJobExplanation,
  JobEligibilityStatus,
  JobExplanation,
} from "@studio/shared";

// Evidence check for the explanation agent (JOB-012). The model is asked to quote its
// evidence; this verifies every quote against the text it claims to come from, so a
// conclusion shown to the user rests on the job's own description or the saved profile, not
// on the model's word. Pure and deterministic: same explanation and texts, same result.
//
// - A quote counts only if it appears in its stated source (case, whitespace, curly quotes
//   and dash styles ignored) and is long enough to prove something.
// - Material sections need evidence: a matched requirement needs a profile quote (it is a
//   claim about the candidate), a gap or a geographic or compensation claim needs a job
//   quote. A claim left without one is dropped.
// - Elsewhere a FACT without valid evidence is downgraded to INFERENCE, never kept as fact.
// - When the eligibility rules said UNKNOWN, no geographic claim stays a FACT (spec A03:
//   unknown eligibility is never represented as confirmed).

const MIN_QUOTE_LENGTH = 8;

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteAppearsIn(quote: string, text: string): boolean {
  const needle = normalizeForMatch(quote).replace(/[.,;:]+$/, "");
  if (needle.length < MIN_QUOTE_LENGTH) return false;
  return normalizeForMatch(text).includes(needle);
}

type Requirement = "PROFILE" | "JOB" | null;

const SECTION_REQUIREMENTS = {
  whyShortlisted: null,
  matchedRequirements: "PROFILE",
  gaps: "JOB",
  geographicEligibility: "JOB",
  compensation: "JOB",
  technicalRelevance: null,
  applicationRisks: null,
} as const satisfies Record<string, Requirement>;

type ClaimSection = keyof typeof SECTION_REQUIREMENTS;

export type GroundingContext = {
  jobText: string;
  profileText: string;
  eligibility: JobEligibilityStatus;
};

export function groundExplanation(
  raw: JobExplanation,
  context: GroundingContext,
): { explanation: GroundedJobExplanation; evidence: ExplanationEvidence[] } {
  let droppedClaims = 0;
  let downgradedClaims = 0;
  let droppedQuotes = 0;
  const evidence: ExplanationEvidence[] = [];
  const seen = new Set<string>();

  const isValid = (item: ExplanationEvidence) =>
    quoteAppearsIn(item.quote, item.source === "JOB" ? context.jobText : context.profileText);

  const groundSection = (section: ClaimSection, claims: ExplanationClaim[]): ExplanationClaim[] => {
    const requirement: Requirement = SECTION_REQUIREMENTS[section];
    const kept: ExplanationClaim[] = [];
    for (const claim of claims) {
      const valid = claim.evidence.filter(isValid);
      droppedQuotes += claim.evidence.length - valid.length;

      if (requirement && !valid.some((item) => item.source === requirement)) {
        droppedClaims += 1;
        continue;
      }

      let kind = claim.kind;
      const unknownGeography = section === "geographicEligibility" && context.eligibility === "UNKNOWN";
      if (kind === "FACT" && (valid.length === 0 || unknownGeography)) {
        kind = "INFERENCE";
        downgradedClaims += 1;
      }

      for (const item of valid) {
        const key = `${item.source}:${normalizeForMatch(item.quote)}`;
        if (!seen.has(key)) {
          seen.add(key);
          evidence.push(item);
        }
      }
      kept.push({ ...claim, kind, evidence: valid });
    }
    return kept;
  };

  const sections = Object.fromEntries(
    (Object.keys(SECTION_REQUIREMENTS) as ClaimSection[]).map((section) => [
      section,
      groundSection(section, raw[section]),
    ]),
  ) as Record<ClaimSection, ExplanationClaim[]>;

  return {
    explanation: {
      ...raw,
      ...sections,
      grounding: { droppedClaims, downgradedClaims, droppedQuotes },
    },
    evidence,
  };
}
