import type { FastifyInstance } from "fastify";
import type { ApplicationService } from "../career/application-service.js";
import type { ResponseTrackingService } from "../email/response-tracking-service.js";
import { attentionCount } from "./attention.js";

export async function registerAttentionRoute(
  app: FastifyInstance,
  applications: Pick<ApplicationService, "inbox">,
  responses: Pick<ResponseTrackingService, "list">,
): Promise<void> {
  app.get("/api/career/attention", async () => {
    const [inbox, sent] = await Promise.all([applications.inbox(), responses.list()]);
    return attentionCount({ inboxStatuses: inbox.map((item) => item.application.status), sent });
  });
}
