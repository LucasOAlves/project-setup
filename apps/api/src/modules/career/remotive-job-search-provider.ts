import { providerUnavailable } from "../../app-error.js";
import type { JobSearchProvider, JobSearchQuery } from "./job-search-provider.js";
import type { NormalizedJobPosting } from "./job-provider.js";

// Public, unauthenticated API (github.com/remotive-com/remote-jobs-api). Server-side keyword
// search via `search`. Terms: link back to the Remotive URL and name Remotive as the source,
// never resubmit its jobs to third-party boards, and stay well under 2 requests/minute (they
// suggest a few fetches per day). Listings are delayed 24 hours.
const REMOTIVE_URL = "https://remotive.com/api/remote-jobs";

type RemotiveEntry = {
  id?: number | string | null;
  url?: string | null;
  title?: string | null;
  company_name?: string | null;
  candidate_required_location?: string | null;
  description?: string | null;
  publication_date?: string | null;
};

export function normalizeRemotiveEntry(raw: RemotiveEntry): NormalizedJobPosting | null {
  const externalId = raw.id === null || raw.id === undefined ? "" : String(raw.id).trim();
  const title = raw.title?.trim() ?? "";
  const url = raw.url?.trim() ?? "";
  if (!externalId || !title || !url) {
    return null;
  }

  return {
    externalId,
    title: decodeEntities(title),
    url,
    location: decodeEntities(raw.candidate_required_location?.trim() ?? ""),
    description: stripHtml(raw.description ?? "").slice(0, 20_000),
    companyNameFromSource: decodeEntities(raw.company_name?.trim() ?? ""),
    updatedAt: parseDate(raw.publication_date),
  };
}

function parseDate(value: string | null | undefined): Date {
  const parsed = value ? new Date(value) : new Date(Number.NaN);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function decodeEntities(text: string): string {
  return text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "));
}

function matchesLocation(posting: NormalizedJobPosting, location: string | undefined): boolean {
  const needle = location?.trim().toLowerCase();
  if (!needle) return true;
  return posting.location.toLowerCase().includes(needle);
}

export class RemotiveJobSearchProvider implements JobSearchProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async searchJobs(query: JobSearchQuery): Promise<NormalizedJobPosting[]> {
    const url = new URL(REMOTIVE_URL);
    if (query.keywords.trim()) {
      url.searchParams.set("search", query.keywords.trim());
    }
    url.searchParams.set("limit", "50");

    let response: Response;
    try {
      response = await this.fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
    } catch {
      throw providerUnavailable("Remotive is unavailable.");
    }
    if (!response.ok) {
      throw providerUnavailable("Remotive is unavailable.");
    }

    let body: { jobs?: RemotiveEntry[] };
    try {
      body = (await response.json()) as { jobs?: RemotiveEntry[] };
    } catch {
      throw providerUnavailable("Remotive returned an unreadable response.");
    }

    const results: NormalizedJobPosting[] = [];
    for (const raw of body.jobs ?? []) {
      const posting = normalizeRemotiveEntry(raw);
      if (posting && matchesLocation(posting, query.location)) {
        results.push(posting);
      }
    }
    return results.slice(0, 30);
  }
}
