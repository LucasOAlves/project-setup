import { detectBoardReference, type JobBoardSource } from "@studio/shared";
import { canonicalizeJobUrl } from "./job-provenance.js";
import type { NormalizedJobPosting } from "./job-provider.js";

// Web search discovery (Milestone 1.5): the job-hunting guide's `site:` searches, run through
// a search API instead of scraping Google. The pure part lives here: building the queries,
// grouping result URLs by ATS board, and keeping only the board postings the search found.
// Search results are only used to find postings; every posting's content comes from the
// ATS's own public API (WebDiscoveryService).

// One query per domain keeps each query short and the daily count fixed, whatever the titles.
export const ATS_SEARCH_DOMAINS = [
  "jobs.ashbyhq.com",
  "job-boards.greenhouse.io",
  "boards.greenhouse.io",
  "jobs.lever.co",
  "apply.workable.com",
  "jobs.smartrecruiters.com",
] as const;

// Brave caps a query at 400 characters and 50 words.
export const MAX_QUERY_LENGTH = 400;
export const MAX_QUERY_WORDS = 50;

const REGION_TERMS = ["LATAM", "Brazil", "South America", "remote worldwide"];
const EXCLUSION = '-"authorized to work in the US"';

function quoted(term: string): string {
  return `"${term.replaceAll('"', "").replace(/\s+/g, " ").trim()}"`;
}

export function buildWebSearchQuery(domain: string, titles: string[]): string {
  const regions = `(${REGION_TERMS.map(quoted).join(" OR ")})`;
  const build = (kept: string[]) => `site:${domain} (${kept.map(quoted).join(" OR ")}) ${regions} ${EXCLUSION}`;
  let kept = titles.filter((title) => title.trim());
  const tooLong = (query: string) =>
    query.length > MAX_QUERY_LENGTH || query.split(/\s+/).length > MAX_QUERY_WORDS;
  while (kept.length > 1 && tooLong(build(kept))) {
    kept = kept.slice(0, -1);
  }
  return build(kept);
}

export type BoardResultGroup = { source: JobBoardSource; token: string; urls: string[] };

export function groupResultsByBoard(urls: string[]): BoardResultGroup[] {
  const groups = new Map<string, BoardResultGroup>();
  for (const url of urls) {
    const board = detectBoardReference(url);
    if (!board) continue;
    const key = `${board.source}/${board.token.toLowerCase()}`;
    const group = groups.get(key) ?? { ...board, urls: [] };
    if (!group.urls.includes(url)) group.urls.push(url);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function pathSegments(url: string): string[] {
  try {
    return new URL(url).pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment).toLowerCase());
  } catch {
    return [];
  }
}

// A posting matches a result when its id is a whole path segment of the result URL (or starts
// one, as in SmartRecruiters' "<id>-<slug>"), or when both URLs are the same once tracking
// parameters are gone.
export function selectPostingsForResults(postings: NormalizedJobPosting[], urls: string[]): NormalizedJobPosting[] {
  const resultSegments = urls.map(pathSegments);
  const resultUrls = new Set(urls.map(canonicalizeJobUrl));
  return postings.filter((posting) => {
    const id = posting.externalId.toLowerCase();
    if (resultUrls.has(canonicalizeJobUrl(posting.url))) return true;
    return resultSegments.some((segments) =>
      segments.some((segment) => segment === id || segment.startsWith(`${id}-`)),
    );
  });
}

// Ashby and Lever boards do not report the company name: "acme-labs" becomes "Acme Labs".
export function companyNameFromToken(token: string): string {
  return token
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
