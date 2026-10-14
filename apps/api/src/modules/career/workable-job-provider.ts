import { providerUnavailable } from "../../app-error.js";
import { stripHtml } from "./greenhouse-job-provider.js";
import type { JobProvider, NormalizedJobPosting } from "./job-provider.js";

// Workable's public careers-widget endpoint: unauthenticated, one account per request, the same
// data the company's own careers page shows. `details=true` adds the job descriptions. The
// older www.workable.com/api/accounts/<account> path redirects here.
const WORKABLE_BOARD_URL = (account: string) =>
  `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}?details=true`;

type WorkableLocation = {
  location_str?: string | null;
  city?: string | null;
  region?: string | null;
  state?: string | null;
  country?: string | null;
  country_name?: string | null;
  telecommuting?: boolean | null;
};

type WorkableJob = WorkableLocation & {
  title?: string | null;
  shortcode?: string | null;
  url?: string | null;
  shortlink?: string | null;
  application_url?: string | null;
  description?: string | null;
  full_description?: string | null;
  published_on?: string | null;
  created_at?: string | null;
  employment_type?: string | null;
  location?: WorkableLocation | null;
  locations?: WorkableLocation[] | null;
};

type WorkableBoardResponse = {
  name?: string | null;
  jobs?: WorkableJob[];
};

// The widget has reported location both flat on the job and nested; read whichever is there.
function workableLocation(raw: WorkableJob): string {
  const place = raw.location ?? raw.locations?.[0] ?? raw;
  const label =
    place.location_str?.trim() ||
    [place.city, place.region ?? place.state, place.country_name ?? place.country]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(", ");
  const remote = place.telecommuting ?? raw.telecommuting ?? false;
  if (!remote) return label;
  return label ? `Remote (${label})` : "Remote";
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeWorkableJob(raw: WorkableJob, companyName = ""): NormalizedJobPosting | null {
  const title = raw.title?.trim() ?? "";
  const url = (raw.url ?? raw.shortlink ?? raw.application_url)?.trim() ?? "";
  const externalId = raw.shortcode?.trim() ?? "";
  if (!title || !url || !externalId) {
    return null;
  }

  const postedAt = parseDate(raw.published_on ?? raw.created_at);
  return {
    externalId,
    title,
    url,
    location: workableLocation(raw),
    description: stripHtml(raw.full_description ?? raw.description ?? "").slice(0, 20_000),
    companyNameFromSource: companyName.trim(),
    updatedAt: postedAt ?? new Date(),
    postedAt,
    employmentType: raw.employment_type ?? null,
  };
}

export class WorkableJobProvider implements JobProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async listJobs(boardToken: string): Promise<NormalizedJobPosting[]> {
    const account = boardToken.trim();
    if (!account) {
      throw providerUnavailable("A Workable account name is required.");
    }

    let response: Response;
    try {
      response = await this.fetchImpl(WORKABLE_BOARD_URL(account), {
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw providerUnavailable("The Workable job board is unavailable.");
    }

    if (response.status === 404) {
      throw providerUnavailable("No Workable job board was found for that account.", 404);
    }
    if (!response.ok) {
      throw providerUnavailable("The Workable job board is unavailable.");
    }

    let body: WorkableBoardResponse;
    try {
      body = (await response.json()) as WorkableBoardResponse;
    } catch {
      throw providerUnavailable("The Workable job board returned an unreadable response.");
    }

    return (body.jobs ?? [])
      .map((job) => normalizeWorkableJob(job, body.name ?? ""))
      .filter((job): job is NormalizedJobPosting => job !== null);
  }
}
