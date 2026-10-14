import type { JobEmploymentType, JobEligibilityStatus } from "@studio/shared";
import { postingAgeDays } from "./job-normalization.js";

// Matching v2 (spec A04, JOB-011): an explainable 0-100 score over six weighted dimensions,
// computed deterministically from the job's own text and the verified profile. No model call,
// the same inputs always give the same score. Each dimension says whether the posting gave
// enough to score it (`known`), and confidence is the share of weight that was known, so
// "the posting doesn't say" lowers confidence instead of passing as a good or bad fit.
//
// Unlike computeJobFit (job-fit.ts), which reads fields the user typed on a tracked job, this
// reads the source text, because discovered jobs arrive with no structured technology list.

export const MATCHING_VERSION = "matching@2";

export type MatchDimension =
  | "technical"
  | "seniority"
  | "experience"
  | "geography"
  | "compensation"
  | "preferences";

export type MatchWeights = Record<MatchDimension, number>;

// The spec's initial hypotheses, to be calibrated by relevance feedback (JOB-014).
export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  technical: 0.3,
  seniority: 0.2,
  experience: 0.2,
  geography: 0.15,
  compensation: 0.1,
  preferences: 0.05,
};

export type MatchPreferences = {
  targetUsdMonthly: number;
  // Words a wanted role title contains.
  targetRoleKeywords: string[];
  maxPostingAgeDays: number;
};

export const DEFAULT_MATCH_PREFERENCES: MatchPreferences = {
  targetUsdMonthly: 6000,
  targetRoleKeywords: ["senior", "staff", "lead", "principal", "architect"],
  maxPostingAgeDays: 30,
};

export function matchPreferencesFromEnv(env: { MATCH_TARGET_USD_MONTHLY: number }): MatchPreferences {
  return { ...DEFAULT_MATCH_PREFERENCES, targetUsdMonthly: env.MATCH_TARGET_USD_MONTHLY };
}

export type MatchJob = {
  title: string;
  description: string;
  seniority: string;
  technologies: string[];
  requirements: string[];
  preferredQualifications: string[];
  employmentType: JobEmploymentType | null;
  salary: { usdMonthlyMin: number; usdMonthlyMax: number; approximate: boolean } | null;
  postedAt: Date | null;
};

export type MatchProfile = {
  topSkills: string[];
  technologies: string[];
  yearsOfExperience: number | null;
  architectureExperience: string;
  leadershipExperience: string;
  experiences: Array<{
    role: string;
    description: string;
    responsibilities: string;
    achievements: string;
    measurableOutcomes: string;
    technologies: string[];
  }>;
};

export type MatchFlag =
  | "STACK_UNKNOWN"
  | "SENIORITY_UNKNOWN"
  | "ELIGIBILITY_UNKNOWN"
  | "COMPENSATION_UNDISCLOSED"
  | "COMPENSATION_BELOW_TARGET"
  | "COMPENSATION_APPROXIMATE";

export type DimensionResult = { score: number; known: boolean; weight: number; notes: string[] };

export type MatchResult = {
  version: typeof MATCHING_VERSION;
  score: number;
  confidence: number;
  dimensions: Record<MatchDimension, DimensionResult>;
  matchedSkills: string[];
  missingSkills: string[];
  flags: MatchFlag[];
};

// --- technology vocabulary --------------------------------------------------------------

// Canonical name -> spellings found in postings. Deliberately no bare "go", "spring" or
// "express": they are ordinary English words.
const TECH_VOCABULARY: Array<[string, string[]]> = [
  ["TypeScript", ["typescript"]],
  ["JavaScript", ["javascript"]],
  ["Node.js", ["node.js", "nodejs", "node"]],
  ["Angular", ["angular", "angularjs"]],
  ["React", ["react", "react.js", "reactjs"]],
  ["Vue", ["vue", "vue.js", "vuejs"]],
  ["Svelte", ["svelte"]],
  ["Next.js", ["next.js", "nextjs"]],
  ["NestJS", ["nestjs", "nest.js"]],
  ["Express", ["express.js", "expressjs"]],
  ["Tailwind CSS", ["tailwind", "tailwind css", "tailwindcss"]],
  ["Java", ["java"]],
  ["Spring Boot", ["spring boot", "springboot"]],
  ["Kotlin", ["kotlin"]],
  ["Scala", ["scala"]],
  ["Go", ["golang"]],
  ["Rust", ["rust"]],
  ["Python", ["python"]],
  ["Django", ["django"]],
  ["FastAPI", ["fastapi"]],
  ["Ruby", ["ruby"]],
  ["Ruby on Rails", ["ruby on rails", "rails"]],
  ["PHP", ["php"]],
  ["Laravel", ["laravel"]],
  ["C#", ["c#"]],
  [".NET", [".net", "asp.net", "dotnet"]],
  ["Elixir", ["elixir"]],
  ["Swift", ["swift"]],
  ["PostgreSQL", ["postgresql", "postgres"]],
  ["MySQL", ["mysql"]],
  ["MongoDB", ["mongodb", "mongo"]],
  ["Redis", ["redis"]],
  ["Elasticsearch", ["elasticsearch"]],
  ["Kafka", ["kafka"]],
  ["RabbitMQ", ["rabbitmq"]],
  ["GraphQL", ["graphql"]],
  ["AWS", ["aws", "amazon web services"]],
  ["GCP", ["gcp", "google cloud"]],
  ["Azure", ["azure"]],
  ["Docker", ["docker"]],
  ["Kubernetes", ["kubernetes", "k8s"]],
  ["Terraform", ["terraform"]],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TECH_PATTERNS = TECH_VOCABULARY.map(([name, aliases]) => ({
  name,
  pattern: new RegExp(
    `(?<![a-z0-9])(?:${[...aliases].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|")})(?![a-z0-9#+])`,
    "i",
  ),
}));

const ALIAS_TO_CANONICAL = new Map<string, string>(
  TECH_VOCABULARY.flatMap(([name, aliases]) => [
    [name.toLowerCase(), name] as const,
    ...aliases.map((alias) => [alias, name] as const),
  ]),
);

function canonicalTech(value: string): string {
  const trimmed = value.trim();
  return ALIAS_TO_CANONICAL.get(trimmed.toLowerCase()) ?? trimmed;
}

// Technologies a text mentions, by canonical name, in order of first mention.
export function detectTechnologies(text: string): string[] {
  const found: Array<{ name: string; index: number }> = [];
  for (const { name, pattern } of TECH_PATTERNS) {
    const match = pattern.exec(text);
    if (match) found.push({ name, index: match.index });
  }
  return found.sort((a, b) => a.index - b.index).map((item) => item.name);
}

function dedupeCaseless(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --- weights ----------------------------------------------------------------------------

export function validateWeights(weights: MatchWeights): void {
  const values = Object.values(weights);
  if (values.some((value) => value < 0)) {
    throw new Error("Match weights cannot be negative.");
  }
  const sum = values.reduce((total, value) => total + value, 0);
  if (Math.abs(sum - 1) > 0.001) {
    throw new Error(`Match weights must sum to 1 (got ${sum.toFixed(3)}).`);
  }
}

// --- dimensions -------------------------------------------------------------------------

type Scored = { score: number; known: boolean; notes: string[] };

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function jobText(job: MatchJob): string {
  return [job.title, job.description, ...job.requirements, ...job.preferredQualifications].join("\n");
}

function experienceText(profile: MatchProfile): string {
  return profile.experiences
    .map((item) =>
      [item.role, item.description, item.responsibilities, item.achievements, item.measurableOutcomes].join(" "),
    )
    .join("\n");
}

function scoreTechnical(required: string[], profile: MatchProfile) {
  const profileSkills = new Set(
    [...profile.topSkills, ...profile.technologies, ...profile.experiences.flatMap((item) => item.technologies)].map(
      (skill) => canonicalTech(skill).toLowerCase(),
    ),
  );
  const matched = required.filter((skill) => profileSkills.has(skill.toLowerCase()));
  const missing = required.filter((skill) => !profileSkills.has(skill.toLowerCase()));

  if (required.length === 0) {
    return {
      matched,
      missing,
      result: { score: 50, known: false, notes: ["The posting names no technology."] } as Scored,
    };
  }
  const notes = [`Covers ${matched.length} of ${required.length} technologies the posting names.`];
  if (missing.length > 0) notes.push(`Not on the profile: ${missing.join(", ")}.`);
  return { matched, missing, result: { score: clampScore((matched.length / required.length) * 100), known: true, notes } };
}

function seniorityBand(text: string): number | null {
  if (/\b(principal|director|vp|head of)\b/i.test(text)) return 5;
  if (/\bstaff\b/i.test(text)) return 4;
  if (/\b(senior|sr\.?|lead)\b/i.test(text)) return 3;
  if (/\b(mid|intermediate|mid-level)\b/i.test(text)) return 2;
  if (/\b(junior|jr\.?|entry[- ]level|intern)\b/i.test(text)) return 1;
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

const LEADERSHIP_PATTERN = /\b(lead|leads|leading|leadership|mentor\w*|manag(e|es|ing) (a |the )?team)\b/i;
const ARCHITECTURE_PATTERN = /\b(architecture|architect\w*|system design|distributed systems?|scalab\w+)\b/i;

function scoreSeniority(job: MatchJob, profile: MatchProfile): Scored {
  const notes: string[] = [];
  const jobBand = seniorityBand(job.seniority) ?? seniorityBand(job.title);
  const profileBand = yearsToBand(profile.yearsOfExperience);

  let band = 50;
  const known = jobBand !== null && profileBand !== null;
  if (known) {
    const distance = profileBand - jobBand;
    // Under-qualified costs more than over-qualified.
    band = distance >= 0 ? 100 - 10 * distance : 100 + 30 * distance;
    if (distance < 0) notes.push("The role is more senior than the profile's years suggest.");
  } else {
    notes.push(jobBand === null ? "The posting gives no seniority level." : "The profile has no years of experience.");
  }

  const description = `${job.description}\n${job.requirements.join("\n")}`;
  const profileText = experienceText(profile);
  const asks: Array<{ label: string; evidenced: boolean }> = [];
  if (LEADERSHIP_PATTERN.test(description)) {
    asks.push({
      label: "leadership",
      evidenced: Boolean(profile.leadershipExperience.trim()) || LEADERSHIP_PATTERN.test(profileText),
    });
  }
  if (ARCHITECTURE_PATTERN.test(description)) {
    asks.push({
      label: "architecture",
      evidenced: Boolean(profile.architectureExperience.trim()) || ARCHITECTURE_PATTERN.test(profileText),
    });
  }
  const responsibilities =
    asks.length === 0 ? 100 : (asks.filter((ask) => ask.evidenced).length / asks.length) * 100;
  for (const ask of asks) {
    notes.push(
      ask.evidenced
        ? `Asks for ${ask.label}, and the profile shows it.`
        : `Asks for ${ask.label}, and the profile shows no ${ask.label} evidence.`,
    );
  }

  return { score: clampScore(0.7 * band + 0.3 * responsibilities), known, notes };
}

function requiredYears(text: string): number | null {
  let highest: number | null = null;
  for (const match of text.matchAll(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/gi)) {
    const years = Number(match[1]);
    if (years > 0 && years <= 25 && (highest === null || years > highest)) highest = years;
  }
  return highest;
}

function scoreExperience(job: MatchJob, profile: MatchProfile, required: string[]): Scored {
  const notes: string[] = [];
  const parts: Array<{ weight: number; score: number }> = [];

  const yearsAsked = requiredYears(`${job.description}\n${job.requirements.join("\n")}`);
  if (yearsAsked !== null && profile.yearsOfExperience !== null) {
    const years = profile.yearsOfExperience;
    parts.push({ weight: 0.3, score: years >= yearsAsked ? 100 : (years / yearsAsked) * 100 });
    notes.push(`Asks for ${yearsAsked}+ years; the profile shows ${years}.`);
  }

  if (required.length > 0) {
    const usedText = experienceText(profile);
    const used = new Set([
      ...detectTechnologies(usedText).map((name) => name.toLowerCase()),
      ...profile.experiences.flatMap((item) => item.technologies).map((skill) => canonicalTech(skill).toLowerCase()),
    ]);
    const lowerText = usedText.toLowerCase();
    const evidenced = required.filter(
      (skill) => used.has(skill.toLowerCase()) || lowerText.includes(skill.toLowerCase()),
    );
    parts.push({ weight: 0.5, score: (evidenced.length / required.length) * 100 });
    notes.push(`${evidenced.length} of ${required.length} required technologies appear in a past role.`);
  }

  const known = parts.length > 0;
  const hasAchievements = profile.experiences.some(
    (item) => item.achievements.trim() || item.measurableOutcomes.trim(),
  );
  parts.push({ weight: 0.2, score: hasAchievements ? 100 : 40 });
  if (!hasAchievements) notes.push("No achievements or measurable outcomes recorded on the profile.");

  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  const score = parts.reduce((sum, part) => sum + part.weight * part.score, 0) / totalWeight;
  return { score: known ? clampScore(score) : 50, known, notes };
}

const CONTRACT_FACTOR: Partial<Record<JobEmploymentType, number>> = {
  FULL_TIME: 1,
  CONTRACT: 1,
  PART_TIME: 0.7,
  INTERNSHIP: 0.3,
};

function scoreGeography(job: MatchJob, eligibility: JobEligibilityStatus): Scored {
  const notes: string[] = [];
  const geo = eligibility === "ELIGIBLE" ? 100 : eligibility === "UNKNOWN" ? 50 : 0;
  if (eligibility === "UNKNOWN") notes.push("The posting does not confirm it hires from the candidate's region.");
  if (eligibility === "EXCLUDED") notes.push("Excluded by the eligibility rules.");
  const factor = job.employmentType ? (CONTRACT_FACTOR[job.employmentType] ?? 1) : 1;
  if (factor < 1 && job.employmentType) notes.push(`Contract type is ${job.employmentType.toLowerCase().replace("_", "-")}.`);
  return { score: clampScore(geo * factor), known: eligibility !== "UNKNOWN", notes };
}

function scoreCompensation(job: MatchJob, preferences: MatchPreferences): Scored {
  if (!job.salary) {
    return { score: 50, known: false, notes: ["Compensation is not disclosed."] };
  }
  const top = Math.max(job.salary.usdMonthlyMin, job.salary.usdMonthlyMax);
  const target = preferences.targetUsdMonthly;
  const notes = [
    `Pays up to about USD ${top.toLocaleString("en-US")}/month against a USD ${target.toLocaleString("en-US")} target.`,
  ];
  if (job.salary.approximate) notes.push("Converted from another currency with static rates.");
  return { score: clampScore(top >= target ? 100 : (top / target) * 100), known: true, notes };
}

function scorePreferences(job: MatchJob, preferences: MatchPreferences, now: Date): Scored {
  const notes: string[] = [];
  const title = job.title.toLowerCase();
  const roleHit = preferences.targetRoleKeywords.some((keyword) =>
    new RegExp(`\\b${escapeRegExp(keyword.toLowerCase())}\\b`).test(title),
  );
  if (!roleHit) notes.push("The title is not one of the target roles.");

  const age = postingAgeDays(job.postedAt, now);
  let ageScore = 50;
  if (age !== null) {
    ageScore = age <= preferences.maxPostingAgeDays ? 100 : age <= 2 * preferences.maxPostingAgeDays ? 50 : 0;
    if (age > preferences.maxPostingAgeDays) notes.push(`Posted ${age} days ago.`);
  }
  return { score: clampScore(0.6 * (roleHit ? 100 : 0) + 0.4 * ageScore), known: true, notes };
}

// --- combination ------------------------------------------------------------------------

export function matchJob(input: {
  job: MatchJob;
  profile: MatchProfile;
  eligibility: JobEligibilityStatus;
  now: Date;
  preferences?: MatchPreferences;
  weights?: MatchWeights;
}): MatchResult {
  const { job, profile, eligibility, now } = input;
  const preferences = input.preferences ?? DEFAULT_MATCH_PREFERENCES;
  const weights = input.weights ?? DEFAULT_MATCH_WEIGHTS;
  validateWeights(weights);

  const required = dedupeCaseless([...job.technologies.map(canonicalTech), ...detectTechnologies(jobText(job))]);
  const technical = scoreTechnical(required, profile);

  const scored: Record<MatchDimension, Scored> = {
    technical: technical.result,
    seniority: scoreSeniority(job, profile),
    experience: scoreExperience(job, profile, required),
    geography: scoreGeography(job, eligibility),
    compensation: scoreCompensation(job, preferences),
    preferences: scorePreferences(job, preferences, now),
  };

  const dimensions = Object.fromEntries(
    (Object.keys(scored) as MatchDimension[]).map((key) => [key, { ...scored[key], weight: weights[key] }]),
  ) as Record<MatchDimension, DimensionResult>;

  const entries = Object.values(dimensions);
  const score = clampScore(entries.reduce((sum, d) => sum + d.weight * d.score, 0));
  const confidence = clampScore(entries.reduce((sum, d) => sum + (d.known ? d.weight : 0), 0) * 100);

  const flags: MatchFlag[] = [];
  if (!dimensions.technical.known) flags.push("STACK_UNKNOWN");
  if (!dimensions.seniority.known) flags.push("SENIORITY_UNKNOWN");
  if (eligibility === "UNKNOWN") flags.push("ELIGIBILITY_UNKNOWN");
  if (!job.salary) flags.push("COMPENSATION_UNDISCLOSED");
  else {
    if (dimensions.compensation.score < 100) flags.push("COMPENSATION_BELOW_TARGET");
    if (job.salary.approximate) flags.push("COMPENSATION_APPROXIMATE");
  }

  return {
    version: MATCHING_VERSION,
    score,
    confidence,
    dimensions,
    matchedSkills: technical.matched,
    missingSkills: technical.missing,
    flags,
  };
}
