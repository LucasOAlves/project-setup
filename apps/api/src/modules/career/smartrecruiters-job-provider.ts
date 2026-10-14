import { providerUnavailable } from "../../app-error.js";
import { stripHtml } from "./greenhouse-job-provider.js";
import type { JobProvider, NormalizedJobPosting } from "./job-provider.js";

// SmartRecruiters' public Posting API (developers.smartrecruiters.com/docs/endpoints): no key,
// one company per request. The list has no description, so each posting's detail is fetched
// too: a few at a time, and at most MAX_POSTINGS per import, to stay a light, polite client.
const API = "https://api.smartrecruiters.com/v1/companies";
const MAX_POSTINGS = 100;
const DETAIL_CONCURRENCY = 4;

type SmartRecruitersLocation = {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  remote?: boolean | null;
  fullLocation?: string | null;
};

type SmartRecruitersSection = { title?: string | null; text?: string | null };

type SmartRecruitersPosting = {
  id?: string | null;
  name?: string | null;
  releasedDate?: string | null;
  company?: { name?: string | null; identifier?: string | null } | null;
  location?: SmartRecruitersLocation | null;
  typeOfEmployment?: { id?: string | null; label?: string | null } | null;
  postingUrl?: string | null;
  applyUrl?: string | null;
  jobAd?: {
    sections?: {
      companyDescription?: SmartRecruitersSection | null;
      jobDescription?: SmartRecruitersSection | null;
      qualifications?: SmartRecruitersSection | null;
      additionalInformation?: SmartRecruitersSection | null;
    } | null;
  } | null;
};

type SmartRecruitersListResponse = { content?: SmartRecruitersPosting[] };

function smartRecruitersLocation(location: SmartRecruitersLocation | null | undefined): string {
  if (!location) return "";
  const label =
    location.fullLocation?.trim() ||
    [location.city, location.region, location.country]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(", ");
  if (!location.remote) return label;
  return label ? `Remote (${label})` : "Remote";
}

function jobAdText(posting: SmartRecruitersPosting): string {
  const sections = posting.jobAd?.sections;
  if (!sections) return "";
  return [sections.jobDescription, sections.qualifications, sections.additionalInformation, sections.companyDescription]
    .map((section) => (section?.text ? stripHtml(section.text) : ""))
    .filter(Boolean)
    .join("\n\n");
}

export function normalizeSmartRecruitersPosting(
  raw: SmartRecruitersPosting,
  companyIdentifier: string,
): NormalizedJobPosting | null {
  const title = raw.name?.trim() ?? "";
  const externalId = raw.id?.trim() ?? "";
  if (!title || !externalId) {
    return null;
  }

  const url =
    raw.postingUrl?.trim() ||
    `https://jobs.smartrecruiters.com/${encodeURIComponent(companyIdentifier)}/${encodeURIComponent(externalId)}`;
  const released = raw.releasedDate ? new Date(raw.releasedDate) : null;
  const postedAt = released && !Number.isNaN(released.getTime()) ? released : null;
  return {
    externalId,
    title,
    url,
    location: smartRecruitersLocation(raw.location),
    description: jobAdText(raw).slice(0, 20_000),
    companyNameFromSource: raw.company?.name?.trim() ?? "",
    updatedAt: postedAt ?? new Date(),
    postedAt,
    employmentType: raw.typeOfEmployment?.label ?? raw.typeOfEmployment?.id ?? null,
  };
}

export class SmartRecruitersJobProvider implements JobProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async listJobs(boardToken: string): Promise<NormalizedJobPosting[]> {
    const company = boardToken.trim();
    if (!company) {
      throw providerUnavailable("A SmartRecruiters company identifier is required.");
    }

    const list = await this.getJson<SmartRecruitersListResponse>(
      `${API}/${encodeURIComponent(company)}/postings?limit=${MAX_POSTINGS}`,
    );
    const postings = (list.content ?? []).slice(0, MAX_POSTINGS);
    // SmartRecruiters answers an unknown company with an empty list rather than a 404.
    if (postings.length === 0) return [];

    const detailed: SmartRecruitersPosting[] = [];
    for (let start = 0; start < postings.length; start += DETAIL_CONCURRENCY) {
      const batch = postings.slice(start, start + DETAIL_CONCURRENCY);
      detailed.push(
        ...(await Promise.all(
          batch.map(async (posting) => {
            if (!posting.id) return posting;
            try {
              const detail = await this.getJson<SmartRecruitersPosting>(
                `${API}/${encodeURIComponent(company)}/postings/${encodeURIComponent(posting.id)}`,
              );
              // The detail lacks some list fields (releasedDate, typeOfEmployment), so merge.
              return { ...posting, ...detail, releasedDate: posting.releasedDate ?? detail.releasedDate };
            } catch {
              // One missing detail keeps the posting, just without its description.
              return posting;
            }
          }),
        )),
      );
    }

    return detailed
      .map((posting) => normalizeSmartRecruitersPosting(posting, company))
      .filter((posting): posting is NormalizedJobPosting => posting !== null);
  }

  private async getJson<T>(url: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
    } catch {
      throw providerUnavailable("The SmartRecruiters job board is unavailable.");
    }
    if (response.status === 404) {
      throw providerUnavailable("No SmartRecruiters job board was found for that company.", 404);
    }
    if (!response.ok) {
      throw providerUnavailable("The SmartRecruiters job board is unavailable.");
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw providerUnavailable("The SmartRecruiters job board returned an unreadable response.");
    }
  }
}
