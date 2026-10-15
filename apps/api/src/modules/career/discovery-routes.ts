import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { FastifyInstance } from "fastify";
import { companyWatchInputSchema } from "@studio/shared";
import { notFound, providerUnavailable, validationError } from "../../app-error.js";
import type { Env } from "../../env.js";
import { discoveryJobId, watchJobId } from "../../worker/job-ids.js";
import { createQueue, enqueueDiscovery, enqueueWatchCompany, QUEUE_NAMES } from "../../worker/queues.js";
import type { CompanyWatchService } from "./company-watch-service.js";
import { discoverySourceIds } from "./web-discovery-service.js";

export type DiscoveryTriggerResult = {
  sourceId: string;
  status: "QUEUED" | "ALREADY_RAN_TODAY";
};

// "Run discovery now" (JOB-009): queues today's run for each configured source in the worker.
// Manual runs share one deterministic id per source per UTC day, so pressing it twice does
// nothing new until tomorrow. A manual run after the scheduled one does re-fetch, which is
// harmless: imports dedupe by provenance and only newly created jobs are evaluated.
export async function registerDiscoveryRoutes(
  app: FastifyInstance,
  env: Env,
  watches: CompanyWatchService,
): Promise<void> {
  let queue: Queue | null = null;
  let connection: Redis | null = null;
  const getQueue = () => {
    if (!queue) {
      // A producer-only connection: fail fast when Redis is down instead of hanging the request.
      connection = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
      queue = createQueue(QUEUE_NAMES.discovery, connection);
    }
    return queue;
  };

  app.addHook("onClose", async () => {
    await queue?.close();
    connection?.disconnect();
  });

  app.post("/api/career/discovery/run", async () => {
    const now = new Date();
    const results: DiscoveryTriggerResult[] = [];
    try {
      const discoveryQueue = getQueue();
      for (const sourceId of discoverySourceIds(env)) {
        if (await discoveryQueue.getJob(discoveryJobId(sourceId, now))) {
          results.push({ sourceId, status: "ALREADY_RAN_TODAY" });
          continue;
        }
        await enqueueDiscovery(discoveryQueue, { sourceId, correlationId: `manual.${sourceId}` }, now);
        results.push({ sourceId, status: "QUEUED" });
      }
    } catch {
      throw providerUnavailable("The background job queue is unavailable. Is Redis running?");
    }
    return { results };
  });

  // Target-company watchlist (Milestone 1.5). The worker polls every watched company daily;
  // "Check now" queues one poll, at most one per company per hour.
  app.get("/api/career/watchlist", async () => ({ watches: await watches.list() }));

  app.put("/api/career/companies/:id/watch", async (request) => {
    const { id } = request.params as { id: string };
    const parsed = companyWatchInputSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Pick a board source and enter its board token.");
    }
    return { watch: await watches.watch(id, parsed.data) };
  });

  app.delete("/api/career/companies/:id/watch", async (request, reply) => {
    const { id } = request.params as { id: string };
    await watches.unwatch(id);
    return reply.status(204).send();
  });

  app.post("/api/career/companies/:id/watch/check", async (request) => {
    const { id } = request.params as { id: string };
    if (!(await watches.isWatched(id))) {
      throw notFound("That company is not on the watchlist.");
    }
    const now = new Date();
    try {
      const queue = getQueue();
      if (await queue.getJob(watchJobId(id, now))) {
        return { status: "ALREADY_QUEUED_THIS_HOUR" as const };
      }
      await enqueueWatchCompany(queue, { companyId: id, correlationId: `manual.watch.${id}` }, now);
    } catch {
      throw providerUnavailable("The background job queue is unavailable. Is Redis running?");
    }
    return { status: "QUEUED" as const };
  });
}
