import { eq, sql } from "drizzle-orm";
import type { ApplicationDetailsInput } from "@studio/shared";
import type { Database } from "../../db/client.js";
import { applicationDetails } from "../../db/schema.js";
import { WORKSPACE_PROFILE_ID } from "./profile-repository.js";

export type ApplicationDetailsRow = typeof applicationDetails.$inferSelect;

export class ApplicationDetailsRepository {
  constructor(private readonly db: Database) {}

  async get(): Promise<ApplicationDetailsRow | null> {
    const [row] = await this.db
      .select()
      .from(applicationDetails)
      .where(eq(applicationDetails.id, WORKSPACE_PROFILE_ID))
      .limit(1);
    return row ?? null;
  }

  async save(input: ApplicationDetailsInput): Promise<ApplicationDetailsRow> {
    const values = {
      contact: input.contact,
      education: input.education,
      certifications: input.certifications,
      spokenLanguages: input.spokenLanguages,
      workAuthorization: input.workAuthorization,
      requiresVisaSponsorship: input.requiresVisaSponsorship,
      noticePeriod: input.noticePeriod,
      timeZone: input.timeZone,
      salaryExpectation: input.salaryExpectation,
      updatedAt: new Date(),
    };
    const [row] = await this.db
      .insert(applicationDetails)
      .values({ id: WORKSPACE_PROFILE_ID, ...values })
      .onConflictDoUpdate({
        target: applicationDetails.id,
        set: { ...values, version: sql`${applicationDetails.version} + 1` },
      })
      .returning();
    if (!row) {
      throw new Error("application details upsert failed");
    }
    return row;
  }
}
