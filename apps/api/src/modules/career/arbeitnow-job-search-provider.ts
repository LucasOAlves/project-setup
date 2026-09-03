import { providerUnavailable } from "../../app-error.js";
import type { JobSearchProvider, JobSearchQuery } from "./job-search-provider.js";
import type { NormalizedJobPosting } from "./job-provider.js";

// Real, documented, unauthenticated public endpoint (arbeitnow.com/blog/job-board-api). No
// documented keyword-search parameter, so — same as RemoteOK — one page is fetched and
// filtered client-side by keyword.
const ARBEITNOW_URL = "https://www.arbeitnow.com/api/job-board-api";

type ArbeitnowJob = {
  slug?: string | null;
  title?: string | null;
  company_name?: string | null;
  url?: string | null;
  location?: string | null;
  description?: string | null;
  tags?: string[] | null;
  job_types?: string[] | null;
  created_at?: number | null;
};

type ArbeitnowResponse = {
  data?: ArbeitnowJob[];
};

export function normalizeArbeitnowJob(raw: ArbeitnowJob): NormalizedJobPosting | null {
  const title = raw.title?.trim() ?? "";
  const url = raw.url?.trim() ?? "";
  const externalId = raw.slug?.trim() ?? "";
  if (!title || !url || !externalId) {
    return null;
  }

  return {
    externalId,
    title: decodeEntities(title),
    url,
    location: decodeEntities(raw.location?.trim() ?? ""),
    description: stripHtml(raw.description ?? "").slice(0, 20_000),
    companyNameFromSource: decodeEntities(raw.company_name?.trim() ?? ""),
    updatedAt: raw.created_at ? new Date(raw.created_at * 1000) : new Date(),
  };
}

function decodeEntities(text: string): string {
  return text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "));
}

function matchesQuery(posting: NormalizedJobPosting, raw: ArbeitnowJob, keywords: string): boolean {
  const needle = keywords.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [posting.title, posting.description, ...(raw.tags ?? []), ...(raw.job_types ?? [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export class ArbeitnowJobSearchProvider implements JobSearchProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async searchJobs(query: JobSearchQuery): Promise<NormalizedJobPosting[]> {
    let response: Response;
    try {
      response = await this.fetchImpl(ARBEITNOW_URL, { signal: AbortSignal.timeout(15_000) });
    } catch {
      throw providerUnavailable("Arbeitnow is unavailable.");
    }
    if (!response.ok) {
      throw providerUnavailable("Arbeitnow is unavailable.");
    }

    let body: ArbeitnowResponse;
    try {
      body = (await response.json()) as ArbeitnowResponse;
    } catch {
      throw providerUnavailable("Arbeitnow returned an unreadable response.");
    }

    const results: NormalizedJobPosting[] = [];
    for (const raw of body.data ?? []) {
      const posting = normalizeArbeitnowJob(raw);
      if (posting && matchesQuery(posting, raw, query.keywords)) {
        results.push(posting);
      }
    }
    return results.slice(0, 30);
  }
}
