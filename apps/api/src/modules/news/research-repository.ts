import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { newsArticles, researchRuns } from "../../db/schema.js";
import { WORKSPACE_PROFILE_ID } from "../profile/profile-repository.js";
import type { NormalizedNewsArticle } from "./news-provider.js";

export type ResearchSource = "discover" | "content_plan" | "custom";

export class ResearchRepository {
  constructor(private readonly db: Database) {}

  async getLatest(source: ResearchSource = "discover") {
    const [run] = await this.db
      .select()
      .from(researchRuns)
      .where(
        and(eq(researchRuns.profileId, WORKSPACE_PROFILE_ID), eq(researchRuns.source, source)),
      )
      .orderBy(desc(researchRuns.createdAt))
      .limit(1);
    if (!run) {
      return null;
    }

    const articles = await this.db
      .select()
      .from(newsArticles)
      .where(eq(newsArticles.runId, run.id));

    return { run, articles };
  }

  async create(input: {
    personaId: string;
    queryTopics: string[];
    articles: NormalizedNewsArticle[];
    source?: ResearchSource;
  }) {
    return this.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(researchRuns)
        .values({
          id: randomUUID(),
          profileId: WORKSPACE_PROFILE_ID,
          personaId: input.personaId,
          queryTopics: input.queryTopics,
          source: input.source ?? "discover",
        })
        .returning();

      if (!run) {
        throw new Error("research run insert failed");
      }

      if (input.articles.length > 0) {
        await tx.insert(newsArticles).values(
          input.articles.map((article) => ({
            id: randomUUID(),
            runId: run.id,
            title: article.title,
            description: article.description,
            source: article.source,
            url: article.url,
            publishedAt: article.publishedAt,
            topics: article.topics,
            provider: article.provider,
            providerArticleId: article.providerArticleId,
          })),
        );
      }

      const stored = await tx
        .select()
        .from(newsArticles)
        .where(eq(newsArticles.runId, run.id));

      return { run, articles: stored };
    });
  }
}
