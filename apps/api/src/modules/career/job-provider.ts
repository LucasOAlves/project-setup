// Provider isolation (ADR-002/ADR-011, .skills/provider-isolation): the Career domain never
// imports a vendor SDK or vendor JSON shape directly. This interface names the capability
// ("give me normalized job postings from an external board"), not the vendor — Greenhouse is
// the first adapter; Lever or others can be added later without changing anything that
// depends on this interface.
export type NormalizedJobPosting = {
  externalId: string;
  title: string;
  url: string;
  location: string;
  description: string;
  companyNameFromSource: string;
  updatedAt: Date;
  // Optional facts some sources report (Job Hunter normalization, JOB-006). Left undefined
  // when a source does not say; never filled with a guess.
  salary?: {
    min?: number | null;
    max?: number | null;
    currency?: string | null;
    period?: string | null;
    text?: string | null;
  };
  employmentType?: string | null;
  postedAt?: Date | null;
};

export interface JobProvider {
  listJobs(boardToken: string): Promise<NormalizedJobPosting[]>;
}
