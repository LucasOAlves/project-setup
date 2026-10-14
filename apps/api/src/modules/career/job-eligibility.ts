import { extractRegions, type Region } from "./job-normalization.js";

// Hard eligibility rules (spec A03, JOB-007), applied before any scoring or model call.
// Deterministic and evidence-first: every decision carries the exact text that caused it.
// Three outcomes, kept strictly apart:
//   EXCLUDED  — the posting says something that rules the candidate out
//   ELIGIBLE  — the posting says something that confirms the candidate can apply
//   UNKNOWN   — it says neither; never shown as eligible (spec: "Unknown eligibility must not
//               be represented as confirmed")
// An exclusion always wins over a confirmation: "Worldwide" in the location does not undo
// "must be authorized to work in the United States" in the description.

export type EligibilityStatus = "ELIGIBLE" | "EXCLUDED" | "UNKNOWN";

export type EligibilityRule =
  | "REGION_ACCEPTED"
  | "REGION_RESTRICTED"
  | "ONSITE_ABROAD"
  | "US_RESIDENCY"
  | "WORK_AUTHORIZATION"
  | "OPEN_TO_CANDIDATE";

export type EligibilityReason = {
  rule: EligibilityRule;
  effect: "EXCLUDES" | "CONFIRMS";
  field: "title" | "location" | "description";
  quote: string;
};

export type EligibilityResult = { status: EligibilityStatus; reasons: EligibilityReason[] };

export type CandidateEligibility = {
  // Location regions under which the candidate can be hired.
  acceptedRegions: Region[];
  // Where the candidate lives: on-site work here is not "abroad".
  homeRegions: Region[];
  // Countries the candidate is authorized to work in, as they appear in postings.
  workAuthorization: RegExp;
};

// The spec's target: a Brazil-based professional applying to international remote roles.
export const BRAZIL_REMOTE_CANDIDATE: CandidateEligibility = {
  acceptedRegions: ["WORLDWIDE", "LATAM", "AMERICAS", "BRAZIL"],
  homeRegions: ["BRAZIL"],
  workAuthorization: /^(brazil|brasil)$/i,
};

type JobText = { title: string; location: string; description: string };

const ONSITE_LOCATION = /\b(on-?site|in[- ]office|office[- ]based|hybrid)\b/i;

const ONSITE_DESCRIPTION =
  /\bthis (role|position|job) is (fully )?(on-?site|hybrid|in[- ]office)\b|\b\d\s*days? (a|per) week (in|at) (the|our) office\b|\bmust (work|be) (on-?site|in the office)\b/i;

const US_RESIDENCY = [
  /\b(must|should|need to|required to) (be )?(based|located|reside|residing|live|living) in the (US|U\.S\.|USA|United States)\b/i,
  /\b(US|U\.S\.|USA)[- ](only|residents only|based only)\b/,
  /\bUS ONLY\b/i,
  /\bunited states only\b/i,
  /\b(residents|citizens) of the (US|U\.S\.|USA|United States) only\b/i,
];

const US_STATUS = [/\bU\.?S\.? citizen(ship)?\b/, /\bsecurity clearance\b/i, /\bgreen card\b/i];

// "Authorized to work in <country>": explicit country names only, so ordinary phrases like
// "the right to work in a small team" never match.
const AUTHORIZATION =
  /\b(authori[sz]ed|eligible|legally (able|permitted)|(the )?right|permission|permitted) to work in (the )?(?<country>US|U\.S\.|USA|United States|UK|United Kingdom|EU|European Union|Europe|Canada|Australia|Germany|Netherlands|Ireland|France|Spain|Portugal|India|Brazil|Brasil)\b/i;

const OPEN_TO_CANDIDATE =
  /\b(work|hire|hiring|candidates?|applicants?|anyone) (from|in) anywhere\b|\bwork from anywhere\b|\bremote,? worldwide\b|\bworldwide remote\b|\banywhere in the world\b|\b(candidates?|applicants?|people|talent) (from|in|based in) (latam|latin america|south america|brazil|brasil)\b/i;

const MAX_QUOTE = 300;

export function evaluateEligibility(job: JobText, candidate: CandidateEligibility): EligibilityResult {
  const atHome = extractRegions(job.location).some((region) => candidate.homeRegions.includes(region));
  const reasons: EligibilityReason[] = [
    ...locationReasons(job.location, candidate),
    ...textReasons("title", [job.title], candidate, atHome),
    ...textReasons("description", sentences(job.description), candidate, atHome),
  ];

  const status: EligibilityStatus = reasons.some((r) => r.effect === "EXCLUDES")
    ? "EXCLUDED"
    : reasons.some((r) => r.effect === "CONFIRMS")
      ? "ELIGIBLE"
      : "UNKNOWN";
  return { status, reasons };
}

function locationReasons(location: string, candidate: CandidateEligibility): EligibilityReason[] {
  const quote = cap(location.trim());
  if (!quote) return [];

  const regions = extractRegions(location);
  const atHome = regions.some((region) => candidate.homeRegions.includes(region));

  if (ONSITE_LOCATION.test(location) && !atHome) {
    return [{ rule: "ONSITE_ABROAD", effect: "EXCLUDES", field: "location", quote }];
  }
  if (regions.some((region) => candidate.acceptedRegions.includes(region))) {
    return [{ rule: "REGION_ACCEPTED", effect: "CONFIRMS", field: "location", quote }];
  }
  if (regions.length > 0) {
    return [{ rule: "REGION_RESTRICTED", effect: "EXCLUDES", field: "location", quote }];
  }
  return [];
}

function textReasons(
  field: "title" | "description",
  parts: string[],
  candidate: CandidateEligibility,
  atHome: boolean,
): EligibilityReason[] {
  const reasons: EligibilityReason[] = [];
  const add = (rule: EligibilityRule, effect: EligibilityReason["effect"], text: string) => {
    if (!reasons.some((r) => r.rule === rule)) {
      reasons.push({ rule, effect, field, quote: cap(text.trim()) });
    }
  };

  for (const part of parts) {
    if (US_RESIDENCY.some((pattern) => pattern.test(part))) add("US_RESIDENCY", "EXCLUDES", part);

    const authorization = part.match(AUTHORIZATION);
    const country = authorization?.groups?.country ?? "";
    if (authorization && !candidate.workAuthorization.test(country)) {
      add("WORK_AUTHORIZATION", "EXCLUDES", part);
    }
    if (US_STATUS.some((pattern) => pattern.test(part))) add("WORK_AUTHORIZATION", "EXCLUDES", part);

    if (field === "description" && !atHome && ONSITE_DESCRIPTION.test(part)) add("ONSITE_ABROAD", "EXCLUDES", part);
    if (OPEN_TO_CANDIDATE.test(part)) add("OPEN_TO_CANDIDATE", "CONFIRMS", part);
  }
  return reasons;
}

function sentences(text: string): string[] {
  return text
    .replace(/<[^>]*>/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function cap(text: string): string {
  return text.length <= MAX_QUOTE ? text : `${text.slice(0, MAX_QUOTE - 1)}…`;
}
