import type { JobEmploymentType } from "@studio/shared";
import type { NormalizedJobPosting } from "./job-provider.js";
import {
  extractRegions,
  normalizeEmploymentType,
  normalizeSalary,
  type NormalizedSalary,
  type Region,
} from "./job-normalization.js";
import { canonicalizeJobUrl, isContentHashReliable, jobContentHash } from "./job-provenance.js";

// What gets stored in jobs.normalized_data (spec §7 Job.normalizedData). Versioned so a later
// change to the normalizer can tell which rows were produced by an older rule set.
export type JobNormalizedData = {
  version: 1;
  salary: NormalizedSalary | null;
  regions: Region[];
  employmentType: JobEmploymentType | null;
};

export type ImportedJobFields = {
  source: string;
  externalId: string;
  title: string;
  url: string;
  location: string;
  description: string;
  rawDescription: string;
  canonicalUrl: string;
  contentHash: string;
  sourcePostedAt: Date | null;
  employmentType: JobEmploymentType | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  normalizedData: JobNormalizedData;
};

// Keys used to recognise the same posting arriving from another source (JOB-006). The content
// hash is left out when the description is too thin to tell two postings apart.
export type DedupeKeys = { canonicalUrl: string; contentHash: string | null };

export function prepareImportedJob(
  source: string,
  posting: Omit<NormalizedJobPosting, "companyNameFromSource" | "updatedAt">,
  companyName: string,
): { fields: ImportedJobFields; dedupe: DedupeKeys } {
  const salary = posting.salary ? normalizeSalary(posting.salary) : null;
  const employmentType = normalizeEmploymentType(posting.employmentType);
  const canonicalUrl = canonicalizeJobUrl(posting.url);
  const contentHash = jobContentHash({
    title: posting.title,
    companyName,
    description: posting.description,
  });

  return {
    fields: {
      source,
      externalId: posting.externalId,
      title: posting.title,
      url: posting.url,
      location: posting.location,
      description: posting.description,
      rawDescription: posting.description,
      canonicalUrl,
      contentHash,
      sourcePostedAt: posting.postedAt ?? null,
      employmentType,
      salaryMin: salary ? Math.round(salary.min) : null,
      salaryMax: salary ? Math.round(salary.max) : null,
      salaryCurrency: salary?.currency ?? "",
      normalizedData: {
        version: 1,
        salary,
        regions: extractRegions(posting.location),
        employmentType,
      },
    },
    dedupe: {
      canonicalUrl,
      contentHash: isContentHashReliable(posting.description) ? contentHash : null,
    },
  };
}
