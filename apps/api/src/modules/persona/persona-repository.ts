import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { PersonaPayload } from "@studio/shared";
import type { Database } from "../../db/client.js";
import { professionalPersonas } from "../../db/schema.js";
import { WORKSPACE_PROFILE_ID } from "../profile/profile-repository.js";

export class PersonaRepository {
  constructor(private readonly db: Database) {}

  async getLatest() {
    const [row] = await this.db
      .select()
      .from(professionalPersonas)
      .where(eq(professionalPersonas.profileId, WORKSPACE_PROFILE_ID))
      .orderBy(desc(professionalPersonas.createdAt))
      .limit(1);
    return row ?? null;
  }

  async insert(input: {
    payload: PersonaPayload;
    model: string;
    promptVersion: string;
  }) {
    const [row] = await this.db
      .insert(professionalPersonas)
      .values({
        id: randomUUID(),
        profileId: WORKSPACE_PROFILE_ID,
        payload: input.payload,
        model: input.model,
        promptVersion: input.promptVersion,
      })
      .returning();
    return row;
  }
}
