export type NewsSearchQuery = {
  topics: string[];
  from: Date;
  language?: string;
};

export type NormalizedNewsArticle = {
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: Date;
  topics: string[];
  provider: string;
  providerArticleId: string;
};

export interface NewsProvider {
  searchNews(query: NewsSearchQuery): Promise<NormalizedNewsArticle[]>;
}
