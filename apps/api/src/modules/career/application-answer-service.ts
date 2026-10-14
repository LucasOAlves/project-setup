import { applicationAnswersInputSchema } from "@studio/shared";
import { conflict, notFound, validationError } from "../../app-error.js";
import type { AuditEventInput } from "../audit/audit-repository.js";
import type { ApplicationService } from "./application-service.js";
import type { SavedAnswer } from "./saved-answer-repository.js";

type Deps = {
  applications: Pick<ApplicationService, "get">;
  saveAnswers: (answers: SavedAnswer[]) => Promise<void>;
  setAgreed: (applicationId: string, agreed: string[]) => Promise<void>;
  audit: { record(input: AuditEventInput): Promise<void> };
};

// Saves the user's answers to an application's open questions (Milestone 3). Only questions on
// the form the last run read are accepted. Answers are saved by question for every later form,
// and consent applies to this application only. Preparing again uses them.
export class ApplicationAnswerService {
  constructor(private readonly deps: Deps) {}

  async save(applicationId: string, raw: unknown): Promise<{ saved: number; agreed: number }> {
    const parsed = applicationAnswersInputSchema.safeParse(raw);
    if (!parsed.success) throw validationError("Send answers as { questionKey, answer } and agreed question keys.");
    const application = await this.deps.applications.get(applicationId).catch(() => null);
    if (!application) throw notFound("Application not found.");
    if (application.status === "PREPARING") throw conflict("Wait for the current preparation to finish.");
    const plan = application.plan ?? [];
    const byKey = new Map(plan.map((field) => [field.questionKey, field]));

    const answers: SavedAnswer[] = [];
    for (const { questionKey, answer } of parsed.data.answers) {
      const field = byKey.get(questionKey);
      if (!field) throw validationError("One of the answers is for a question this form does not ask.");
      if (field.kind === "FILE" || (field.kind === "CHECKBOX" && field.options.length === 0)) {
        throw validationError(`"${field.label}" is not answered with text.`);
      }
      if (field.options.length > 0 && field.kind !== "CHECKBOX" && !field.options.includes(answer)) {
        throw validationError(`"${answer}" is not one of the options for "${field.label}".`);
      }
      answers.push({ questionKey, label: field.label, answer });
    }
    for (const questionKey of parsed.data.agreed) {
      const field = byKey.get(questionKey);
      if (!field || field.kind !== "CHECKBOX" || field.options.length > 0) {
        throw validationError("Only consent boxes on this form can be agreed to.");
      }
    }

    await this.deps.saveAnswers(answers);
    await this.deps.setAgreed(application.id, parsed.data.agreed);
    // Counts only: answers can carry personal details.
    await this.deps.audit.record({
      eventType: "APPLICATION_ANSWERS_SAVED",
      actor: "USER",
      entityType: "application",
      entityId: application.id,
      payload: { jobId: application.jobId, answers: answers.length, agreed: parsed.data.agreed.length },
    });
    return { saved: answers.length, agreed: parsed.data.agreed.length };
  }
}
