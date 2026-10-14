import type { ApplicationPublic, FieldPlan, FormField } from "@studio/shared";
import type { ApplicationService } from "../career/application-service.js";
import { applicationPayloadHash } from "../career/application-payload.js";
import type { PreparationOutcome, PreparationTarget } from "./application-preparer.js";
import type { AttachmentFile } from "./form-filler.js";

export type ApplicationPrepJob = { applicationId: string; runId: string };

export type ApplicationPrepDeps = {
  applications: Pick<ApplicationService, "get" | "recordOutcome" | "screenshotKey">;
  preparer: { prepare(target: PreparationTarget): Promise<PreparationOutcome> };
  planner: { plan(jobId: string, fields: FormField[]): Promise<FieldPlan[]> };
  files: {
    load(documentId: string): Promise<AttachmentFile>;
    fileHash(documentId: string): Promise<string | null>;
  };
  screenshots: {
    put(bytes: Buffer): Promise<string>;
    delete(key: string): Promise<void>;
  };
  now?: () => Date;
};

// The browser worker's job handler: run the preparer for the run that was queued, store its
// preview, and record the outcome as the worker. A run the user restarted or that was already
// settled is skipped, so a stale queue entry never overwrites a newer state.
export class ApplicationPrepProcessor {
  constructor(private readonly deps: ApplicationPrepDeps) {}

  async process(job: ApplicationPrepJob): Promise<{ applicationId: string; status: string; skipped?: string }> {
    const { applications, preparer, planner, files, screenshots } = this.deps;
    let application: ApplicationPublic;
    try {
      application = await applications.get(job.applicationId);
    } catch {
      return { applicationId: job.applicationId, status: "MISSING", skipped: "APPLICATION_NOT_FOUND" };
    }
    if (application.status !== "PREPARING" || application.updatedAt !== job.runId) {
      return { applicationId: job.applicationId, status: application.status, skipped: "NOT_THE_CURRENT_RUN" };
    }
    const previousScreenshot = await applications.screenshotKey(application.id);

    let outcome: PreparationOutcome;
    try {
      outcome = await preparer.prepare({
        portal: application.portal,
        destinationUrl: application.destinationUrl,
        planFields: (fields) => planner.plan(application.jobId, fields),
        loadFile: (documentId) => files.load(documentId),
      });
    } catch (error) {
      // The message can carry page content, so only the error's kind is stored.
      outcome = {
        status: "FAILED",
        reason: "The browser run hit an unexpected error.",
        lastError: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      };
    }

    let preview: Record<string, unknown> | undefined;
    let payloadHash: string | null = null;
    if (outcome.preview) {
      const screenshotKey = outcome.preview.screenshot ? await screenshots.put(outcome.preview.screenshot) : null;
      preview = {
        capturedAt: (this.deps.now?.() ?? new Date()).toISOString(),
        screenshotKey,
        pageUrl: outcome.preview.pageUrl,
        confirmed: outcome.preview.confirmed,
        unverified: outcome.preview.unverified,
        blockedRequests: outcome.preview.blockedRequests,
      };
    }
    if (outcome.plan) {
      const documentIds = [...new Set(outcome.plan.flatMap((field) => (field.documentId ? [field.documentId] : [])))];
      const fileHashes = Object.fromEntries(await Promise.all(documentIds.map(async (id) => [id, await files.fileHash(id)] as const)));
      payloadHash = applicationPayloadHash({
        jobId: application.jobId,
        destinationUrl: application.destinationUrl,
        portal: application.portal,
        plan: outcome.plan,
        fileHashes,
      });
    }

    const recorded = await applications.recordOutcome(application.id, outcome.status, "WORKER", outcome.reason, {
      lastError: outcome.lastError ?? "",
      ...(outcome.form ? { formSnapshot: outcome.form as unknown as Record<string, unknown> } : {}),
      ...(outcome.plan ? { fieldPlan: outcome.plan } : {}),
      ...(preview ? { preview } : {}),
      payloadHash,
    });
    if (preview && previousScreenshot) await screenshots.delete(previousScreenshot).catch(() => undefined);
    return { applicationId: application.id, status: recorded.status };
  }
}

export const SCREENSHOT_RETENTION_DAYS = 30;

// Deletes preview screenshots older than the retention limit (spec section 6 "Define
// retention limits for screenshots"). The preview keeps its counts.
export async function expireOldScreenshots(
  repo: { withScreenshotsBefore(cutoff: Date): Promise<Array<{ id: string; preview: Record<string, unknown> | null }>>; clearScreenshot(id: string): Promise<void> },
  deleteFile: (key: string) => Promise<void>,
  now = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - SCREENSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = await repo.withScreenshotsBefore(cutoff);
  for (const row of expired) {
    const key = row.preview?.screenshotKey;
    if (typeof key === "string") await deleteFile(key);
    await repo.clearScreenshot(row.id);
  }
  return expired.length;
}
