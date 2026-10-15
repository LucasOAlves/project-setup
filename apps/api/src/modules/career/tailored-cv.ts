import type { ProfilePublic, ResumeTailoringPlan } from "@studio/shared";
import { quoteAppearsIn } from "./job-explanation-grounding.js";
import { detectTechnologies } from "./job-matching.js";
import { groundTailoringPlan } from "./resume-tailoring.js";

// Tailored CV v2 (Milestone 2, ADR-010's draft pattern). The model picks and orders; this module
// decides what survives, so the CV can only hold what the profile already says:
// - experience highlights are the profile's own sentences, chosen by id, never rewritten;
// - every experience, skill and technology stays, only the order changes (as in v1);
// - summary sentences are the one piece of new prose: each must quote the profile, and may not
//   add a number or a technology the profile does not have;
// - technologies the job names that the profile lacks are reported as gaps, never added.

export const MAX_SUMMARY_SENTENCES = 3;
const MAX_HIGHLIGHTS = 6;
const FALLBACK_HIGHLIGHTS = 3;

type CvExperience = {
  id: string;
  role: string;
  company: string;
  startPeriod: string;
  endPeriod: string;
  description: string;
  responsibilities: string;
  achievements: string;
  measurableOutcomes: string;
  technologies: string[];
};

export type TailoredCvProfile = {
  topSkills: string[];
  technologies: string[];
  experiences: CvExperience[];
};

export type CvBullet = { id: string; text: string };

export type RawTailoredCv = {
  rationale: string;
  summary: Array<{ text: string; evidence: string[] }>;
  experiences: Array<{ id: string; bulletIds: string[] }>;
  topSkillsOrder: string[];
  technologiesOrder: string[];
};

export type GroundedTailoredCv = {
  rationale: string;
  summary: string[];
  droppedSummarySentences: number;
  experiences: Array<{
    id: string;
    role: string;
    company: string;
    startPeriod: string;
    endPeriod: string;
    highlights: string[];
  }>;
  topSkills: string[];
  technologies: string[];
  gaps: string[];
};

// A field's lines, list markers removed; a line holding several sentences is split at sentence
// ends followed by a capital or digit, so "Node.js" stays whole.
function splitField(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").trim())
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/))
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

export function experienceBullets(experience: Pick<CvExperience, "id" | "description" | "responsibilities" | "achievements" | "measurableOutcomes">): CvBullet[] {
  const seen = new Set<string>();
  const bullets: CvBullet[] = [];
  for (const field of [experience.description, experience.responsibilities, experience.achievements, experience.measurableOutcomes]) {
    for (const text of splitField(field)) {
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      bullets.push({ id: `${experience.id}#${bullets.length + 1}`, text });
    }
  }
  return bullets;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const NUMBER = /\d+(?:[.,]\d+)*%?/g;

function numbersSupported(sentence: string, profileText: string): boolean {
  return (sentence.match(NUMBER) ?? []).every((token) =>
    new RegExp(`(?<![\\d.,])${escapeRegExp(token)}(?!\\d)`).test(profileText),
  );
}

function summarySentenceSupported(
  sentence: { text: string; evidence: string[] },
  profileText: string,
  profileTechnologies: Set<string>,
): boolean {
  if (!sentence.text.trim() || sentence.evidence.length === 0) return false;
  if (!sentence.evidence.every((quote) => quoteAppearsIn(quote, profileText))) return false;
  if (!numbersSupported(sentence.text, profileText)) return false;
  return detectTechnologies(sentence.text).every((tech) => profileTechnologies.has(tech));
}

export function groundTailoredCv(
  raw: RawTailoredCv,
  profile: TailoredCvProfile,
  context: { profileText: string; jobText: string },
): GroundedTailoredCv {
  const profileTechnologies = new Set(
    detectTechnologies(`${context.profileText}\n${profile.technologies.join(", ")}`),
  );

  const summary: string[] = [];
  let dropped = 0;
  for (const sentence of raw.summary) {
    if (summary.length < MAX_SUMMARY_SENTENCES && summarySentenceSupported(sentence, context.profileText, profileTechnologies)) {
      summary.push(sentence.text.trim());
    } else if (summary.length < MAX_SUMMARY_SENTENCES) {
      dropped += 1;
    }
  }

  // Ordering is v1's grounding: unknown ids and strings dropped, anything left out appended.
  const plan: ResumeTailoringPlan = groundTailoringPlan(
    {
      rationale: raw.rationale,
      experienceOrder: raw.experiences.map((item) => item.id),
      topSkillsOrder: raw.topSkillsOrder,
      technologiesOrder: raw.technologiesOrder,
    },
    profile as unknown as ProfilePublic,
  );

  const picks = new Map(raw.experiences.map((item) => [item.id, item.bulletIds]));
  const experienceById = new Map(profile.experiences.map((item) => [item.id, item]));
  const experiences = plan.experienceOrder.flatMap((id) => {
    const experience = experienceById.get(id);
    if (!experience) return [];
    const bullets = experienceBullets(experience);
    const bulletById = new Map(bullets.map((bullet) => [bullet.id, bullet.text]));
    const chosen = [...new Set(picks.get(id) ?? [])]
      .map((bulletId) => bulletById.get(bulletId))
      .filter((text): text is string => text !== undefined)
      .slice(0, MAX_HIGHLIGHTS);
    return [
      {
        id,
        role: experience.role,
        company: experience.company,
        startPeriod: experience.startPeriod,
        endPeriod: experience.endPeriod,
        highlights: chosen.length > 0 ? chosen : bullets.slice(0, FALLBACK_HIGHLIGHTS).map((bullet) => bullet.text),
      },
    ];
  });

  return {
    rationale: raw.rationale,
    summary,
    droppedSummarySentences: dropped,
    experiences,
    topSkills: plan.topSkillsOrder,
    technologies: plan.technologiesOrder,
    gaps: detectTechnologies(context.jobText).filter((tech) => !profileTechnologies.has(tech)),
  };
}
