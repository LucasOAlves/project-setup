import {
  tailoredCvModelOutputSchema,
  type ApplicationDetailsPublic,
  type ApplicationDocumentPublic,
  type ProfilePublic,
  type TailoredCvContent,
  type TextProviderName,
} from "@studio/shared";
import { malformedAiOutput, notFound } from "../../app-error.js";
import { parseJsonObject } from "../ai/parse-json.js";
import {
  TAILORED_CV_PROMPT_VERSION,
  TAILORED_CV_SYSTEM_PROMPT,
  buildTailoredCvUserPrompt,
} from "../ai/prompts/tailored-cv.v1.js";
import { resolveTextProvider } from "../ai/resolve-provider.js";
import type { TextGenerationProvider } from "../ai/text-generation-provider.js";
import type { ApplicationDocumentService } from "./application-document-service.js";
import type { CareerRepository } from "./career-repository.js";
import { buildProfileText } from "./job-explanation.js";
import { experienceBullets, groundTailoredCv } from "./tailored-cv.js";
import { buildTailoredCvPdf } from "./tailored-cv-pdf.js";

export type TailoredCvGeneratorDeps = {
  careerRepo: Pick<CareerRepository, "getJob" | "getCompany" | "getProfileVersion">;
  getProfile: () => Promise<ProfilePublic | null>;
  getApplicationDetails: () => Promise<ApplicationDetailsPublic | null>;
  textProviders: Record<TextProviderName, TextGenerationProvider>;
  defaultTextProvider: TextProviderName;
  documents: Pick<ApplicationDocumentService, "save">;
  renderPdf?: (cv: TailoredCvContent) => Promise<Buffer>;
};

const LEVEL_LABELS: Record<string, string> = {
  NATIVE: "Native",
  FLUENT: "Fluent",
  ADVANCED: "Advanced",
  INTERMEDIATE: "Intermediate",
  BASIC: "Basic",
};

function years(start: number | null, end: number | null): string {
  if (start && end) return ` (${start}–${end})`;
  if (end ?? start) return ` (${end ?? start})`;
  return "";
}

// The parts of the CV that come from application details, not from the model.
export function cvDetailsSections(details: ApplicationDetailsPublic | null) {
  const contact = details?.contact;
  return {
    contactLine: [contact?.email, contact?.phone, [contact?.city, contact?.country].filter(Boolean).join(", ")]
      .filter(Boolean)
      .join(" · "),
    links: [contact?.linkedinUrl, contact?.githubUrl, contact?.portfolioUrl].filter((link): link is string => Boolean(link)),
    education: (details?.education ?? []).map(
      (item) =>
        `${[item.degree, item.field, item.institution].filter(Boolean).join(", ")}${years(item.startYear, item.endYear)}`,
    ),
    certifications: (details?.certifications ?? []).map(
      (item) => `${item.name}${item.issuer ? `, ${item.issuer}` : ""}${item.year ? ` (${item.year})` : ""}`,
    ),
    languages: (details?.spokenLanguages ?? []).map((item) => `${item.language} (${LEVEL_LABELS[item.level] ?? item.level})`),
    missingDetails: !details
      ? ["Application details"]
      : [
          ...(contact?.email ? [] : ["Email"]),
          ...(contact?.country ? [] : ["Country"]),
          ...(details.spokenLanguages.length > 0 ? [] : ["Spoken languages"]),
        ],
  };
}

// Tailored CV v2 (Milestone 2, ticket 3): the model picks, tailored-cv.ts grounds, the result is
// rendered and saved as an immutable document version (ADR-018).
export class TailoredCvGenerator {
  private readonly renderPdf: (cv: TailoredCvContent) => Promise<Buffer>;

  constructor(private readonly deps: TailoredCvGeneratorDeps) {
    this.renderPdf = deps.renderPdf ?? buildTailoredCvPdf;
  }

  async generate(
    jobId: string,
    provider?: TextProviderName,
  ): Promise<{ document: ApplicationDocumentPublic; created: boolean }> {
    const job = await this.deps.careerRepo.getJob(jobId);
    if (!job) throw notFound("That job does not exist.");
    const profile = await this.deps.getProfile();
    if (!profile) throw notFound("Save a professional profile before generating a CV.");
    const [company, details, profileVersion] = await Promise.all([
      this.deps.careerRepo.getCompany(job.companyId),
      this.deps.getApplicationDetails(),
      this.deps.careerRepo.getProfileVersion(),
    ]);

    const jobDescription = job.rawDescription || job.description;
    const promptInput = {
      job: { title: job.title, description: jobDescription, requirements: job.requirements, technologies: job.technologies },
      profile: {
        yearsOfExperience: profile.yearsOfExperience,
        topSkills: profile.topSkills,
        technologies: profile.technologies,
        experiences: profile.experiences.map((experience) => ({
          id: experience.id,
          role: experience.role,
          startPeriod: experience.startPeriod,
          endPeriod: experience.endPeriod,
          technologies: experience.technologies,
          bullets: experienceBullets(experience),
        })),
      },
    };
    const text = resolveTextProvider(this.deps.textProviders, this.deps.defaultTextProvider, provider);
    const generated = await text.generateText({
      purpose: TAILORED_CV_PROMPT_VERSION,
      system: TAILORED_CV_SYSTEM_PROMPT,
      user: buildTailoredCvUserPrompt(promptInput),
    });
    const parsed = tailoredCvModelOutputSchema.safeParse(parseJsonObject(generated.text));
    if (!parsed.success) {
      throw malformedAiOutput("The model returned a CV that did not match the required structure.");
    }

    const grounded = groundTailoredCv(parsed.data, profile, {
      profileText: buildProfileText(profile),
      jobText: [job.title, jobDescription, ...job.requirements, job.technologies.join(", ")].join("\n"),
    });
    const sections = cvDetailsSections(details);
    const content: TailoredCvContent = {
      format: "tailored-cv@1",
      promptVersion: TAILORED_CV_PROMPT_VERSION,
      job: { title: job.title, companyName: company?.name ?? "" },
      header: {
        fullName: profile.fullName,
        headline: profile.headline || profile.currentJobTitle,
        contactLine: sections.contactLine,
        links: sections.links,
      },
      rationale: grounded.rationale,
      summary: grounded.summary,
      droppedSummarySentences: grounded.droppedSummarySentences,
      experiences: grounded.experiences,
      topSkills: grounded.topSkills,
      technologies: grounded.technologies,
      education: sections.education,
      certifications: sections.certifications,
      languages: sections.languages,
      gaps: grounded.gaps,
      missingDetails: sections.missingDetails,
    };

    return this.deps.documents.save({
      jobId,
      type: "CV",
      origin: "GENERATED",
      profileVersion,
      detailsVersion: details?.version ?? null,
      content,
      file: { bytes: await this.renderPdf(content), mimeType: "application/pdf" },
    });
  }
}
