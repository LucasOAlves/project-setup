import type { ApplicationPublic } from "@studio/shared";
import type { ApplicationService } from "../career/application-service.js";
import type { PreparationOutcome, PreparationTarget } from "./application-preparer.js";

export type ApplicationPrepJob = { applicationId: string; runId: string };

// The browser worker's job handler: run the preparer for the run that was queued, and record
// its outcome as the worker. A run the user restarted or that was already settled is skipped,
// so a stale queue entry never overwrites a newer state.
export class ApplicationPrepProcessor {
  constructor(
    private readonly applications: Pick<ApplicationService, "get" | "recordOutcome">,
    private readonly preparer: { prepare(target: PreparationTarget): Promise<PreparationOutcome> },
  ) {}

  async process(job: ApplicationPrepJob): Promise<{ applicationId: string; status: string; skipped?: string }> {
    let application: ApplicationPublic;
    try {
      application = await this.applications.get(job.applicationId);
    } catch {
      return { applicationId: job.applicationId, status: "MISSING", skipped: "APPLICATION_NOT_FOUND" };
    }
    if (application.status !== "PREPARING" || application.updatedAt !== job.runId) {
      return { applicationId: job.applicationId, status: application.status, skipped: "NOT_THE_CURRENT_RUN" };
    }

    let outcome: PreparationOutcome;
    try {
      outcome = await this.preparer.prepare({ portal: application.portal, destinationUrl: application.destinationUrl });
    } catch (error) {
      // The message can carry page content, so only the error's kind is stored.
      outcome = {
        status: "FAILED",
        reason: "The browser run hit an unexpected error.",
        lastError: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      };
    }
    const recorded = await this.applications.recordOutcome(application.id, outcome.status, "WORKER", outcome.reason, {
      lastError: outcome.lastError ?? "",
      ...(outcome.form ? { formSnapshot: outcome.form as unknown as Record<string, unknown> } : {}),
    });
    return { applicationId: application.id, status: recorded.status };
  }
}
