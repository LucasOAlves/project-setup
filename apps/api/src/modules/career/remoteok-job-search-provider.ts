import { providerUnavailable } from "../../app-error.js";
import type { JobSearchProvider, JobSearchQuery } from "./job-search-provider.js";
import type { NormalizedJobPosting } from "./job-provider.js";

// Real, documented, unauthenticated public endpoint (remoteok.com/remote-api-jobs). Returns
// every recent posting in one call (no server-side keyword search), so filtering by keyword
// happens here, client-side, against title/tags/description.
const REMOTEOK_URL = "https://remoteok.com/api";

type RemoteOkEntry = {
  id?: string | null;
  slug?: string | null;
  position?: string | null;
  company?: string | null;
  url?: string | null;
  apply_url?: string | null;
  location?: string | null;
  description?: string | null;
  tags?: string[] | null;
  date?: string | null;
  legal?: string; // Present only on the first array element (a terms-of-service notice, not a job).
};

export function normalizeRemoteOkEntry(raw: RemoteOkEntry): NormalizedJobPosting | null {
  if (raw.legal) {
    return null; // The API's own leading "please link back to us" notice, not a job.
  }
  const title = raw.position?.trim() ?? "";
  const url = (raw.url ?? raw.apply_url)?.trim() ?? "";
  const externalId = raw.id?.trim() ?? raw.slug?.trim() ?? "";
  if (!title || !url || !externalId) {
    return null;
  }

  return {
    externalId,
    title: decodeEntities(title),
    url,
    location: decodeEntities(raw.location?.trim() ?? ""),
    description: stripHtml(raw.description ?? "").slice(0, 20_000),
    companyNameFromSource: decodeEntities(raw.company?.trim() ?? ""),
    updatedAt: raw.date ? new Date(raw.date) : new Date(),
  };
}

// RemoteOK's raw fields (including title/company, not just the HTML description) carry
// unescaped entities like "&amp;" — decode them everywhere, not just inside stripHtml's
// tag-removal path.
function decodeEntities(text: string): string {
  return text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "));
}

function matchesQuery(posting: NormalizedJobPosting, raw: RemoteOkEntry, keywords: string): boolean {
  const needle = keywords.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [posting.title, posting.description, ...(raw.tags ?? [])].join(" ").toLowerCase();
  return haystack.includes(needle);
}

export class RemoteOkJobSearchProvider implements JobSearchProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async searchJobs(query: JobSearchQuery): Promise<NormalizedJobPosting[]> {
    let response: Response;
    try {
      response = await this.fetchImpl(REMOTEOK_URL, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CareerBot/1.0)" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw providerUnavailable("RemoteOK is unavailable.");
    }
    if (!response.ok) {
      throw providerUnavailable("RemoteOK is unavailable.");
    }

    let body: RemoteOkEntry[];
    try {
      body = (await response.json()) as RemoteOkEntry[];
    } catch {
      throw providerUnavailable("RemoteOK returned an unreadable response.");
    }

    const results: NormalizedJobPosting[] = [];
    for (const raw of body) {
      const posting = normalizeRemoteOkEntry(raw);
      if (posting && matchesQuery(posting, raw, query.keywords)) {
        results.push(posting);
      }
    }
    return results.slice(0, 30);
  }
}
