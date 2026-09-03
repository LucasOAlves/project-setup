import type { NormalizedJobPosting } from "./job-provider.js";

// Same provider-isolation shape as JobProvider (ADR-011), but for aggregators queried by
// keyword instead of a single company's board token — results can span many companies, so
// `companyNameFromSource` on each posting is load-bearing here (CareerService.importSearchResult
// uses it to find-or-create the Company), where board providers mostly ignore it.
export type JobSearchQuery = {
  keywords: string;
  location?: string;
};

export interface JobSearchProvider {
  searchJobs(query: JobSearchQuery): Promise<NormalizedJobPosting[]>;
}
