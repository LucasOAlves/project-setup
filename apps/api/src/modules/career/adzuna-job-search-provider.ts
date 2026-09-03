import { providerUnavailable } from "../../app-error.js";
import type { JobSearchProvider, JobSearchQuery } from "./job-search-provider.js";
import type { NormalizedJobPosting } from "./job-provider.js";

// Real search API (developer.adzuna.com) — unlike the board/aggregator providers, Adzuna
// actually supports server-side keyword + location search, and needs a free, instant,
// self-serve App ID/Key pair (no OAuth, no business relationship — see ADR-011's provider
// posture). Defaults to the "br" market since that's this workspace's own locale; a future
// slice could make the country configurable if this ever serves more than one user.
const ADZUNA_COUNTRY = "br";
const adzunaSearchUrl = (appId: string, appKey: string, what: string, where: string) => {
  const url = new URL(`https://api.adzuna.com/v1/api/jobs/${ADZUNA_COUNTRY}/search/1`);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("what", what);
  if (where) url.searchParams.set("where", where);
  url.searchParams.set("results_per_page", "30");
  url.searchParams.set("content-type", "application/json");
  return url;
};

type AdzunaResult = {
  id?: string | number | null;
  title?: string | null;
  company?: { display_name?: string | null } | null;
  location?: { display_name?: string | null } | null;
  redirect_url?: string | null;
  description?: string | null;
  created?: string | null;
};

type AdzunaResponse = {
  results?: AdzunaResult[];
};

export function normalizeAdzunaResult(raw: AdzunaResult): NormalizedJobPosting | null {
  const title = raw.title?.trim() ?? "";
  const url = raw.redirect_url?.trim() ?? "";
  const externalId = raw.id === null || raw.id === undefined ? "" : String(raw.id).trim();
  if (!title || !url || !externalId) {
    return null;
  }

  return {
    externalId,
    title,
    url,
    location: raw.location?.display_name?.trim() ?? "",
    description: (raw.description ?? "").trim().slice(0, 20_000),
    companyNameFromSource: raw.company?.display_name?.trim() ?? "",
    updatedAt: raw.created ? new Date(raw.created) : new Date(),
  };
}

export class AdzunaJobSearchProvider implements JobSearchProvider {
  constructor(
    private readonly appId: string,
    private readonly appKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async searchJobs(query: JobSearchQuery): Promise<NormalizedJobPosting[]> {
    if (!this.appId || !this.appKey) {
      throw providerUnavailable(
        "Job search is not configured. Set ADZUNA_APP_ID and ADZUNA_APP_KEY and retry.",
      );
    }
    const keywords = query.keywords.trim();
    if (!keywords) {
      throw providerUnavailable("Search keywords are required.");
    }

    let response: Response;
    try {
      response = await this.fetchImpl(
        adzunaSearchUrl(this.appId, this.appKey, keywords, query.location?.trim() ?? ""),
        { signal: AbortSignal.timeout(15_000) },
      );
    } catch {
      throw providerUnavailable("Adzuna is unavailable.");
    }

    if (response.status === 401 || response.status === 403) {
      throw providerUnavailable("Adzuna rejected the credentials.", 502);
    }
    if (!response.ok) {
      throw providerUnavailable("Adzuna is unavailable.");
    }

    let body: AdzunaResponse;
    try {
      body = (await response.json()) as AdzunaResponse;
    } catch {
      throw providerUnavailable("Adzuna returned an unreadable response.");
    }

    return (body.results ?? [])
      .map((result) => normalizeAdzunaResult(result))
      .filter((result): result is NormalizedJobPosting => result !== null);
  }
}
