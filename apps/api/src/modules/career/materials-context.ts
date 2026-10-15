import type { ApplicationDetailsPublic, ProfilePublic, TextProviderName } from "@studio/shared";
import { notFound } from "../../app-error.js";
import type { TextGenerationProvider } from "../ai/text-generation-provider.js";
import type { ApplicationDocumentService } from "./application-document-service.js";
import type { CareerRepository, JobRow } from "./career-repository.js";

// What every application-material generator (Milestone 2) needs.
export type MaterialsDeps = {
  careerRepo: Pick<CareerRepository, "getJob" | "getCompany" | "getProfileVersion">;
  getProfile: () => Promise<ProfilePublic | null>;
  getApplicationDetails: () => Promise<ApplicationDetailsPublic | null>;
  textProviders: Record<TextProviderName, TextGenerationProvider>;
  defaultTextProvider: TextProviderName;
  documents: Pick<ApplicationDocumentService, "save" | "latest">;
};

export type MaterialsContext = {
  job: JobRow;
  companyName: string;
  profile: ProfilePublic;
  details: ApplicationDetailsPublic | null;
  profileVersion: number;
};

export async function loadMaterialsContext(deps: MaterialsDeps, jobId: string, what: string): Promise<MaterialsContext> {
  const job = await deps.careerRepo.getJob(jobId);
  if (!job) throw notFound("That job does not exist.");
  const profile = await deps.getProfile();
  if (!profile) throw notFound(`Save a professional profile before ${what}.`);
  const [company, details, profileVersion] = await Promise.all([
    deps.careerRepo.getCompany(job.companyId),
    deps.getApplicationDetails(),
    deps.careerRepo.getProfileVersion(),
  ]);
  return { job, companyName: company?.name ?? "", profile, details, profileVersion };
}

// The posting as the model and the grounding checks see it: the source's own text.
export function materialsJobText(context: Pick<MaterialsContext, "job" | "companyName">): string {
  const { job, companyName } = context;
  return [companyName ? `Company: ${companyName}` : "", `Title: ${job.title}`, job.rawDescription || job.description, ...job.requirements]
    .filter(Boolean)
    .join("\n");
}
