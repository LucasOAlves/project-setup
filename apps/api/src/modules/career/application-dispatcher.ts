import { Redis } from "ioredis";
import type { Queue } from "bullmq";
import type { ApplicationPublic } from "@studio/shared";
import { providerUnavailable } from "../../app-error.js";
import { createQueue, enqueueApplicationPrep, QUEUE_NAMES } from "../../worker/queues.js";
import type { ApplicationService } from "./application-service.js";

// Hands a new preparation run to whoever does it. A supported portal goes to the browser
// worker's queue. Any other portal is prepared without a browser: the user completes it with
// the prepared materials.
export class ApplicationDispatcher {
  private queue: Queue | null = null;
  private connection: Redis | null = null;

  constructor(
    private readonly redisUrl: string,
    private readonly applications: Pick<ApplicationService, "recordOutcome">,
    private readonly enqueue: (application: ApplicationPublic) => Promise<void> = (application) => this.enqueueOnQueue(application),
  ) {}

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
    this.connection?.disconnect();
  }

  private async enqueueOnQueue(application: ApplicationPublic): Promise<void> {
    if (!this.queue) {
      // A producer-only connection: fail fast when Redis is down instead of hanging the request.
      this.connection = new Redis(this.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
      this.queue = createQueue(QUEUE_NAMES.applicationPrep, this.connection);
    }
    await enqueueApplicationPrep(this.queue, {
      applicationId: application.id,
      runId: application.updatedAt,
      correlationId: `application.${application.id}`,
    });
  }
}
