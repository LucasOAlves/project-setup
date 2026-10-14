import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { FastifyInstance } from "fastify";
import { providerUnavailable } from "../../app-error.js";
import type { Env } from "../../env.js";
import { discoveryJobId } from "../../worker/job-ids.js";
import { createQueue, enqueueDiscovery, QUEUE_NAMES } from "../../worker/queues.js";

export type DiscoveryTriggerResult = {
  sourceId: string;
  status: "QUEUED" | "ALREADY_RAN_TODAY";
};

// "Run discovery now" (JOB-009): queues today's run for each configured source in the worker.
// Manual runs share one deterministic id per source per UTC day, so pressing it twice does
// nothing new until tomorrow. A manual run after the scheduled one does re-fetch, which is
// harmless: imports dedupe by provenance and only newly created jobs are evaluated.
export async function registerDiscoveryRoutes(app: FastifyInstance, env: Env): Promise<void> {
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
      for (const sourceId of env.DISCOVERY_SOURCES) {
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
}
