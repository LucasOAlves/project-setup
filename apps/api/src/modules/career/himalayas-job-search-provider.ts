import { providerUnavailable } from "../../app-error.js";
import type { JobSearchProvider, JobSearchQuery } from "./job-search-provider.js";
import type { NormalizedJobPosting } from "./job-provider.js";

// Public, unauthenticated API (himalayas.app/docs/remote-jobs-api). Terms: free to use, show a
// visible link back to himalayas.app and say the data comes from Himalayas. Rate limited
// (429 past an unpublished limit) and refreshed every 24 hours, so polling more than daily
// gains nothing.
const HIMALAYAS_SEARCH_URL = "https://himalayas.app/jobs/api/search";

type HimalayasLocation = { alpha2?: string | null; name?: string | null };

type HimalayasEntry = {
  guid?: string | null;
  title?: string | null;
  companyName?: string | null;
  applicationLink?: string | null;
  description?: string | null;
  excerpt?: string | null;
  locationRestrictions?: HimalayasLocation[] | null;
  pubDate?: number | string | null;
};

// No location restriction means Himalayas lists the role as open worldwide.
export function himalayasLocation(restrictions: HimalayasLocation[] | null | undefined): string {
  const names = (restrictions ?? [])
    .map((entry) => entry.name?.trim() ?? "")
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : "Worldwide";
}

export function normalizeHimalayasEntry(raw: HimalayasEntry): NormalizedJobPosting | null {
  const externalId = raw.guid?.trim() ?? "";
  const title = raw.title?.trim() ?? "";
  const url = raw.applicationLink?.trim() ?? "";
  if (!externalId || !title || !url) {
    return null;
  }

  return {
    externalId,
    title: decodeEntities(title),
    url,
    location: himalayasLocation(raw.locationRestrictions),
    description: stripHtml(raw.description ?? raw.excerpt ?? "").slice(0, 20_000),
    companyNameFromSource: decodeEntities(raw.companyName?.trim() ?? ""),
    updatedAt: parseDate(raw.pubDate),
  };
}

// The docs disagree on whether pubDate is Unix ms or an ISO string, so accept both.
function parseDate(value: number | string | null | undefined): Date {
  if (value === null || value === undefined || value === "") return new Date();
  const parsed = new Date(typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value);
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
  const where = posting.location.toLowerCase();
  return where === "worldwide" || where.includes(needle);
}

export class HimalayasJobSearchProvider implements JobSearchProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async searchJobs(query: JobSearchQuery): Promise<NormalizedJobPosting[]> {
    const url = new URL(HIMALAYAS_SEARCH_URL);
    if (query.keywords.trim()) {
      url.searchParams.set("q", query.keywords.trim());
    }
    url.searchParams.set("sort", "recent");

    let response: Response;
    try {
      response = await this.fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
    } catch {
      throw providerUnavailable("Himalayas is unavailable.");
    }
    if (response.status === 429) {
      throw providerUnavailable("Himalayas is rate limiting requests. Try again later.", 429);
    }
    if (!response.ok) {
      throw providerUnavailable("Himalayas is unavailable.");
    }

    let body: { jobs?: HimalayasEntry[] };
    try {
      body = (await response.json()) as { jobs?: HimalayasEntry[] };
    } catch {
      throw providerUnavailable("Himalayas returned an unreadable response.");
    }

    const results: NormalizedJobPosting[] = [];
    for (const raw of body.jobs ?? []) {
      const posting = normalizeHimalayasEntry(raw);
      if (posting && matchesLocation(posting, query.location)) {
        results.push(posting);
      }
    }
    return results.slice(0, 30);
  }
}
