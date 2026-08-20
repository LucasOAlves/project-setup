# ADR-002 — Provider isolation for OpenAI, news, and storage

## Status

Accepted

## Context

The MVP uses OpenAI for text and images, a third-party news API, and local disk for media. These vendors will appear in tests, failures, and possibly replacements. Coupling use cases to SDKs would make domain tests require live APIs.

## Options considered

1. Direct SDK calls from routes and use cases
2. One `OpenAIService` for all AI plus ad-hoc fetch for news
3. Narrow interfaces: `TextGenerationProvider`, `ImageGenerationProvider`, `NewsProvider`, `StorageProvider`

## Decision

Isolate volatile boundaries only.

Text and image generation are separate interfaces even though both are OpenAI in the MVP. Storage is an interface with `LocalStorageProvider`. News is an interface with a NewsAPI.org adapter.

Application models never accept OpenAI, NewsAPI, or filesystem types.

Automated tests use deterministic fakes.

## Consequences

- Use cases can be tested without network
- Replacing NewsAPI or moving storage to object storage does not rewrite domain rules
- Slightly more types at the start

## Tradeoffs

Four interfaces is enough. Generating interfaces for Postgres or Fastify would be theater.
