# ADR-004 — NewsAPI.org as the concrete NewsProvider

## Status

Accepted

## Context

The product must discover recent technology events without fabricating them and without coupling domain logic to a vendor. Official blogs are higher quality than aggregators, but a persona-specific search needs a query API.

## Options considered

1. Curated RSS only from official engineering blogs
2. LLM-invented "news" (rejected: factual integrity)
3. Tavily/Exa/Firecrawl semantic web search
4. NewsAPI.org search with recency and preferred domains
5. Scrape Google News (rejected: brittle, legally noisy)

## Decision

Use `NewsProvider.searchNews(topics, dateRange)` and implement `NewsApiNewsProvider` for the MVP.

Prefer high-quality domains when the adapter can constrain sources. Persist normalized `NewsArticle` records. Rank and reject in the relevance module, not in the adapter.

Full article bodies are not required for MVP discovery. Title, description, source, URL, and published date are enough for traceability. Do not scrape article HTML in this slice.

## Consequences

- Local demo needs `NEWS_API_KEY`
- Free NewsAPI terms are development-oriented; production use would need a license change or a new adapter
- Quality still depends on relevance rejection, because aggregators are noisy

## Tradeoffs

RSS would be cleaner and poorer at matching arbitrary personas. Semantic search tools may return better pages later; the interface allows replacement without domain rewrite.
