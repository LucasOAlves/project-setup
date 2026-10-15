import {
  INBOX_STATES,
  SUPPORTED_APPLICATION_PORTALS,
  detectBoardReference,
  applicationPreviewSchema,
  approveApplicationInputSchema,
  fieldPlanSchema,
  formSnapshotSchema,
  type ApplicationActor,
  type ApplicationInboxItem,
  type ApplicationPublic,
  type ApplicationState,
  type SupportedApplicationPortal,
} from "@studio/shared";
import { z } from "zod";
import { conflict, notFound, validationError } from "../../app-error.js";
import type { AuditEventInput } from "../audit/audit-repository.js";
import type {
  ApplicationEventRow,
  ApplicationPatch,
  ApplicationRepository,
  ApplicationRow,
  ApprovalRow,
  ExecutionRow,
} from "./application-repository.js";
import { APPROVAL_PROBLEM_TEXT, APPROVAL_TTL_MS, checkApproval, type ApprovalCheck } from "./application-approval.js";
import { checkTransition, initialApplicationState } from "./application-state.js";
import { SUBMISSION_BLOCK_TEXT, type SubmissionPermission } from "./submission-permission.js";

type Repo = Pick<
  ApplicationRepository,
  "get" | "findByJob" | "create" | "transition" | "events" | "approve" | "liveApproval" | "claimSubmission" | "finishOpenExecutions" | "executions" | "listWithJobs"
>;
type Audit = { record(input: AuditEventInput): Promise<void> };
type JobLookup = (jobId: string) => Promise<{ id: string; url: string } | null>;
type SubmissionCheck = (application: { mode: string; portal: string | null }) => Promise<SubmissionPermission>;
// Moves the job's pursuit status to APPLIED once its application is sent (Milestone 5).
type OnSubmitted = (jobId: string, at: Date) => Promise<unknown>;
// Told about every status change, after it is stored (Milestone 5: notifications).
type OnStateChange = (change: { applicationId: string; from: string; to: string; actor: string; at: Date }) => Promise<unknown>;

const SWITCHED_OFF: SubmissionCheck = async () => ({ allowed: false, reason: "SWITCHED_OFF" });

const SUPPORTED = new Set<string>(SUPPORTED_APPLICATION_PORTALS);

// A run still PREPARING or SUBMITTING after this long has lost its worker (a crash or a
// restart). A stalled submission becomes SUBMISSION_UNKNOWN, never FAILED: the click may have
// happened.
export const ABANDONED_RUN_MS = 10 * 60 * 1000;

// The ATS whose application form the browser worker can fill, or null for the manual path.
export function supportedPortal(url: string): SupportedApplicationPortal | null {
  const source = detectBoardReference(url)?.source;
  return source && SUPPORTED.has(source) ? (source as SupportedApplicationPortal) : null;
}

// Applications for one job (Milestone 3). Every status change goes through checkTransition,
// is written together with its event, and is mirrored to the audit log.
export class ApplicationService {
  constructor(
    private readonly repo: Repo,
    private readonly audit: Audit,
    private readonly findJob: JobLookup,
    private readonly now: () => Date = () => new Date(),
    private readonly submissionCheck: SubmissionCheck = SWITCHED_OFF,
    private readonly onSubmitted: OnSubmitted = async () => undefined,
    private readonly onStateChange: OnStateChange = async () => undefined,
  ) {}

  async getForJob(jobId: string): Promise<ApplicationPublic | null> {
    await this.requireJob(jobId);
    const row = await this.repo.findByJob(jobId);
    return row ? this.toPublic(await this.settleStale(row)) : null;
  }

  // Applications that wait on the user or are being submitted, each with its job (Milestone 4).
  async inbox(): Promise<ApplicationInboxItem[]> {
    const found = await this.repo.listWithJobs(INBOX_STATES);
    const items: ApplicationInboxItem[] = [];
    for (const { row, title, company } of found) {
      const settled = await this.settleStale(row);
      if (!(INBOX_STATES as readonly string[]).includes(settled.status)) continue;
      items.push({ application: await this.toPublic(settled), job: { id: row.jobId, title, company } });
    }
    return items;
  }

  // The stored key of the last preview's screenshot, if it is still kept.
  async screenshotKey(applicationId: string): Promise<string | null> {
    const row = await this.requireApplication(applicationId);
    const key = row.preview?.screenshotKey;
    return typeof key === "string" ? key : null;
  }

  async get(applicationId: string): Promise<ApplicationPublic> {
    return this.toPublic(await this.settleStale(await this.requireApplication(applicationId)));
  }

  // Creates the job's application, or starts a new preparation run for it.
  async startPreparation(jobId: string): Promise<ApplicationPublic> {
    const job = await this.requireJob(jobId);
    const portal = supportedPortal(job.url);
    const target = {
      mode: portal ? ("AUTOMATED" as const) : ("MANUAL" as const),
      portal,
      destinationUrl: job.url,
    };
    const reason = "You asked to prepare this application.";

    const found = await this.repo.findByJob(jobId);
    const existing = found ? await this.settleStale(found) : null;
    if (!existing) {
      const created = await this.repo.create(
        { jobId, status: initialApplicationState, ...target },
        { actor: "USER", reason },
      );
      if (!created) throw conflict("This application is already being prepared.");
      await this.recordAudit(created, null, "USER", reason);
      return this.toPublic(created);
    }
    return this.toPublic(await this.apply(existing, "PREPARING", "USER", reason, { ...target, lastError: "", formSnapshot: null, fieldPlan: null, payloadHash: null }));
  }

  // Records how a preparation run ended. Used by the browser worker and the manual path.
  async recordOutcome(
    applicationId: string,
    to: Exclude<ApplicationState, "PREPARING" | "USER_REJECTED">,
    actor: Exclude<ApplicationActor, "USER">,
    reason: string,
    patch: ApplicationPatch = {},
  ): Promise<ApplicationPublic> {
    const row = await this.requireApplication(applicationId);
    return this.toPublic(await this.apply(row, to, actor, reason, patch));
  }

  async reject(applicationId: string): Promise<ApplicationPublic> {
    const row = await this.settleStale(await this.requireApplication(applicationId));
    return this.toPublic(await this.apply(row, "USER_REJECTED", "USER", "You rejected this application."));
  }

  // The signed-in user approves the exact payload they reviewed (Milestone 4, spec A08). Only
  // automated applications have something to approve: a manual one is submitted by hand.
  async approve(applicationId: string, input: unknown): Promise<ApplicationPublic> {
    const parsed = approveApplicationInputSchema.safeParse(input);
    if (!parsed.success) throw validationError("Approve the payload you reviewed.");
    const row = await this.settleStale(await this.requireApplication(applicationId));
    if (row.mode !== "AUTOMATED") throw conflict("You complete this application by hand, so there is nothing to approve.");
    const check = checkTransition(row.status as ApplicationState, "APPROVED", "USER");
    if (!check.ok) throw conflict(check.reason);
    if (!row.payloadHash || row.payloadHash !== parsed.data.payloadHash) {
      throw conflict("This application changed since you reviewed it. Review it again before approving.");
    }

    const plan = parsePlan(row.fieldPlan) ?? [];
    const documentIds = [...new Set(plan.flatMap((field) => (field.documentId && field.status === "FILLED" ? [field.documentId] : [])))];
    const decidedAt = this.now();
    const reason = "You approved this application for submission.";
    const result = await this.repo.approve(row.id, { actor: "USER", reason }, {
      payloadHash: row.payloadHash,
      destinationUrl: row.destinationUrl,
      documentIds,
      formRevision: parseForm(row.formSnapshot)?.readAt ?? "",
      decidedAt,
      expiresAt: new Date(decidedAt.getTime() + APPROVAL_TTL_MS),
    });
    if (!result) throw conflict("This application changed while you were looking at it. Reload and try again.");
    await this.recordAudit(result.row, "READY_FOR_REVIEW", "USER", reason);
    await this.audit.record({
      eventType: "APPLICATION_APPROVED",
      actor: "USER",
      entityType: "approval",
      entityId: result.approval.id,
      payload: {
        applicationId: row.id,
        jobId: row.jobId,
        payloadHash: result.approval.payloadHash,
        destinationUrl: result.approval.destinationUrl,
        documentIds,
        expiresAt: result.approval.expiresAt.toISOString(),
      },
    });
    return this.toPublic(result.row);
  }

  // The submission run takes the application (Milestone 4, spec section 5 step 13): only with
  // the live approval it was queued for, only while that approval is valid and submission is
  // permitted, and only once per approval.
  async claimSubmission(
    applicationId: string,
    approvalId: string,
  ): Promise<{ claimed: true; application: ApplicationPublic; executionId: string } | { claimed: false; reason: string }> {
    const row = await this.settleStale(await this.requireApplication(applicationId));
    if (row.status !== "APPROVED") return { claimed: false, reason: `The application is ${row.status}, not APPROVED.` };
    const approval = await this.repo.liveApproval(row.id);
    if (!approval || approval.id !== approvalId) return { claimed: false, reason: "This run was queued for an approval that is no longer live." };
    const check = checkApproval(toFacts(approval), toTarget(row), this.now());
    if (!check.ok) return { claimed: false, reason: APPROVAL_PROBLEM_TEXT[check.reason] };
    const permission = await this.submissionCheck(row);
    if (!permission.allowed) return { claimed: false, reason: SUBMISSION_BLOCK_TEXT[permission.reason] };

    const reason = "The browser worker started submitting your approved application.";
    const claimed = await this.repo.claimSubmission(row.id, approvalId, { actor: "WORKER", reason });
    if (!claimed) return { claimed: false, reason: "Another run already took this approval." };
    await this.recordAudit(claimed.row, "APPROVED", "WORKER", reason);
    await this.audit.record({
      eventType: "SUBMISSION_STARTED",
      actor: "WORKER",
      entityType: "execution",
      entityId: claimed.execution.id,
      payload: { applicationId: row.id, approvalId, attempt: claimed.execution.attemptNumber },
    });
    return { claimed: true, application: await this.toPublic(claimed.row), executionId: claimed.execution.id };
  }

  // The last check, right before the click (spec section 5 step 14): the run is still the
  // application's, the approval is still live and unexpired, submission is still permitted, and
  // the payload the run just filled hashes to exactly what was approved.
  async confirmBeforeClick(applicationId: string, approvalId: string, filledPayloadHash: string): Promise<ApprovalCheck | { ok: false; reason: "NOT_PERMITTED" }> {
    const row = await this.requireApplication(applicationId);
    const approval = await this.repo.liveApproval(row.id);
    if (!approval || approval.id !== approvalId) return { ok: false, reason: "INVALIDATED" };
    const check = checkApproval(toFacts(approval), { ...toTarget(row), payloadHash: filledPayloadHash }, this.now());
    if (!check.ok) return check;
    const permission = await this.submissionCheck(row);
    return permission.allowed ? check : { ok: false, reason: "NOT_PERMITTED" };
  }

  // The user says the application reached the company: they submitted it by hand (the assisted
  // path), or they checked an unclear result and it was sent. Never while a run is submitting.
  async markSubmitted(applicationId: string): Promise<ApplicationPublic> {
    const row = await this.settleStale(await this.requireApplication(applicationId));
    if (row.status === "SUBMITTING") throw conflict("The app is submitting this application right now. Wait for the result.");
    const reason =
      row.status === "SUBMISSION_UNKNOWN" ? "You checked and confirmed the application was sent." : "You submitted this application yourself.";
    return this.toPublic(await this.apply(row, "SUBMITTED", "USER", reason, { submittedAt: this.now() }));
  }

  // The user checked an unclear result and nothing was sent: back to review. The used approval
  // is invalidated with the transition, so submitting needs a new approval.
  async markNotSent(applicationId: string): Promise<ApplicationPublic> {
    const row = await this.settleStale(await this.requireApplication(applicationId));
    if (row.status !== "SUBMISSION_UNKNOWN") throw conflict("Only an application whose result is unknown can be marked as not sent.");
    return this.toPublic(
      await this.apply(row, "READY_FOR_REVIEW", "USER", "You checked and confirmed the application was not sent. Approve it again to submit."),
    );
  }

  // Back to review. The repository invalidates the approval in the same transaction.
  async withdrawApproval(applicationId: string, reason = "You withdrew your approval."): Promise<ApplicationPublic> {
    const row = await this.settleStale(await this.requireApplication(applicationId));
    if (row.status !== "APPROVED") throw conflict("This application has no approval to withdraw.");
    return this.toPublic(await this.apply(row, "READY_FOR_REVIEW", "USER", reason));
  }

  // Settles what time alone decides: a run that lost its worker, and an approval past its expiry.
  private async settleStale(row: ApplicationRow): Promise<ApplicationRow> {
    try {
      const age = this.now().getTime() - row.updatedAt.getTime();
      if (row.status === "PREPARING" && age >= ABANDONED_RUN_MS) {
        return await this.apply(row, "FAILED", "SYSTEM", "The preparation run stopped without finishing.", { lastError: "ABANDONED" });
      }
      if (row.status === "SUBMITTING" && age >= ABANDONED_RUN_MS) {
        await this.repo.finishOpenExecutions(row.id, { result: "SUBMISSION_UNKNOWN", errorType: "ABANDONED", submitStatus: null, confirmationReference: "" }, this.now());
        return await this.apply(
          row,
          "SUBMISSION_UNKNOWN",
          "SYSTEM",
          "The submission run stopped without a result. Check the portal or your email before doing anything else.",
          { lastError: "ABANDONED" },
        );
      }
      if (row.status === "APPROVED") {
        const approval = await this.repo.liveApproval(row.id);
        const check = checkApproval(approval && toFacts(approval), toTarget(row), this.now());
        if (!check.ok && check.reason === "EXPIRED") {
          return await this.apply(row, "READY_FOR_REVIEW", "SYSTEM", "Your approval expired after 24 hours. Review and approve again.");
        }
      }
      return row;
    } catch {
      // A run finished it in the meantime.
      return (await this.repo.get(row.id)) ?? row;
    }
  }

  private async apply(
    row: ApplicationRow,
    to: ApplicationState,
    actor: ApplicationActor,
    reason: string,
    patch: ApplicationPatch = {},
  ): Promise<ApplicationRow> {
    const from = row.status as ApplicationState;
    const check = checkTransition(from, to, actor);
    if (!check.ok) throw conflict(check.reason);
    const updated = await this.repo.transition(row.id, from, to, { actor, reason }, patch);
    if (!updated) throw conflict("This application changed while you were looking at it. Reload and try again.");
    await this.recordAudit(updated, from, actor, reason);
    if (to === "SUBMITTED") {
      // The pursuit status follows the submission. Failing to move it never undoes what was sent.
      await this.onSubmitted(updated.jobId, updated.submittedAt ?? this.now()).catch(() => undefined);
    }
    await this.onStateChange({ applicationId: updated.id, from, to, actor, at: updated.updatedAt ?? this.now() }).catch(() => undefined);
    return updated;
  }

  private async recordAudit(row: ApplicationRow, from: string | null, actor: ApplicationActor, reason: string) {
    await this.audit.record({
      eventType: "APPLICATION_STATUS_CHANGED",
      actor,
      entityType: "application",
      entityId: row.id,
      payload: { jobId: row.jobId, from, to: row.status, mode: row.mode, portal: row.portal, reason },
    });
  }

  private async requireJob(jobId: string) {
    const job = await this.findJob(jobId);
    if (!job) throw notFound("Job not found.");
    return job;
  }

  private async requireApplication(id: string): Promise<ApplicationRow> {
    const row = await this.repo.get(id);
    if (!row) throw notFound("Application not found.");
    return row;
  }

  private async toPublic(row: ApplicationRow): Promise<ApplicationPublic> {
    const events = await this.repo.events(row.id);
    const approval = row.status === "APPROVED" || row.status === "SUBMITTING" ? await this.repo.liveApproval(row.id) : null;
    const permission = await this.submissionCheck(row);
    const runs = row.mode === "AUTOMATED" ? await this.repo.executions(row.id) : [];
    return {
      id: row.id,
      jobId: row.jobId,
      status: row.status as ApplicationState,
      mode: row.mode as ApplicationPublic["mode"],
      portal: row.portal as ApplicationPublic["portal"],
      destinationUrl: row.destinationUrl,
      lastError: row.lastError,
      form: parseForm(row.formSnapshot),
      plan: parsePlan(row.fieldPlan),
      preview: parsePreview(row.preview),
      payloadHash: row.payloadHash,
      approval: approval
        ? {
            id: approval.id,
            payloadHash: approval.payloadHash,
            destinationUrl: approval.destinationUrl,
            decidedAt: approval.decidedAt.toISOString(),
            expiresAt: approval.expiresAt.toISOString(),
          }
        : null,
      submission: permission.allowed
        ? { allowed: true, reason: "Once approved, the app submits this application and checks the result." }
        : { allowed: false, reason: SUBMISSION_BLOCK_TEXT[permission.reason] },
      submittedAt: row.submittedAt?.toISOString() ?? null,
      confirmationReference: row.confirmationReference,
      executions: runs.map(toPublicExecution),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      events: events.map(toPublicEvent),
    };
  }
}

export function toFacts(approval: ApprovalRow) {
  return {
    applicationId: approval.applicationId,
    payloadHash: approval.payloadHash,
    destinationUrl: approval.destinationUrl,
    decidedAt: approval.decidedAt,
    expiresAt: approval.expiresAt,
    invalidatedAt: approval.invalidatedAt,
  };
}

export function toTarget(row: ApplicationRow) {
  return { id: row.id, status: row.status as ApplicationState, payloadHash: row.payloadHash, destinationUrl: row.destinationUrl };
}

function parseForm(snapshot: unknown): ApplicationPublic["form"] {
  if (!snapshot) return null;
  const parsed = formSnapshotSchema.safeParse(snapshot);
  return parsed.success ? parsed.data : null;
}

function parsePlan(plan: unknown): ApplicationPublic["plan"] {
  if (!plan) return null;
  const parsed = z.array(fieldPlanSchema).safeParse(plan);
  return parsed.success ? parsed.data : null;
}

function parsePreview(preview: Record<string, unknown> | null): ApplicationPublic["preview"] {
  if (!preview) return null;
  const parsed = applicationPreviewSchema.safeParse({ ...preview, hasScreenshot: typeof preview.screenshotKey === "string" });
  return parsed.success ? parsed.data : null;
}

function toPublicEvent(event: ApplicationEventRow): ApplicationPublic["events"][number] {
  return {
    id: event.id,
    fromStatus: event.fromStatus as ApplicationState | null,
    toStatus: event.toStatus as ApplicationState,
    actor: event.actor as ApplicationActor,
    reason: event.reason,
    createdAt: event.createdAt.toISOString(),
  };
}

function toPublicExecution(execution: ExecutionRow): ApplicationPublic["executions"][number] {
  return {
    id: execution.id,
    attemptNumber: execution.attemptNumber,
    startedAt: execution.startedAt.toISOString(),
    clickedAt: execution.clickedAt?.toISOString() ?? null,
    finishedAt: execution.finishedAt?.toISOString() ?? null,
    result: execution.result,
    errorType: execution.errorType,
    submitStatus: execution.submitStatus,
    confirmationReference: execution.confirmationReference,
  };
}
