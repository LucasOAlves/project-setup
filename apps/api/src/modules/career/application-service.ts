import {
  SUPPORTED_APPLICATION_PORTALS,
  detectBoardReference,
  applicationPreviewSchema,
  approveApplicationInputSchema,
  fieldPlanSchema,
  formSnapshotSchema,
  type ApplicationActor,
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
} from "./application-repository.js";
import { APPROVAL_TTL_MS, checkApproval } from "./application-approval.js";
import { checkTransition, initialApplicationState } from "./application-state.js";

type Repo = Pick<ApplicationRepository, "get" | "findByJob" | "create" | "transition" | "events" | "approve" | "liveApproval">;
type Audit = { record(input: AuditEventInput): Promise<void> };
type JobLookup = (jobId: string) => Promise<{ id: string; url: string } | null>;

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
  ) {}

  async getForJob(jobId: string): Promise<ApplicationPublic | null> {
    await this.requireJob(jobId);
    const row = await this.repo.findByJob(jobId);
    return row ? this.toPublic(await this.settleStale(row)) : null;
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
