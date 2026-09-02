import type { ContentTopicSuggestion, JobPublic, ProfilePublic } from "@studio/shared";
import { skillsMatch } from "./job-fit.js";

const MAX_SUGGESTIONS = 5;

// Career -> Content direction of the intelligence loop (ADR-013). Deterministic by design:
// a technology only becomes a suggestion when the profile has real, matchable evidence for
// it (skillsMatch, same helper Job Fit uses) — there is no code path that can suggest writing
// about something the profile doesn't actually evidence, unlike an ungrounded model call.
export function computeContentTopicSuggestions(
  jobs: JobPublic[],
  profile: ProfilePublic,
): ContentTopicSuggestion[] {
  const jobsWithTechnologies = jobs.filter((job) => job.technologies.length > 0);
  const totalJobs = jobsWithTechnologies.length;
  if (totalJobs === 0) {
    return [];
  }

  const counts = new Map<string, { display: string; count: number }>();
  for (const job of jobsWithTechnologies) {
    const seenInJob = new Set<string>();
    for (const technology of job.technologies) {
      const key = technology.trim().toLowerCase();
      if (!key || seenInJob.has(key)) continue;
      seenInJob.add(key);
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { display: technology, count: 1 });
      }
    }
  }

  const ranked = [...counts.values()].sort((a, b) => b.count - a.count);
  const suggestions: ContentTopicSuggestion[] = [];

  for (const { display, count } of ranked) {
    const evidence = findEvidence(display, profile);
    if (!evidence) continue; // No real evidence — never suggest writing about it.

    const demandPercent = Math.round((100 * count) / totalJobs);
    suggestions.push({
      technology: display,
      jobCount: count,
      totalJobs,
      demandPercent,
      evidence,
      hook: `${count} of ${totalJobs} tracked jobs (${demandPercent}%) ask for ${display}. ${evidence}`,
    });

    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }

  return suggestions;
}

function findEvidence(technology: string, profile: ProfilePublic): string | null {
  const inSkillsOrTech =
    profile.technologies.some((item) => skillsMatch(item, technology)) ||
    profile.topSkills.some((item) => skillsMatch(item, technology));
  if (!inSkillsOrTech) {
    return null;
  }

  const experience = profile.experiences.find((item) =>
    item.technologies.some((tech) => skillsMatch(tech, technology)),
  );
  if (experience) {
    const role = [experience.role, experience.company].filter(Boolean).join(" at ");
    const achievement = experience.achievements ? ` — ${experience.achievements}` : "";
    return `Real ground for this: your work as ${role || "a real role in your experience"}${achievement}.`;
  }

  return `${technology} is already in your profile's real skills — a post here wouldn't be a stretch.`;
}
