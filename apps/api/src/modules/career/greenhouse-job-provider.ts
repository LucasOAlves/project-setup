import { providerUnavailable } from "../../app-error.js";
import type { JobProvider, NormalizedJobPosting } from "./job-provider.js";

// Real, documented, unauthenticated public endpoint — no OAuth, no API key, no LinkedIn-style
// ToS risk. See docs.greenhouse.io/job-board.html. `content=true` includes the full job
// description in the same response so this stays a single request per board.
const GREENHOUSE_BOARD_URL = (boardToken: string) =>
  `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`;

type GreenhouseJob = {
  id?: number | string | null;
  title?: string | null;
  absolute_url?: string | null;
  location?: { name?: string | null } | null;
  content?: string | null;
  company_name?: string | null;
  updated_at?: string | null;
};

type GreenhouseBoardResponse = {
  jobs?: GreenhouseJob[];
};

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeGreenhouseJob(raw: GreenhouseJob): NormalizedJobPosting | null {
  const title = raw.title?.trim() ?? "";
  const url = raw.absolute_url?.trim() ?? "";
  const externalId = raw.id === null || raw.id === undefined ? "" : String(raw.id).trim();
  if (!title || !url || !externalId) {
    return null;
  }

  return {
    externalId,
    title,
    url,
    location: raw.location?.name?.trim() ?? "",
    description: raw.content ? stripHtml(raw.content).slice(0, 20_000) : "",
    companyNameFromSource: raw.company_name?.trim() ?? "",
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : new Date(),
  };
}

export class GreenhouseJobProvider implements JobProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async listJobs(boardToken: string): Promise<NormalizedJobPosting[]> {
    const token = boardToken.trim();
    if (!token) {
      throw providerUnavailable("A Greenhouse board token is required.");
    }

    let response: Response;
    try {
      response = await this.fetchImpl(GREENHOUSE_BOARD_URL(token), {
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw providerUnavailable("The Greenhouse job board is unavailable.");
    }

    if (response.status === 404) {
      throw providerUnavailable("No Greenhouse job board was found for that token.", 404);
    }
    if (!response.ok) {
      throw providerUnavailable("The Greenhouse job board is unavailable.");
    }

    let body: GreenhouseBoardResponse;
    try {
      body = (await response.json()) as GreenhouseBoardResponse;
    } catch {
      throw providerUnavailable("The Greenhouse job board returned an unreadable response.");
    }

    return (body.jobs ?? [])
      .map((job) => normalizeGreenhouseJob(job))
      .filter((job): job is NormalizedJobPosting => job !== null);
  }
}
