import type { ProfilePublic, ResumeTailoringPlan } from "@studio/shared";

// Deterministic grounding for the model's tailoring plan — see .skills/structured-ai-output
// and ADR-010's draft pattern. Regardless of what the model returns, the result of this
// function can only ever be a reordering of what's actually in the profile: unknown ids or
// skill strings are dropped, and anything real the model forgot to mention is appended in its
// original order so nothing is silently hidden from the exported resume.
export function groundTailoringPlan(
  plan: ResumeTailoringPlan,
  profile: ProfilePublic,
): ResumeTailoringPlan {
  const experienceIds = new Set(profile.experiences.map((experience) => experience.id));
  const experienceOrder = reorderIds(plan.experienceOrder, experienceIds);

  const topSkillsOrder = reorderStrings(plan.topSkillsOrder, profile.topSkills);
  const technologiesOrder = reorderStrings(plan.technologiesOrder, profile.technologies);

  return {
    rationale: plan.rationale,
    experienceOrder,
    topSkillsOrder,
    technologiesOrder,
  };
}

function reorderIds(proposed: string[], validIds: Set<string>): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of proposed) {
    if (validIds.has(id) && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  for (const id of validIds) {
    if (!seen.has(id)) {
      ordered.push(id);
    }
  }
  return ordered;
}

function reorderStrings(proposed: string[], real: string[]): string[] {
  const realByKey = new Map(real.map((value) => [value.trim().toLowerCase(), value]));
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of proposed) {
    const key = value.trim().toLowerCase();
    const match = realByKey.get(key);
    if (match && !seen.has(key)) {
      seen.add(key);
      ordered.push(match);
    }
  }
  for (const value of real) {
    const key = value.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(value);
    }
  }
  return ordered;
}

// Applies a grounded plan to build the resume-export-ready profile: same person, same facts,
// only the order of experiences/skills/technologies changes for emphasis.
export function applyTailoringPlan(profile: ProfilePublic, plan: ResumeTailoringPlan): ProfilePublic {
  const experienceById = new Map(profile.experiences.map((experience) => [experience.id, experience]));
  const experiences = plan.experienceOrder
    .map((id) => experienceById.get(id))
    .filter((experience): experience is ProfilePublic["experiences"][number] => Boolean(experience));

  return {
    ...profile,
    experiences,
    topSkills: plan.topSkillsOrder,
    technologies: plan.technologiesOrder,
  };
}
