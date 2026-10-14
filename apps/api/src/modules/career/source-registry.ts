import { eq } from "drizzle-orm";
import {
  SUPPORTED_APPLICATION_PORTALS,
  type SourceApplicationMode,
  type SourcePublic,
  type SupportedApplicationPortal,
} from "@studio/shared";
import { notFound, validationError } from "../../app-error.js";
import type { Database } from "../../db/client.js";
import { sources } from "../../db/schema.js";

// Per-source permission registry (spec §6, JOB-005). The `sources` table is the single place
// that says whether a source may be queried; CareerService asks it before every board import
// or search, so disabling a source in settings stops all traffic to it.
export interface SourceGate {
  assertDiscoveryAllowed(sourceId: string): Promise<void>;
}

type SourceRow = typeof sources.$inferSelect;

export class SourceRegistry implements SourceGate {
  constructor(private readonly db: Database) {}

  async list(): Promise<SourcePublic[]> {
    const rows = await this.db.select().from(sources).orderBy(sources.id);
    return rows.map(toPublic);
  }

  async setEnabled(id: string, enabled: boolean): Promise<SourcePublic> {
    const [row] = await this.db
      .update(sources)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(sources.id, id))
      .returning();
    if (!row) {
      throw notFound("That source does not exist.");
    }
    return toPublic(row);
  }

  // How far application automation may go on a portal (Milestone 4). AUTOMATED is only offered
  // for the portals the browser worker can fill.
  async setApplicationMode(id: string, mode: SourceApplicationMode): Promise<SourcePublic> {
    if (mode === "AUTOMATED" && !(SUPPORTED_APPLICATION_PORTALS as readonly string[]).includes(id)) {
      throw validationError("Only Greenhouse, Lever and Ashby can submit applications automatically.");
    }
    const [row] = await this.db
      .update(sources)
      .set({ applicationMode: mode, updatedAt: new Date() })
      .where(eq(sources.id, id))
      .returning();
    if (!row) {
      throw notFound("That source does not exist.");
    }
    return toPublic(row);
  }

  async applicationPolicy(portal: SupportedApplicationPortal): Promise<{ enabled: boolean; applicationMode: SourceApplicationMode } | null> {
    const [row] = await this.db.select().from(sources).where(eq(sources.id, portal)).limit(1);
    return row ? { enabled: row.enabled, applicationMode: toPublic(row).applicationMode } : null;
  }

  async assertDiscoveryAllowed(sourceId: string): Promise<void> {
    const [row] = await this.db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
    if (!row) {
      throw validationError(`${sourceId} is not a registered job source.`);
    }
    if (!row.enabled || !row.discoveryAllowed) {
      throw validationError(`${sourceId} is turned off in source settings.`);
    }
  }
}

function toPublic(row: SourceRow): SourcePublic {
  return {
    id: row.id,
    domain: row.domain,
    adapterType: row.adapterType === "BOARD" ? "BOARD" : "SEARCH",
    discoveryAllowed: row.discoveryAllowed,
    applicationMode:
      row.applicationMode === "ASSISTED" || row.applicationMode === "AUTOMATED"
        ? row.applicationMode
        : "MANUAL",
    termsUrl: row.termsUrl,
    enabled: row.enabled,
    notes: row.notes,
  };
}

// For tests and any caller that has no registry: every source is allowed.
export const ALLOW_ALL_SOURCES: SourceGate = {
  async assertDiscoveryAllowed() {},
};
