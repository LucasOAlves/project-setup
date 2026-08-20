import type { NormalizedNewsArticle } from "./news-provider.js";

export function filterAndRankArticles(
  articles: NormalizedNewsArticle[],
  topics: string[],
): NormalizedNewsArticle[] {
  const seen = new Set<string>();
  const scored = articles
    .filter((article) => isUsableArticle(article))
    .map((article) => ({
      article,
      overlap: overlapScore(`${article.title} ${article.description}`, topics),
    }))
    .filter((item) => item.overlap > 0)
    .sort((left, right) => {
      if (right.overlap !== left.overlap) {
        return right.overlap - left.overlap;
      }
      return right.article.publishedAt.getTime() - left.article.publishedAt.getTime();
    });

  const unique: NormalizedNewsArticle[] = [];
  for (const item of scored) {
    const key = item.article.url;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item.article);
    if (unique.length >= 12) break;
  }
  return unique;
}

export function overlapScore(text: string, topics: string[]): number {
  const haystack = text.toLowerCase();
  return topics.reduce((score, topic) => {
    const needle = topic.trim().toLowerCase();
    return needle && haystack.includes(needle) ? score + 1 : score;
  }, 0);
}

function isUsableArticle(article: NormalizedNewsArticle): boolean {
  return Boolean(
    article.title.trim() &&
      article.source.trim() &&
      isHttpUrl(article.url) &&
      !Number.isNaN(article.publishedAt.getTime()),
  );
}

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
