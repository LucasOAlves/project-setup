import type { ApplicationState, FieldPlan, FormField } from "@studio/shared";
import type { AuditEventInput } from "../audit/audit-repository.js";
import { APPROVAL_PROBLEM_TEXT } from "../career/application-approval.js";
import { applicationPayloadHash } from "../career/application-payload.js";
import type { ExecutionFinish } from "../career/application-repository.js";
import type { ApplicationService } from "../career/application-service.js";
import type { SubmissionRun, SubmissionTarget } from "./application-submitter.js";
import type { AttachmentFile } from "./form-filler.js";

export type ApplicationSubmitJob = { applicationId: string; approvalId: string };

export type ApplicationSubmitDeps = {
  applications: Pick<ApplicationService, "claimSubmission" | "confirmBeforeClick" | "recordOutcome">;
  executions: {
    markClicked(executionId: string, at: Date): Promise<void>;
    finishExecution(executionId: string, finish: ExecutionFinish, at: Date): Promise<void>;
  };
  submitter: { submit(target: SubmissionTarget): Promise<SubmissionRun> };
  planner: { plan(jobId: string, fields: FormField[]): Promise<FieldPlan[]> };
  files: {
    load(documentId: string): Promise<AttachmentFile>;
    fileHash(documentId: string): Promise<string | null>;
  };
  audit: { record(input: AuditEventInput): Promise<void> };
  now?: () => Date;
};

type Settled = Exclude<ApplicationState, "PREPARING" | "USER_REJECTED" | "APPROVED" | "SUBMITTING">;

// The browser worker's submission handler (Milestone 4). It claims the approval (once, ever),
// runs the submitter with a last approval check right before the click, and records the result
// as the worker. It never retries: the queue gives it one attempt, and an unclear result is
// SUBMISSION_UNKNOWN for the user to resolve.
export class ApplicationSubmitProcessor {
  constructor(private readonly deps: ApplicationSubmitDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async process(job: ApplicationSubmitJob): Promise<{ applicationId: string; status: string; skipped?: string }> {
    const { applications, executions, submitter, planner, files, audit } = this.deps;
    const claim = await applications.claimSubmission(job.applicationId, job.approvalId);
    if (!claim.claimed) return { applicationId: job.applicationId, status: "SKIPPED", skipped: claim.reason };
    const { application, executionId } = claim;

    const run = await submitter.submit({
      portal: application.portal,
      destinationUrl: application.destinationUrl,
      planFields: (fields) => planner.plan(application.jobId, fields),
      loadFile: (documentId) => files.load(documentId),
      payloadHash: async (plan) => {
        const documentIds = [...new Set(plan.flatMap((field) => (field.documentId ? [field.documentId] : [])))];
        const fileHashes = Object.fromEntries(await Promise.all(documentIds.map(async (id) => [id, await files.fileHash(id)] as const)));
        return applicationPayloadHash({
          jobId: application.jobId,
          destinationUrl: application.destinationUrl,
          portal: application.portal,
          plan,
          fileHashes,
        });
      },
      beforeClick: async (payloadHash) => {
        const check = await applications.confirmBeforeClick(application.id, job.approvalId, payloadHash);
        if (check.ok) return { ok: true };
        return {
          ok: false,
          reason: check.reason === "NOT_PERMITTED" ? "Automatic submission was turned off." : APPROVAL_PROBLEM_TEXT[check.reason],
        };
      },
      onClick: () => executions.markClicked(executionId, this.now()),
    });

    const status = run.status as Settled;
    const patch = run.clicked
      ? {
          lastError: run.status === "SUBMITTED" ? "" : run.status,
          ...(run.status === "SUBMITTED" ? { submittedAt: this.now(), confirmationReference: run.confirmationReference ?? "" } : {}),
        }
      : { lastError: run.lastError };
    let recorded = status as string;
    try {
      recorded = (await applications.recordOutcome(application.id, status, "WORKER", run.reason, patch)).status;
    } catch {
      // The application moved on without this run (the system marked a stalled run unknown).
      recorded = "UNRECORDED";
    }
    await executions.finishExecution(
      executionId,
      {
        result: status,
        errorType: run.clicked ? "" : run.lastError,
        submitStatus: run.clicked ? run.submitStatus : null,
        confirmationReference: run.clicked ? (run.confirmationReference ?? "") : "",
      },
      this.now(),
    );
    await audit.record({
      eventType: "SUBMISSION_FINISHED",
      actor: "WORKER",
      entityType: "execution",
      entityId: executionId,
      payload: {
        applicationId: application.id,
        approvalId: job.approvalId,
        clicked: run.clicked,
        result: status,
        evidence: run.clicked ? run.evidence : run.lastError,
      },
    });
    return { applicationId: application.id, status: recorded };
  }
}
