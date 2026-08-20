import { PREFERRED_NEWS_DOMAINS } from "../news/newsapi-adapter.js";
import { overlapScore } from "../news/article-filter.js";

export type ScoredCandidate = {
  articleId: string;
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: Date;
  overlap: number;
  recency: number;
  sourceQuality: number;
  combined: number;
};

const MIN_COMBINED = 30;

export function recencyScore(publishedAt: Date, now = new Date(), windowDays = 21): number {
  const ageDays = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 100;
  if (ageDays >= windowDays) return 0;
  return Math.round(100 * (1 - ageDays / windowDays));
}

export function sourceQualityScore(url: string): number {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (PREFERRED_NEWS_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      return 100;
    }
  } catch {
    return 0;
  }
  return 45;
}

export function scoreCandidate(input: {
  articleId: string;
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: Date;
  topics: string[];
  now?: Date;
}): ScoredCandidate | null {
  const overlapHits = overlapScore(`${input.title} ${input.description}`, input.topics);
  if (overlapHits <= 0) {
    return null;
  }

  const overlap = Math.min(100, Math.round((overlapHits / 3) * 100));
  const recency = recencyScore(input.publishedAt, input.now);
  const sourceQuality = sourceQualityScore(input.url);
  const combined = Math.round(0.4 * overlap + 0.35 * recency + 0.25 * sourceQuality);

  if (combined < MIN_COMBINED) {
    return null;
  }

  return {
    articleId: input.articleId,
    title: input.title,
    description: input.description,
    source: input.source,
    url: input.url,
    publishedAt: input.publishedAt,
    overlap,
    recency,
    sourceQuality,
    combined,
  };
}

export function combineMatchScore(deterministic: number, semantic: number): number {
  return Math.round(0.6 * deterministic + 0.4 * semantic);
}

export function isRiskyForPersona(topic: string, riskyTopics: string[]): boolean {
  const haystack = topic.toLowerCase();
  return riskyTopics.some((risky) => {
    const needle = risky.trim().toLowerCase();
    return needle.length >= 3 && haystack.includes(needle);
  });
}
