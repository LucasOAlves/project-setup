import type { ApplicationAnswerPublic, ApplicationDetailsPublic, ApplicationDocumentPublic, FieldPlan, FormField } from "@studio/shared";
import { applicationAnswersContentSchema } from "@studio/shared";
import type { AnswerExperience } from "./application-answers.js";
import { mapFormFields, type FieldMapperInput } from "./application-field-mapper.js";

const ONGOING = /\b(present|current|now|today|atual|hoje)\b/i;

export type FillContextDeps = {
  getProfile: () => Promise<{ fullName: string; experiences: Array<AnswerExperience & { company: string }> } | null>;
  getDetails: () => Promise<ApplicationDetailsPublic | null>;
  latestDocument: (jobId: string, type: "CV" | "COVER_LETTER" | "APPLICATION_ANSWERS") => Promise<ApplicationDocumentPublic | null>;
  savedAnswers: () => Promise<Record<string, string>>;
  // Consent boxes the user agreed to, per application's job.
  agreedFor: (jobId: string) => Promise<string[]>;
  now?: () => Date;
};

// Gathers what the field mapper may use for one job, then plans the form's fields.
export class ApplicationFillPlanner {
  constructor(private readonly deps: FillContextDeps) {}

  async context(jobId: string): Promise<Omit<FieldMapperInput, "fields">> {
    const [profile, details, cv, coverLetter, answersDocument, saved, agreed] = await Promise.all([
      this.deps.getProfile(),
      this.deps.getDetails(),
      this.deps.latestDocument(jobId, "CV"),
      this.deps.latestDocument(jobId, "COVER_LETTER"),
      this.deps.latestDocument(jobId, "APPLICATION_ANSWERS"),
      this.deps.savedAnswers(),
      this.deps.agreedFor(jobId),
    ]);
    const experiences = profile?.experiences ?? [];
    const current = experiences.find((experience) => !experience.endPeriod.trim() || ONGOING.test(experience.endPeriod));
    const parsedAnswers = answersDocument ? applicationAnswersContentSchema.safeParse(answersDocument.content) : null;
    const answers: ApplicationAnswerPublic[] = parsedAnswers?.success ? parsedAnswers.data.answers : [];
    return {
      person: { fullName: profile?.fullName ?? "", currentCompany: current?.company ?? "" },
      details,
      answers,
      experiences,
      documents: {
        cv: cv ? { id: cv.id, hasFile: cv.hasFile } : null,
        coverLetter: coverLetter ? { id: coverLetter.id, hasFile: coverLetter.hasFile } : null,
      },
      saved,
      agreed,
      now: this.deps.now?.() ?? new Date(),
    };
  }

  async plan(jobId: string, fields: FormField[]): Promise<FieldPlan[]> {
    return mapFormFields({ fields, ...(await this.context(jobId)) });
  }
}
