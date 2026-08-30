import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { OpportunityPayload } from "@studio/shared";
import type { Database } from "../../db/client.js";
import { contentOpportunities, newsArticles, opportunitySets } from "../../db/schema.js";
import { WORKSPACE_PROFILE_ID } from "../profile/profile-repository.js";

export type OpportunitySource = "discover" | "content_plan" | "custom";

export class OpportunityRepository {
  constructor(private readonly db: Database) {}

  async getLatest(source: OpportunitySource = "discover") {
    const [set] = await this.db
      .select()
      .from(opportunitySets)
      .where(
        and(
          eq(opportunitySets.profileId, WORKSPACE_PROFILE_ID),
          eq(opportunitySets.source, source),
        ),
      )
      .orderBy(desc(opportunitySets.createdAt))
      .limit(1);
    if (!set) {
      return null;
    }
    return this.loadSet(set.id);
  }

  async create(input: {
    researchRunId: string;
    personaId: string;
    promptVersion: string;
    model: string;
    source?: OpportunitySource;
    opportunities: Array<{
      articleId: string;
      matchScore: number;
      payload: OpportunityPayload;
    }>;
  }) {
    const setId = randomUUID();
    await this.db.transaction(async (tx) => {
      await tx.insert(opportunitySets).values({
        id: setId,
        profileId: WORKSPACE_PROFILE_ID,
        researchRunId: input.researchRunId,
        personaId: input.personaId,
        promptVersion: input.promptVersion,
        model: input.model,
        source: input.source ?? "discover",
      });

      if (input.opportunities.length > 0) {
        await tx.insert(contentOpportunities).values(
          input.opportunities.map((opportunity, index) => ({
            id: randomUUID(),
            setId,
            articleId: opportunity.articleId,
            payload: opportunity.payload,
            matchScore: opportunity.matchScore,
            sortOrder: index,
          })),
        );
      }
    });
    return this.loadSet(setId);
  }

  async select(setId: string, opportunityId: string) {
    const rows = await this.db
      .select()
      .from(contentOpportunities)
      .where(eq(contentOpportunities.id, opportunityId));
    const row = rows[0];
    if (!row || row.setId !== setId) {
      return null;
    }

    await this.db
      .update(opportunitySets)
      .set({ selectedOpportunityId: opportunityId, selectedAt: new Date() })
      .where(eq(opportunitySets.id, setId));
    return this.loadSet(setId);
  }

  async getMostRecentlySelected() {
    const [set] = await this.db
      .select()
      .from(opportunitySets)
      .where(
        and(
          eq(opportunitySets.profileId, WORKSPACE_PROFILE_ID),
          isNotNull(opportunitySets.selectedOpportunityId),
        ),
      )
      .orderBy(sql`${opportunitySets.selectedAt} DESC NULLS LAST`)
      .limit(1);
    if (!set) {
      return null;
    }
    return this.loadSet(set.id);
  }

  private async loadSet(setId: string) {
    const [set] = await this.db
      .select()
      .from(opportunitySets)
      .where(eq(opportunitySets.id, setId))
      .limit(1);
    if (!set) {
      return null;
    }

    const rows = await this.db
      .select()
      .from(contentOpportunities)
      .where(eq(contentOpportunities.setId, setId));

    const articleIds = rows.map((row) => row.articleId);
    const articles =
      articleIds.length === 0
        ? []
        : await this.db.select().from(newsArticles).where(inArray(newsArticles.id, articleIds));

    return { set, rows, articles };
  }

  async getById(id: string) {
    const [row] = await this.db
      .select()
      .from(contentOpportunities)
      .where(eq(contentOpportunities.id, id))
      .limit(1);
    if (!row) {
      return null;
    }
    const record = await this.loadSet(row.setId);
    if (!record) {
      return null;
    }
    return {
      ...record,
      rows: record.rows.filter((item) => item.id === id),
    };
  }
}
