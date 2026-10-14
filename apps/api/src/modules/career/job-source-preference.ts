import { JOB_BOARD_SOURCES } from "@studio/shared";

// Preferring the company's own posting (Milestone 1.5). The same role often reaches the
// tracker twice: from an aggregator (Remotive, RemoteOK…) and from the company's ATS board
// (Greenhouse, Lever…), with different URLs and reformatted text, so the provenance keys
// (JOB-006) do not see them as one. Here a cross-source match is the same company plus the
// same normalized title, on opposite sides (one ATS, one aggregator), and only when exactly
// one candidate fits: two open roles with one title stay apart rather than risk hiding one.
// The ATS record wins: an aggregator copy is pointed at the company's posting and filled with
// the salary and date it lacked. Its own source and external id stay, so the aggregator's next
// run still recognises it as already imported.

export function isCompanyBoardSource(source: string): boolean {
  return (JOB_BOARD_SOURCES as readonly string[]).includes(source);
}

// "manual" jobs are the user's own entries and never take part.
function side(source: string): "BOARD" | "AGGREGATOR" | null {
  if (isCompanyBoardSource(source)) return "BOARD";
  return source === "manual" || source === "" ? null : "AGGREGATOR";
}

export function normalizeRoleTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word && word !== "remote")
    .join(" ");
}

export type RoleCandidate = { source: string; title: string };

export function findCrossSourceMatch<T extends RoleCandidate>(incoming: RoleCandidate, candidates: T[]): T | null {
  const incomingSide = side(incoming.source);
  if (!incomingSide) return null;
  const title = normalizeRoleTitle(incoming.title);
  const matches = candidates.filter((candidate) => {
    const candidateSide = side(candidate.source);
    return candidateSide !== null && candidateSide !== incomingSide && normalizeRoleTitle(candidate.title) === title;
  });
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

export type UpgradableJob = {
  source: string;
  url: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  sourcePostedAt: Date | null;
  normalizedData: Record<string, unknown>;
};

export type CompanySitePatch = Partial<
  Pick<UpgradableJob, "url" | "salaryMin" | "salaryMax" | "salaryCurrency" | "sourcePostedAt" | "normalizedData">
>;

// What to change on a tracked aggregator copy when the company's own posting for it arrives,
// or null when there is nothing to change.
export function companySiteUpgrade(existing: UpgradableJob, incoming: UpgradableJob): CompanySitePatch | null {
  if (!isCompanyBoardSource(incoming.source) || isCompanyBoardSource(existing.source)) return null;

  const patch: CompanySitePatch = {};
  if (incoming.url && incoming.url !== existing.url) patch.url = incoming.url;
  const existingHasSalary = existing.salaryMin !== null || existing.salaryMax !== null;
  const incomingHasSalary = incoming.salaryMin !== null || incoming.salaryMax !== null;
  if (!existingHasSalary && incomingHasSalary) {
    patch.salaryMin = incoming.salaryMin;
    patch.salaryMax = incoming.salaryMax;
    patch.salaryCurrency = incoming.salaryCurrency;
    patch.normalizedData = { ...existing.normalizedData, salary: incoming.normalizedData.salary ?? null };
  }
  if (!existing.sourcePostedAt && incoming.sourcePostedAt) patch.sourcePostedAt = incoming.sourcePostedAt;
  return Object.keys(patch).length > 0 ? patch : null;
}
