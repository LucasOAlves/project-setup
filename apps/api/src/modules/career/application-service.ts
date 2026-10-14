import {
  SUPPORTED_APPLICATION_PORTALS,
  detectBoardReference,
  fieldPlanSchema,
  formSnapshotSchema,
  type ApplicationActor,
  type ApplicationPublic,
  type ApplicationState,
  type SupportedApplicationPortal,
} from "@studio/shared";
import { z } from "zod";
import { conflict, notFound } from "../../app-error.js";
import type { AuditEventInput } from "../audit/audit-repository.js";
import type {
  ApplicationEventRow,
  ApplicationPatch,
  ApplicationRepository,
  ApplicationRow,
} from "./application-repository.js";
import { checkTransition, initialApplicationState } from "./application-state.js";

type Repo = Pick<ApplicationRepository, "get" | "findByJob" | "create" | "transition" | "events">;
type Audit = { record(input: AuditEventInput): Promise<void> };
type JobLookup = (jobId: string) => Promise<{ id: string; url: string } | null>;

const SUPPORTED = new Set<string>(SUPPORTED_APPLICATION_PORTALS);

// A run still PREPARING after this long has lost its worker (a crash or a restart).
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
    return row ? this.toPublic(await this.expireIfAbandoned(row)) : null;
  }

  async get(applicationId: string): Promise<ApplicationPublic> {
    return this.toPublic(await this.requireApplication(applicationId));
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
    const existing = found ? await this.expireIfAbandoned(found) : null;
    if (!existing) {
      const created = await this.repo.create(
        { jobId, status: initialApplicationState, ...target },
        { actor: "USER", reason },
      );
      if (!created) throw conflict("This application is already being prepared.");
      await this.recordAudit(created, null, "USER", reason);
      return this.toPublic(created);
    }
    return this.toPublic(await this.apply(existing, "PREPARING", "USER", reason, { ...target, lastError: "", formSnapshot: null, fieldPlan: null }));
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
    const row = await this.requireApplication(applicationId);
    return this.toPublic(await this.apply(row, "USER_REJECTED", "USER", "You rejected this application."));
  }

  private async expireIfAbandoned(row: ApplicationRow): Promise<ApplicationRow> {
    if (row.status !== "PREPARING" || this.now().getTime() - row.updatedAt.getTime() < ABANDONED_RUN_MS) return row;
    try {
      return await this.apply(row, "FAILED", "SYSTEM", "The preparation run stopped without finishing.", { lastError: "ABANDONED" });
    } catch {
      // The worker finished it in the meantime.
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
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      events: events.map(toPublicEvent),
    };
  }
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
