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
};

export interface JobProvider {
  listJobs(boardToken: string): Promise<NormalizedJobPosting[]>;
}
