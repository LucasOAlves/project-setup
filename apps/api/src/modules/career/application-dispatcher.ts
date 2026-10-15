import { Redis } from "ioredis";
import type { Queue } from "bullmq";
import type { ApplicationPublic } from "@studio/shared";
import { conflict, providerUnavailable } from "../../app-error.js";
import { createQueue, enqueueApplicationPrep, enqueueApplicationSubmit, QUEUE_NAMES } from "../../worker/queues.js";
import type { ApplicationService } from "./application-service.js";

// Hands a new preparation run to whoever does it. A supported portal goes to the browser
// worker's queue. Any other portal is prepared without a browser: the user completes it with
// the prepared materials.
export class ApplicationDispatcher {
  private queue: Queue | null = null;
  private submitQueue: Queue | null = null;
  private connection: Redis | null = null;

  constructor(
    private readonly redisUrl: string,
    private readonly applications: Pick<ApplicationService, "recordOutcome">,
    private readonly enqueue: (application: ApplicationPublic) => Promise<void> = (application) => this.enqueueOnQueue(application),
    private readonly enqueueSubmit: (application: ApplicationPublic, approvalId: string) => Promise<void> = (application, approvalId) =>
      this.enqueueSubmitOnQueue(application, approvalId),
  ) {}

  // Hands an approved application to the browser worker (Milestone 4). Only when submission is
  // permitted: otherwise the user submits by hand. Adding it twice adds nothing (one job per
  // approval), and the worker claims each approval once.
  async dispatchSubmission(application: ApplicationPublic): Promise<void> {
    if (application.status !== "APPROVED" || !application.approval) throw conflict("Only an approved application can be submitted.");
    if (!application.submission.allowed) throw conflict(application.submission.reason);
    try {
      await this.enqueueSubmit(application, application.approval.id);
    } catch {
      throw providerUnavailable("The background job queue is unavailable. Is Redis running? Your approval is kept.");
    }
  }

  async dispatch(application: ApplicationPublic): Promise<ApplicationPublic> {
    if (application.mode === "MANUAL") {
      return this.applications.recordOutcome(
        application.id,
        "READY_FOR_REVIEW",
        "SYSTEM",
        "This portal is not supported for automatic filling. Complete it yourself with the prepared materials.",
      );
    }
    try {
      await this.enqueue(application);
      return application;
    } catch {
      await this.applications.recordOutcome(application.id, "FAILED", "SYSTEM", "The browser worker's queue is unavailable.", {
        lastError: "QUEUE_UNAVAILABLE",
      });
      throw providerUnavailable("The background job queue is unavailable. Is Redis running?");
    }
  }

  async close(): Promise<void> {
    await this.queue?.close();
    await this.submitQueue?.close();
    this.connection?.disconnect();
  }

  private redis(): Redis {
    // A producer-only connection: fail fast when Redis is down instead of hanging the request.
    this.connection ??= new Redis(this.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    return this.connection;
  }

  private async enqueueSubmitOnQueue(application: ApplicationPublic, approvalId: string): Promise<void> {
    this.submitQueue ??= createQueue(QUEUE_NAMES.applicationSubmit, this.redis());
    await enqueueApplicationSubmit(this.submitQueue, {
      applicationId: application.id,
      approvalId,
      correlationId: `application.${application.id}`,
    });
  }

  private async enqueueOnQueue(application: ApplicationPublic): Promise<void> {
    if (!this.queue) {
      this.queue = createQueue(QUEUE_NAMES.applicationPrep, this.redis());
    }
    await enqueueApplicationPrep(this.queue, {
      applicationId: application.id,
      runId: application.updatedAt,
      correlationId: `application.${application.id}`,
    });
  }
}
