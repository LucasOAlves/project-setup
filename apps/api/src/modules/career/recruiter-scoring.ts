// Deterministic recruiter relevance scoring — same shape as job-fit.ts (weighted, explainable
// sub-scores, no model call). See .skills/job-fit-analysis; this is a second, simpler
// application of the same pattern rather than a reason to build a new one from scratch.

const RECRUITING_ROLE_KEYWORDS = [
  "recruit",
  "talent acquisition",
  "talent partner",
  "people",
  "staffing",
  "sourcer",
];

// Deliberately specific — a bare "director" would false-positive on "Sales Director" or
// "Director of Marketing", neither of which signals engineering-hiring relevance.
const HIRING_ROLE_KEYWORDS = [
  "hiring manager",
  "engineering manager",
  "tech lead",
  "vp of engineering",
  "head of engineering",
];

export type RecruiterScoreInput = {
  role: string;
  companyHasTrackedJob: boolean;
  linkedToJob: boolean;
};

function roleRelevance(role: string): number {
  const normalized = role.toLowerCase();
  if (!normalized.trim()) return 50; // No role captured yet — neutral, not a penalty.
  if (RECRUITING_ROLE_KEYWORDS.some((keyword) => normalized.includes(keyword))) return 100;
  if (HIRING_ROLE_KEYWORDS.some((keyword) => normalized.includes(keyword))) return 90;
  return 40; // A real role was given, but nothing suggests hiring responsibility.
}

export function scoreRecruiterRelevance(input: RecruiterScoreInput): number {
  const company = input.companyHasTrackedJob ? 100 : 40;
  const role = roleRelevance(input.role);
  const jobLink = input.linkedToJob ? 100 : 60;

  return Math.round(0.4 * company + 0.35 * role + 0.25 * jobLink);
}
