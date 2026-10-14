import { providerUnavailable } from "../../app-error.js";
import type { JobProvider, NormalizedJobPosting } from "./job-provider.js";

// Real, documented, unauthenticated public endpoint — see ashbyhq.com/product-updates/developer-api-updates.
// `includeCompensation=true` adds the pay range when the company publishes one; without it the
// salary is left out even for postings that show it on the careers page.
const ASHBY_BOARD_URL = (boardToken: string) =>
  `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardToken)}?includeCompensation=true`;

type AshbyCompensationComponent = {
  compensationType?: string | null;
  interval?: string | null;
  currencyCode?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
};

type AshbyCompensation = {
  compensationTierSummary?: string | null;
  scrapeableCompensationSalarySummary?: string | null;
  summaryComponents?: AshbyCompensationComponent[] | null;
};

type AshbyJob = {
  id?: string | null;
  title?: string | null;
  jobUrl?: string | null;
  applyUrl?: string | null;
  location?: string | null;
  descriptionPlain?: string | null;
  publishedAt?: string | null;
  employmentType?: string | null;
  compensation?: AshbyCompensation | null;
};

type AshbyBoardResponse = {
  jobs?: AshbyJob[];
};

// Ashby reports the interval as "1 YEAR", "1 MONTH", "1 HOUR". Only the salary component is
// used: equity and bonus components are not part of the monthly pay the match compares.
function ashbySalary(compensation: AshbyCompensation | null | undefined): NormalizedJobPosting["salary"] {
  if (!compensation) return undefined;
  const salary = compensation.summaryComponents?.find(
    (component) => component.compensationType?.toLowerCase() === "salary",
  );
  const text = compensation.scrapeableCompensationSalarySummary ?? compensation.compensationTierSummary ?? null;
  if (!salary && !text) return undefined;
  return {
    min: salary?.minValue ?? null,
    max: salary?.maxValue ?? null,
    currency: salary?.currencyCode ?? null,
    period: salary?.interval?.trim().split(/\s+/).pop()?.toLowerCase() ?? null,
    text,
  };
}

export function normalizeAshbyJob(raw: AshbyJob): NormalizedJobPosting | null {
  const title = raw.title?.trim() ?? "";
  const url = (raw.jobUrl ?? raw.applyUrl)?.trim() ?? "";
  const externalId = raw.id?.trim() ?? "";
  if (!title || !url || !externalId) {
    return null;
  }

  return {
    externalId,
    title,
    url,
    location: raw.location?.trim() ?? "",
    description: (raw.descriptionPlain ?? "").trim().slice(0, 20_000),
    // Ashby's board response has no company field — it's implicit in the board token itself.
    companyNameFromSource: "",
    updatedAt: raw.publishedAt ? new Date(raw.publishedAt) : new Date(),
    postedAt: raw.publishedAt ? new Date(raw.publishedAt) : null,
    salary: ashbySalary(raw.compensation),
    employmentType: raw.employmentType ?? null,
  };
}

export class AshbyJobProvider implements JobProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async listJobs(boardToken: string): Promise<NormalizedJobPosting[]> {
    const token = boardToken.trim();
    if (!token) {
      throw providerUnavailable("An Ashby board token is required.");
    }

    let response: Response;
    try {
      response = await this.fetchImpl(ASHBY_BOARD_URL(token), {
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw providerUnavailable("The Ashby job board is unavailable.");
    }

    if (response.status === 404) {
      throw providerUnavailable("No Ashby job board was found for that token.", 404);
    }
    if (!response.ok) {
      throw providerUnavailable("The Ashby job board is unavailable.");
    }

    let body: AshbyBoardResponse;
    try {
      body = (await response.json()) as AshbyBoardResponse;
    } catch {
      throw providerUnavailable("The Ashby job board returned an unreadable response.");
    }

    return (body.jobs ?? [])
      .map((job) => normalizeAshbyJob(job))
      .filter((job): job is NormalizedJobPosting => job !== null);
  }
}
