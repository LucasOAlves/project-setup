import {
  tailoredCvModelOutputSchema,
  type ApplicationDetailsPublic,
  type ApplicationDocumentPublic,
  type TailoredCvContent,
  type TextProviderName,
} from "@studio/shared";
import { malformedAiOutput } from "../../app-error.js";
import { parseJsonObject } from "../ai/parse-json.js";
import {
  TAILORED_CV_PROMPT_VERSION,
  TAILORED_CV_SYSTEM_PROMPT,
  buildTailoredCvUserPrompt,
} from "../ai/prompts/tailored-cv.v1.js";
import { resolveTextProvider } from "../ai/resolve-provider.js";
import { buildProfileText } from "./job-explanation.js";
import { loadMaterialsContext, type MaterialsDeps } from "./materials-context.js";
import { experienceBullets, groundTailoredCv } from "./tailored-cv.js";
import { buildTailoredCvPdf } from "./tailored-cv-pdf.js";

export type TailoredCvGeneratorDeps = MaterialsDeps & {
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
    const { job, companyName, profile, details, profileVersion } = await loadMaterialsContext(this.deps, jobId, "generating a CV");

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
      job: { title: job.title, companyName },
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
