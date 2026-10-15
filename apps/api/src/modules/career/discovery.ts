import type { JobIntake } from "./job-intake.js";
import type { JobSearchProvider } from "./job-search-provider.js";
import type { NormalizedJobPosting } from "./job-provider.js";
import type { SourceGate } from "./source-registry.js";

// Scheduled discovery (spec A01, JOB-009): for one search source, run each configured keyword,
// import what is new through the same JobIntake path as "Add to tracker", apply the hard
// eligibility rules to new jobs, and queue the ones not excluded for scoring/explanation.
// Safe to re-run: postings already imported (same source + id, or the same role from another
// source) are counted, not re-created or re-evaluated.

export type DiscoveryResult = {
  sourceId: string;
  keywords: string[];
  failedKeywords: string[];
  fetched: number;
  created: number;
  alreadyImported: number;
  duplicates: number;
  eligible: number;
  excluded: number;
  unknown: number;
  queuedForEvaluation: number;
};

// Minimum gap between two requests to the same source within a run. Remotive blocks more than
// 2 requests a minute; the others publish no number, so stay polite.
export const SOURCE_REQUEST_SPACING_MS: Record<string, number> = {
  remotive: 35_000,
  himalayas: 5_000,
};
const DEFAULT_SPACING_MS = 2_000;

export type DiscoveryDeps = {
  intake: JobIntake;
  providers: Partial<Record<string, JobSearchProvider>>;
  sourceGate: SourceGate;
  queueEvaluation: (jobId: string, profileVersion: number) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
};

export class DiscoveryService {
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: DiscoveryDeps) {
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async runSource(sourceId: string, keywords: string[]): Promise<DiscoveryResult> {
    const provider = this.deps.providers[sourceId];
    if (!provider) {
      throw new Error(`No search provider for ${sourceId}.`);
    }
    await this.deps.sourceGate.assertDiscoveryAllowed(sourceId);

    const result: DiscoveryResult = {
      sourceId,
      keywords,
      failedKeywords: [],
      fetched: 0,
      created: 0,
      alreadyImported: 0,
      duplicates: 0,
      eligible: 0,
      excluded: 0,
      unknown: 0,
      queuedForEvaluation: 0,
    };

    const postings = new Map<string, NormalizedJobPosting>();
    const spacing = SOURCE_REQUEST_SPACING_MS[sourceId] ?? DEFAULT_SPACING_MS;
    for (const [index, keyword] of keywords.entries()) {
      if (index > 0) await this.sleep(spacing);
      try {
        for (const posting of await provider.searchJobs({ keywords: keyword })) {
          postings.set(posting.externalId, posting);
        }
      } catch {
        result.failedKeywords.push(keyword);
      }
    }
    // Every request failed: let the queue retry the run instead of reporting an empty success.
    if (keywords.length > 0 && result.failedKeywords.length === keywords.length) {
      throw new Error(`${sourceId}: every discovery request failed.`);
    }

    result.fetched = postings.size;
    for (const posting of postings.values()) {
      const { job, outcome } = await this.deps.intake.importSearchPosting(sourceId, {
        ...posting,
        companyName: posting.companyNameFromSource,
      });
      if (outcome === "ALREADY_IMPORTED") {
        result.alreadyImported += 1;
        continue;
      }
      if (outcome === "DUPLICATE") {
        result.duplicates += 1;
        continue;
      }

      result.created += 1;
      const evaluation = await this.deps.intake.evaluateEligibility(job);
      if (evaluation.eligibility === "EXCLUDED") {
        result.excluded += 1;
        continue;
      }
      if (evaluation.eligibility === "ELIGIBLE") result.eligible += 1;
      else result.unknown += 1;
      await this.deps.queueEvaluation(job.id, evaluation.profileVersion);
      result.queuedForEvaluation += 1;
    }
    return result;
  }
}
