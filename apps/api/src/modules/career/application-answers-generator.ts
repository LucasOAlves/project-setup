import {
  applicationAnswersEditSchema,
  openAnswerModelOutputSchema,
  type ApplicationAnswersContent,
  type ApplicationDocumentPublic,
  type TextProviderName,
} from "@studio/shared";
import { notFound, validationError } from "../../app-error.js";
import { parseJsonObject } from "../ai/parse-json.js";
import {
  APPLICATION_ANSWERS_PROMPT_VERSION,
  APPLICATION_ANSWERS_SYSTEM_PROMPT,
  buildApplicationAnswersUserPrompt,
} from "../ai/prompts/application-answers.v1.js";
import { resolveTextProvider } from "../ai/resolve-provider.js";
import { buildApplicationAnswers, type ApplicationAnswer } from "./application-answers.js";
import { groundCoverLetter } from "./cover-letter.js";
import { buildProfileText } from "./job-explanation.js";
import { detectTechnologies } from "./job-matching.js";
import { loadMaterialsContext, materialsJobText, type MaterialsDeps } from "./materials-context.js";

type SaveResult = { document: ApplicationDocumentPublic; created: boolean };

const WHY_QUESTION = { id: "WHY_COMPANY", question: "Why do you want to work here?" };

// Application answers (Milestone 2, ticket 5): the fixed question bank answered from application
// details and the profile (application-answers.ts), plus a grounded draft of "why this company".
// No PDF: answers are pasted into forms. The user's changes are saved as an EDITED version.
export class ApplicationAnswersGenerator {
  constructor(private readonly deps: MaterialsDeps, private readonly now: () => Date = () => new Date()) {}

  async generate(jobId: string, provider?: TextProviderName): Promise<SaveResult> {
    const context = await loadMaterialsContext(this.deps, jobId, "preparing application answers");
    const { job, profile, details, companyName } = context;
    const jobText = materialsJobText(context);
    const profileText = buildProfileText(profile);

    // The job's technologies in order of first mention, then any listed only on the job record.
    const jobTechnologies = [...new Set([...detectTechnologies(jobText), ...job.technologies.flatMap((tech) => detectTechnologies(tech))])];
    const answers: ApplicationAnswer[] = buildApplicationAnswers({ profile, details, jobTechnologies, now: this.now() });

    let dropped = 0;
    let why: ApplicationAnswer;
    try {
      const text = resolveTextProvider(this.deps.textProviders, this.deps.defaultTextProvider, provider);
      const generated = await text.generateText({
        purpose: APPLICATION_ANSWERS_PROMPT_VERSION,
        system: APPLICATION_ANSWERS_SYSTEM_PROMPT,
        user: buildApplicationAnswersUserPrompt({ jobText, profileText }),
      });
      const parsed = openAnswerModelOutputSchema.safeParse(parseJsonObject(generated.text));
      if (!parsed.success) throw new Error("The model's answer did not match the required structure.");
      const grounded = groundCoverLetter({ paragraphs: [parsed.data] }, { profileText, jobText, profileTechnologies: profile.technologies });
      dropped = grounded.droppedSentences;
      why = grounded.paragraphs[0]
        ? { ...WHY_QUESTION, answer: grounded.paragraphs[0], status: "DRAFTED", note: "Drafted from your profile. Review it before using it." }
        : { ...WHY_QUESTION, answer: "", status: "NEEDS_INPUT", note: "No drafted sentence was supported by your profile. Write this one yourself." };
    } catch (error) {
      // The rest of the answers do not depend on a model; save them and leave this one to the user.
      why = {
        ...WHY_QUESTION,
        answer: "",
        status: "NEEDS_INPUT",
        note: `Could not draft this answer: ${error instanceof Error ? error.message : "the text provider failed"}`,
      };
    }

    const content: ApplicationAnswersContent = {
      format: "application-answers@1",
      promptVersion: APPLICATION_ANSWERS_PROMPT_VERSION,
      job: { title: job.title, companyName },
      answers: [...answers, why],
      droppedSentences: dropped,
    };
    return this.deps.documents.save({
      jobId,
      type: "APPLICATION_ANSWERS",
      origin: "GENERATED",
      profileVersion: context.profileVersion,
      detailsVersion: details?.version ?? null,
      content,
    });
  }

  // Applies the user's answers to the latest version's questions; a blank answer means "not answered".
  async saveEdit(jobId: string, raw: unknown): Promise<SaveResult> {
    const parsed = applicationAnswersEditSchema.safeParse(raw);
    if (!parsed.success) throw validationError("The edited answers are invalid.");
    const context = await loadMaterialsContext(this.deps, jobId, "editing application answers");
    const latest = await this.deps.documents.latest(jobId, "APPLICATION_ANSWERS");
    if (!latest) throw notFound("Generate the application answers before editing them.");
    const previous = latest.content as ApplicationAnswersContent;
    const edits = new Map(parsed.data.answers.map((item) => [item.id, item.answer]));
    const unknown = [...edits.keys()].filter((id) => !previous.answers.some((answer) => answer.id === id));
    if (unknown.length > 0) throw validationError(`Unknown question: ${unknown[0]}.`);

    const content: ApplicationAnswersContent = {
      ...previous,
      promptVersion: null,
      answers: previous.answers.map((answer): ApplicationAnswer => {
        const edited = edits.get(answer.id);
        if (edited === undefined || edited === answer.answer) return answer;
        return edited
          ? { id: answer.id, question: answer.question, answer: edited, status: "FROM_YOU" }
          : { id: answer.id, question: answer.question, answer: "", status: "NEEDS_INPUT" };
      }),
    };
    return this.deps.documents.save({
      jobId,
      type: "APPLICATION_ANSWERS",
      origin: "EDITED",
      profileVersion: context.profileVersion,
      detailsVersion: context.details?.version ?? null,
      content,
    });
  }
}
