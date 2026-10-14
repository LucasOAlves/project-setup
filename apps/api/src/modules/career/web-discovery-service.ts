import type { JobBoardSource } from "@studio/shared";
import type { WebSearchClient } from "./brave-search-client.js";
import type { JobIntake } from "./job-intake.js";
import type { JobProvider } from "./job-provider.js";
import type { SourceGate } from "./source-registry.js";
import {
  ATS_SEARCH_DOMAINS,
  buildWebSearchQuery,
  companyNameFromToken,
  groupResultsByBoard,
  selectPostingsForResults,
} from "./web-search-discovery.js";

// Web search discovery (Milestone 1.5), run daily by the worker: one search per ATS domain for
// recent LATAM-friendly postings with the configured titles, then each board found is read
// through its own public API and only the postings the search pointed at are imported, through
// the same intake, eligibility and evaluation path as every other discovered job.

export const WEB_SEARCH_SOURCE = "brave";

// Brave's entry plans allow about one request a second.
const SEARCH_SPACING_MS = 1_100;
const BOARD_SPACING_MS = 2_000;

export type WebDiscoveryResult = {
  queries: number;
  failedQueries: number;
  resultUrls: number;
  boards: number;
  failedBoards: string[];
  matched: number;
  created: number;
  alreadyImported: number;
  duplicates: number;
  excluded: number;
  queuedForEvaluation: number;
};

export type WebDiscoveryDeps = {
  search: WebSearchClient;
  intake: JobIntake;
  providers: Record<JobBoardSource, JobProvider>;
  sourceGate: SourceGate;
  queueEvaluation: (jobId: string, profileVersion: number) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
};

export class WebDiscoveryService {
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: WebDiscoveryDeps) {
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async run(titles: string[]): Promise<WebDiscoveryResult> {
    await this.deps.sourceGate.assertDiscoveryAllowed(WEB_SEARCH_SOURCE);
    const result: WebDiscoveryResult = {
      queries: 0,
      failedQueries: 0,
      resultUrls: 0,
      boards: 0,
      failedBoards: [],
      matched: 0,
      created: 0,
      alreadyImported: 0,
      duplicates: 0,
      excluded: 0,
      queuedForEvaluation: 0,
    };

    const urls = new Set<string>();
    for (const [index, domain] of ATS_SEARCH_DOMAINS.entries()) {
      if (index > 0) await this.sleep(SEARCH_SPACING_MS);
      result.queries += 1;
      try {
        for (const hit of await this.deps.search.search(buildWebSearchQuery(domain, titles))) urls.add(hit.url);
      } catch {
        result.failedQueries += 1;
      }
    }
    // Every search failed (a bad key, the service down): let the queue retry the run.
    if (result.failedQueries === result.queries) {
      throw new Error("brave: every web search request failed.");
    }
    result.resultUrls = urls.size;

    const groups = groupResultsByBoard([...urls]);
    result.boards = groups.length;
    for (const [index, group] of groups.entries()) {
      if (index > 0) await this.sleep(BOARD_SPACING_MS);
      let postings;
      try {
        await this.deps.sourceGate.assertDiscoveryAllowed(group.source);
        postings = await this.deps.providers[group.source].listJobs(group.token);
      } catch {
        result.failedBoards.push(`${group.source}/${group.token}`);
        continue;
      }

      for (const posting of selectPostingsForResults(postings, group.urls)) {
        result.matched += 1;
        const { job, outcome } = await this.deps.intake.importSearchPosting(group.source, {
          ...posting,
          companyName: posting.companyNameFromSource || companyNameFromToken(group.token),
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
        await this.deps.queueEvaluation(job.id, evaluation.profileVersion);
        result.queuedForEvaluation += 1;
      }
    }
    return result;
  }
}

// The sources a daily discovery run covers: the configured search sources, plus web search
// when its key is set. Shared by the worker's schedulers and "Run discovery now".
export function discoverySourceIds(env: { DISCOVERY_SOURCES: readonly string[]; BRAVE_SEARCH_API_KEY: string }): string[] {
  return [...env.DISCOVERY_SOURCES, ...(env.BRAVE_SEARCH_API_KEY ? [WEB_SEARCH_SOURCE] : [])];
}
