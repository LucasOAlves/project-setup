import type { FastifyInstance } from "fastify";
import type { OperationsService } from "./operations-service.js";

export async function registerOperationsRoutes(app: FastifyInstance, operations: Pick<OperationsService, "report" | "auditEvents">): Promise<void> {
  app.get("/api/operations", async () => ({ report: await operations.report() }));

  // The audit history, newest first, with filters (spec criterion 10).
  app.get("/api/audit-events", async (request) => ({ events: await operations.auditEvents(request.query) }));
}
