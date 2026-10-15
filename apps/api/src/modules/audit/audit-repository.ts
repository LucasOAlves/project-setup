import { randomUUID } from "node:crypto";
import type { Database } from "../../db/client.js";
import { auditEvents } from "../../db/schema.js";
import { redact } from "../../observability/redact.js";

export type AuditActor = "USER" | "SYSTEM" | "WORKER";

export type AuditEventInput = {
  eventType: string;
  actor: AuditActor;
  entityType: string;
  entityId: string;
  correlationId?: string;
  payload?: Record<string, unknown>;
};

// Insert-only writer for audit_events (spec §7, acceptance criterion 10). Payloads are
// redacted on the way in, same rule as the logs.
export class AuditRepository {
  constructor(private readonly db: Database) {}

  async record(input: AuditEventInput): Promise<void> {
    await this.db.insert(auditEvents).values({
      id: randomUUID(),
      eventType: input.eventType,
      actor: input.actor,
      entityType: input.entityType,
      entityId: input.entityId,
      correlationId: input.correlationId ?? "",
      payload: redact(input.payload ?? {}) as Record<string, unknown>,
    });
  }
}
