import type { SentApplication } from "@studio/shared";
import { conflict, notFound } from "../../app-error.js";
import type { AuditEventInput } from "../audit/audit-repository.js";
import type { RecruiterMessageRepository, RecruiterMessageRow } from "./recruiter-message-repository.js";
import { toPublicMessage } from "./recruiter-mail-service.js";
import { followUpState } from "./response-tracking.js";

type Repo = Pick<RecruiterMessageRepository, "sentApplications" | "forApplications" | "get" | "decide" | "jobFor">;
type Audit = { record(input: AuditEventInput): Promise<void> };
// The Career tracker's own status change, so the job's status event is recorded the same way.
type SetJobStatus = (jobId: string, status: string) => Promise<unknown>;

export const DEFAULT_FOLLOW_UP_DAYS = 10;

// Sent applications and the replies to them (Milestone 5, ticket 5; spec A10). A message only
// suggests a pursuit status: the signed-in user accepts it, which changes the job, or dismisses
// it. Nothing here writes to anyone.
export class ResponseTrackingService {
  constructor(
    private readonly repo: Repo,
    private readonly setJobStatus: SetJobStatus,
    private readonly audit: Audit,
    private readonly followUpDays = DEFAULT_FOLLOW_UP_DAYS,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(): Promise<SentApplication[]> {
    const sent = await this.repo.sentApplications();
    const messages = await this.repo.forApplications(sent.map((row) => row.applicationId));
    const byApplication = new Map<string, RecruiterMessageRow[]>();
    for (const message of messages) {
      if (!message.applicationId) continue;
      byApplication.set(message.applicationId, [...(byApplication.get(message.applicationId) ?? []), message]);
    }
    return sent.map((row) => {
      const own = byApplication.get(row.applicationId) ?? [];
      return {
        applicationId: row.applicationId,
        applicationStatus: row.applicationStatus,
        submittedAt: row.submittedAt.toISOString(),
        job: { id: row.jobId, title: row.jobTitle, company: row.company, status: row.jobStatus },
        messages: own.map(toPublicMessage),
        followUp: followUpState({ submittedAt: row.submittedAt, jobStatus: row.jobStatus, messages: own, now: this.now(), afterDays: this.followUpDays }),
      };
    });
  }

  async accept(messageId: string) {
    const message = await this.pending(messageId);
    const job = message.applicationId ? await this.repo.jobFor(message.applicationId) : null;
    if (!job) throw notFound("That message's application no longer exists.");
    const decided = await this.repo.decide(message.id, "ACCEPTED", this.now());
    if (!decided) throw conflict("This suggestion was already answered.");
    await this.setJobStatus(job.jobId, message.suggestedStatus);
    await this.audit.record({
      eventType: "STATUS_SUGGESTION_ACCEPTED",
      actor: "USER",
      entityType: "job",
      entityId: job.jobId,
      payload: { messageId: message.id, from: job.status, to: message.suggestedStatus, classification: message.classification },
    });
    return toPublicMessage(decided);
  }

  async dismiss(messageId: string) {
    const message = await this.pending(messageId);
    const decided = await this.repo.decide(message.id, "DISMISSED", this.now());
    if (!decided) throw conflict("This suggestion was already answered.");
    return toPublicMessage(decided);
  }

  private async pending(messageId: string): Promise<RecruiterMessageRow> {
    const message = await this.repo.get(messageId);
    if (!message || !message.applicationId) throw notFound("Message not found.");
    if (!message.suggestedStatus) throw conflict("This message suggests no status change.");
    if (message.decision) throw conflict("This suggestion was already answered.");
    return message;
  }
}
