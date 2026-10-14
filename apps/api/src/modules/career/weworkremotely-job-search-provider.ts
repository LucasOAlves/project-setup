import { providerUnavailable } from "../../app-error.js";
import { stripHtml } from "./greenhouse-job-provider.js";
import type { JobSearchProvider, JobSearchQuery } from "./job-search-provider.js";
import type { NormalizedJobPosting } from "./job-provider.js";

// We Work Remotely's public RSS feed (weworkremotely.com/remote-job-rss-feed). Terms, as that
// page states them on 2026-10-14: anyone can use the feed, as long as the links point back to
// We Work Remotely, which every posting's URL does. The feed has no search, so the programming
// category is read once and filtered by keyword here; a discovery run with several keywords
// reuses one download.
const WWR_FEED_URL = "https://weworkremotely.com/categories/remote-programming-jobs.rss";
const FEED_CACHE_MS = 10 * 60 * 1000;

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return XML_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

// Text of one child tag: CDATA as is, anything else with XML entities decoded.
function tag(item: string, name: string): string {
  const match = item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"));
  if (!match?.[1]) return "";
  const inner = match[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return (cdata ? cdata[1] ?? "" : decodeXml(inner)).trim();
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseWeWorkRemotelyFeed(xml: string): NormalizedJobPosting[] {
  const postings: NormalizedJobPosting[] = [];
  for (const [, item = ""] of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const url = tag(item, "link") || tag(item, "guid");
    const rawTitle = tag(item, "title");
    const externalId = url.split("/").filter(Boolean).pop() ?? "";
    if (!url || !rawTitle || !externalId) continue;

    // Titles read "Company: Role".
    const separator = rawTitle.indexOf(": ");
    const company = separator > 0 ? rawTitle.slice(0, separator).trim() : "";
    const title = separator > 0 ? rawTitle.slice(separator + 2).trim() : rawTitle;
    const postedAt = parseDate(tag(item, "pubDate"));
    // Skills are listed apart from the description; keep them where matching can read them.
    const skills = tag(item, "skills");
    const description = [stripHtml(tag(item, "description")), skills ? `Skills: ${skills}` : ""]
      .filter(Boolean)
      .join("\n");
    postings.push({
      externalId,
      title,
      url,
      location: [tag(item, "region"), tag(item, "country")].filter(Boolean).join(", "),
      description: description.slice(0, 20_000),
      companyNameFromSource: company,
      updatedAt: postedAt ?? new Date(),
      postedAt,
      employmentType: tag(item, "type") || null,
    });
  }
  return postings;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Every keyword word must appear as a whole word in the title or description (skills included), so "java" does not match "JavaScript".
export function matchesKeywords(posting: NormalizedJobPosting, keywords: string): boolean {
  const words = keywords.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${posting.title} ${posting.description}`.toLowerCase();
  return words.every((word) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(word)}($|[^a-z0-9])`).test(haystack));
}

export class WeWorkRemotelyJobSearchProvider implements JobSearchProvider {
  private cache: { at: number; postings: NormalizedJobPosting[] } | null = null;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async searchJobs(query: JobSearchQuery): Promise<NormalizedJobPosting[]> {
    const postings = await this.feed();
    return postings.filter((posting) => matchesKeywords(posting, query.keywords));
  }

  private async feed(): Promise<NormalizedJobPosting[]> {
    if (this.cache && Date.now() - this.cache.at < FEED_CACHE_MS) return this.cache.postings;

    let response: Response;
    try {
      response = await this.fetchImpl(WWR_FEED_URL, { signal: AbortSignal.timeout(15_000) });
    } catch {
      throw providerUnavailable("We Work Remotely is unavailable.");
    }
    if (!response.ok) {
      throw providerUnavailable("We Work Remotely is unavailable.");
    }
    const postings = parseWeWorkRemotelyFeed(await response.text());
    this.cache = { at: Date.now(), postings };
    return postings;
  }
}
