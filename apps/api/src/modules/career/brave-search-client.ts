import { providerUnavailable } from "../../app-error.js";

// Brave Search API, web search (api.search.brave.com/res/v1/web/search): an official, paid
// API with its own index. It stands in for Google's `site:` searches, since Google's Custom
// Search JSON API no longer takes new customers and scraping Google is against its terms.
// Only result URLs are used, to find postings on ATS boards; no result content is stored.
const BRAVE_WEB_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

export type WebSearchResult = { url: string; title: string };

export interface WebSearchClient {
  search(query: string): Promise<WebSearchResult[]>;
}

type BraveResponse = { web?: { results?: Array<{ url?: string | null; title?: string | null }> } };

export class BraveSearchClient implements WebSearchClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search(query: string): Promise<WebSearchResult[]> {
    // Past week, the guide's date filter. 20 is the most Brave returns per request.
    const params = new URLSearchParams({ q: query, count: "20", freshness: "pw", country: "ALL" });
    let response: Response;
    try {
      response = await this.fetchImpl(`${BRAVE_WEB_SEARCH_URL}?${params}`, {
        headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw providerUnavailable("Brave Search is unavailable.");
    }
    if (response.status === 401 || response.status === 403) {
      throw providerUnavailable("Brave Search rejected the API key.");
    }
    if (!response.ok) {
      throw providerUnavailable("Brave Search is unavailable.");
    }

    let body: BraveResponse;
    try {
      body = (await response.json()) as BraveResponse;
    } catch {
      throw providerUnavailable("Brave Search returned an unreadable response.");
    }
    return (body.web?.results ?? [])
      .map((result) => ({ url: result.url?.trim() ?? "", title: result.title?.trim() ?? "" }))
      .filter((result) => result.url);
  }
}
