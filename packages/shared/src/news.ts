import { z } from "zod";

export const newsArticlePublicSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  source: z.string(),
  url: z.string().url(),
  publishedAt: z.string(),
  topics: z.array(z.string()),
});

export type NewsArticlePublic = z.infer<typeof newsArticlePublicSchema>;

export const researchRunPublicSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  queryTopics: z.array(z.string()),
  emptyReason: z.enum(["NO_RELEVANT_TOPICS"]).nullable(),
  articles: z.array(newsArticlePublicSchema),
});

export type ResearchRunPublic = z.infer<typeof researchRunPublicSchema>;
