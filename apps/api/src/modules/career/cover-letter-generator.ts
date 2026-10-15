import {
  coverLetterEditSchema,
  coverLetterModelOutputSchema,
  type ApplicationDocumentPublic,
  type CoverLetterContent,
  type TextProviderName,
} from "@studio/shared";
import { malformedAiOutput, validationError } from "../../app-error.js";
import { parseJsonObject } from "../ai/parse-json.js";
import {
  COVER_LETTER_PROMPT_VERSION,
  COVER_LETTER_SYSTEM_PROMPT,
  buildCoverLetterUserPrompt,
} from "../ai/prompts/cover-letter.v1.js";
import { resolveTextProvider } from "../ai/resolve-provider.js";
import { groundCoverLetter } from "./cover-letter.js";
import { buildCoverLetterPdf } from "./cover-letter-pdf.js";
import { buildProfileText } from "./job-explanation.js";
import { loadMaterialsContext, materialsJobText } from "./materials-context.js";
import { cvDetailsSections, type TailoredCvGeneratorDeps } from "./tailored-cv-generator.js";

export type CoverLetterGeneratorDeps = Omit<TailoredCvGeneratorDeps, "renderPdf"> & {
  renderPdf?: (letter: CoverLetterContent) => Promise<Buffer>;
};

type SaveResult = { document: ApplicationDocumentPublic; created: boolean };

// Optional cover letter (Milestone 2, ticket 4): generated only on request. The model writes
// the body with evidence per sentence, cover-letter.ts keeps what the sources support, and
// code adds the greeting, sign-off and header. The user's edit is saved as an EDITED version.
export class CoverLetterGenerator {
  private readonly renderPdf: (letter: CoverLetterContent) => Promise<Buffer>;

  constructor(private readonly deps: CoverLetterGeneratorDeps) {
    this.renderPdf = deps.renderPdf ?? buildCoverLetterPdf;
  }

  private async load(jobId: string) {
    const context = await loadMaterialsContext(this.deps, jobId, "writing a cover letter");
    return {
      ...context,
      frame: {
        job: { title: context.job.title, companyName: context.companyName },
        header: { fullName: context.profile.fullName, contactLine: cvDetailsSections(context.details).contactLine },
      },
    };
  }

  private async save(jobId: string, origin: "GENERATED" | "EDITED", loaded: Awaited<ReturnType<CoverLetterGenerator["load"]>>, content: CoverLetterContent): Promise<SaveResult> {
    return this.deps.documents.save({
      jobId,
      type: "COVER_LETTER",
      origin,
      profileVersion: loaded.profileVersion,
      detailsVersion: loaded.details?.version ?? null,
      content,
      file: { bytes: await this.renderPdf(content), mimeType: "application/pdf" },
    });
  }

  async generate(jobId: string, provider?: TextProviderName): Promise<SaveResult> {
    const loaded = await this.load(jobId);
    const { profile, companyName } = loaded;
    const jobText = materialsJobText(loaded);
    const profileText = buildProfileText(profile);

    const text = resolveTextProvider(this.deps.textProviders, this.deps.defaultTextProvider, provider);
    const generated = await text.generateText({
      purpose: COVER_LETTER_PROMPT_VERSION,
      system: COVER_LETTER_SYSTEM_PROMPT,
      user: buildCoverLetterUserPrompt({ jobText, profileText }),
    });
    const parsed = coverLetterModelOutputSchema.safeParse(parseJsonObject(generated.text));
    if (!parsed.success) {
      throw malformedAiOutput("The model returned a cover letter that did not match the required structure.");
    }
    const grounded = groundCoverLetter(parsed.data, { profileText, jobText, profileTechnologies: profile.technologies });
    if (grounded.paragraphs.length === 0) {
      throw malformedAiOutput("No sentence of the generated cover letter was supported by your profile. Nothing was saved.");
    }

    return this.save(jobId, "GENERATED", loaded, {
      format: "cover-letter@1",
      promptVersion: COVER_LETTER_PROMPT_VERSION,
      ...loaded.frame,
      greeting: companyName ? `Dear ${companyName} hiring team,` : "Dear hiring team,",
      paragraphs: grounded.paragraphs,
      signOff: profile.fullName ? `Best regards,\n${profile.fullName}` : "Best regards,",
      droppedSentences: grounded.droppedSentences,
    });
  }

  async saveEdit(jobId: string, raw: unknown): Promise<SaveResult> {
    const parsed = coverLetterEditSchema.safeParse(raw);
    if (!parsed.success) {
      throw validationError("The edited cover letter needs a greeting, at least one paragraph and a sign-off.");
    }
    const loaded = await this.load(jobId);
    return this.save(jobId, "EDITED", loaded, {
      format: "cover-letter@1",
      promptVersion: null,
      ...loaded.frame,
      ...parsed.data,
      droppedSentences: 0,
    });
  }
}
