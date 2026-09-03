import { providerUnavailable } from "../../app-error.js";
import type { JobProvider, NormalizedJobPosting } from "./job-provider.js";

// Real, documented, unauthenticated public endpoint — see 100hires.com/lever-api.html and
// jobspipe.dev/sources/lever. `mode=json` on this endpoint is a no-op (the endpoint always
// returns JSON) but is kept for explicitness/parity with providers that do need it.
const LEVER_BOARD_URL = (boardToken: string) =>
  `https://api.lever.co/v0/postings/${encodeURIComponent(boardToken)}?mode=json`;

type LeverPosting = {
  id?: string | null;
  text?: string | null;
  hostedUrl?: string | null;
  categories?: { location?: string | null } | null;
  descriptionPlain?: string | null;
  createdAt?: number | null;
};

export function normalizeLeverPosting(raw: LeverPosting): NormalizedJobPosting | null {
  const title = raw.text?.trim() ?? "";
  const url = raw.hostedUrl?.trim() ?? "";
  const externalId = raw.id?.trim() ?? "";
  if (!title || !url || !externalId) {
    return null;
  }

  return {
    externalId,
    title,
    url,
    location: raw.categories?.location?.trim() ?? "",
    description: (raw.descriptionPlain ?? "").trim().slice(0, 20_000),
    // Lever's board response has no company field — it's implicit in the board token itself.
    companyNameFromSource: "",
    updatedAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
  };
}

export class LeverJobProvider implements JobProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async listJobs(boardToken: string): Promise<NormalizedJobPosting[]> {
    const token = boardToken.trim();
    if (!token) {
      throw providerUnavailable("A Lever board token is required.");
    }

    let response: Response;
    try {
      response = await this.fetchImpl(LEVER_BOARD_URL(token), {
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw providerUnavailable("The Lever job board is unavailable.");
    }

    if (response.status === 404) {
      throw providerUnavailable("No Lever job board was found for that token.", 404);
    }
    if (!response.ok) {
      throw providerUnavailable("The Lever job board is unavailable.");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw providerUnavailable("The Lever job board returned an unreadable response.");
    }

    // Lever's board also returns { ok: false, error: "..." } with a 200 status for an unknown token.
    if (!Array.isArray(body)) {
      throw providerUnavailable("No Lever job board was found for that token.", 404);
    }

    return (body as LeverPosting[])
      .map((posting) => normalizeLeverPosting(posting))
      .filter((posting): posting is NormalizedJobPosting => posting !== null);
  }
}
