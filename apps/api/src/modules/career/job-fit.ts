import type { JobFitResult, JobPublic, ProfilePublic } from "@studio/shared";

// Deterministic, explainable Job Fit scoring — see .skills/job-fit-analysis and
// .skills/ai-vs-deterministic. No model call: every dimension is a rule over two structured
// records (Job, Profile), so the result is exact and reproducible, not a model's opinion.
// This mirrors the shape of apps/api/src/modules/opportunities/relevance.ts (weighted
// deterministic sub-scores -> combined score), generalized from content relevance to job fit.

const ARCHITECTURE_KEYWORDS = [
  "architecture",
  "system design",
  "scalab",
  "distributed system",
  "microservice",
  "design pattern",
];

const LEADERSHIP_KEYWORDS = ["lead", "mentor", "manage", "leadership"];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function skillsMatch(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function jobText(job: JobPublic): string {
  return [job.title, job.description, ...job.requirements, ...job.preferredQualifications]
    .join(" ")
    .toLowerCase();
}

function experienceText(profile: ProfilePublic): string {
  return profile.experiences
    .map((experience) => `${experience.description} ${experience.responsibilities} ${experience.achievements}`)
    .join(" ")
    .toLowerCase();
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function scoreTechnical(job: JobPublic, profile: ProfilePublic): { score: number; matched: string[]; missing: string[] } {
  const required = dedupe(job.technologies);
  if (required.length === 0) {
    return { score: 100, matched: [], missing: [] };
  }

  const profileSkills = dedupe([
    ...profile.technologies,
    ...profile.topSkills,
    ...profile.experiences.flatMap((experience) => experience.technologies),
  ]);

  const matched: string[] = [];
  const missing: string[] = [];
  for (const skill of required) {
    if (profileSkills.some((candidate) => skillsMatch(skill, candidate))) {
      matched.push(skill);
    } else {
      missing.push(skill);
    }
  }

  return { score: Math.round((matched.length / required.length) * 100), matched, missing };
}

// Seniority bands are intentionally coarse keyword matches, not an NLP model — a job posting's
// "seniority" field is short, structured input the user typed, not prose to interpret.
function seniorityBand(text: string): number | null {
  const normalized = text.toLowerCase();
  if (!normalized.trim()) return null;
  if (/(principal|director|vp|head of)/.test(normalized)) return 5;
  if (/staff/.test(normalized)) return 4;
  if (/senior|sr\./.test(normalized)) return 3;
  if (/mid|intermediate/.test(normalized)) return 2;
  if (/junior|jr\.|entry/.test(normalized)) return 1;
  return null;
}

function yearsToBand(years: number | null): number | null {
  if (years === null) return null;
  if (years < 2) return 1;
  if (years < 5) return 2;
  if (years < 8) return 3;
  if (years < 12) return 4;
  return 5;
}

function scoreSeniority(job: JobPublic, profile: ProfilePublic): number {
  const jobBand = seniorityBand(job.seniority);
  const profileBand = yearsToBand(profile.yearsOfExperience);
  if (jobBand === null || profileBand === null) {
    return 70; // Not enough structured signal on one side to score confidently either way.
  }
  const distance = Math.abs(jobBand - profileBand);
  return Math.max(0, 100 - distance * 25);
}

function scoreEvidenceDimension(
  job: JobPublic,
  profile: ProfilePublic,
  keywords: string[],
  profileFreeText: string,
): { score: number; required: boolean; hasEvidence: boolean } {
  const required = hasAnyKeyword(jobText(job), keywords);
  if (!required) {
    return { score: 100, required: false, hasEvidence: false };
  }
  const hasEvidence =
    Boolean(profileFreeText.trim()) || hasAnyKeyword(experienceText(profile), keywords);
  return { score: hasEvidence ? 90 : 30, required: true, hasEvidence };
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function computeJobFit(job: JobPublic, profile: ProfilePublic): JobFitResult {
  const technical = scoreTechnical(job, profile);
  const seniority = scoreSeniority(job, profile);
  const architecture = scoreEvidenceDimension(
    job,
    profile,
    ARCHITECTURE_KEYWORDS,
    profile.architectureExperience,
  );
  const leadership = scoreEvidenceDimension(
    job,
    profile,
    LEADERSHIP_KEYWORDS,
    profile.leadershipExperience,
  );

  const overall = Math.round(
    0.45 * technical.score + 0.2 * seniority + 0.2 * architecture.score + 0.15 * leadership.score,
  );

  const strengths = [...technical.matched];
  if (architecture.required && architecture.hasEvidence) strengths.push("Architecture experience");
  if (leadership.required && leadership.hasEvidence) strengths.push("Technical leadership");

  const gaps = [...technical.missing];
  if (architecture.required && !architecture.hasEvidence) gaps.push("Architecture / system design evidence");
  if (leadership.required && !leadership.hasEvidence) gaps.push("Leadership evidence");

  const recommendation =
    overall >= 80 ? "STRONG_APPLY" : overall >= 60 ? "APPLY" : overall >= 40 ? "STRETCH" : "WEAK_FIT";

  return {
    overall,
    dimensions: {
      technical: technical.score,
      seniority,
      architecture: architecture.score,
      leadership: leadership.score,
    },
    strengths,
    gaps,
    recommendation,
  };
}
