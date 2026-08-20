# System Design

## Shape

LinkedIn Content Studio is a **modular monolith** in a Turborepo:

- `apps/web` — React, TypeScript, Vite
- `apps/api` — Fastify, TypeScript, PostgreSQL
- `packages/shared` — API contracts, domain types, error codes used by both apps
- `packages/config` — shared TypeScript configuration

AI, persistence, and news adapters live inside `apps/api`. They are not packages. Only web and api share types.

Local runtime is Docker Compose: `web`, `api`, and `postgres`.

## Request flow

```
HTTP request
→ schema validation
→ controller
→ use case
→ repository or provider
→ validated response
```

Controllers stay thin. Domain rules do not live in routes or React components.

## Backend modules

| Module | Owns |
| --- | --- |
| profile | profile, experiences, writing samples, photos metadata |
| persona | persona generation, authority model persistence |
| news | NewsProvider calls, article normalization, persistence |
| relevance | deterministic filters + semantic relevance |
| opportunities | three content opportunities, rejection, why-this-post |
| posts | story strategy, draft, reviews, scores, regeneration |
| images | creative brief, prompt, generation, association with post |
| uploads | photo validation and storage identifiers |
| ai | prompt templates, structured-output validation, provider clients |

Modules may call use cases across boundaries. They must not import OpenAI SDK types, NewsAPI types, or filesystem paths.

## Provider boundaries

Volatile external capabilities are interfaces. Domain code depends on the interface.

```
TextGenerationProvider
└── OpenAITextGenerationProvider

ImageGenerationProvider
└── OpenAIImageGenerationProvider

NewsProvider
└── NewsApiNewsProvider

StorageProvider
└── LocalStorageProvider
```

There is no `OpenAIService` god object. Text and image generation are separate capabilities even though both use OpenAI in the MVP.

Provider-specific request/response types stay in the adapter. Internal models are application-owned.

## AI vs deterministic

AI is used only where semantic judgment or generation creates value:

- persona and authority interpretation
- opportunity, angle, and story strategy
- post drafting and editorial review
- fact-to-source grounding review
- natural keyword integration
- image creative brief, prompt, and image generation

Deterministic software owns:

- validation, MIME, size, quantity
- identifiers, persistence, migrations
- recency, source-quality, and keyword-overlap filters
- orchestration and retry policy
- combining scores after each dimension exists
- rejecting opportunities with no source URL or no profile evidence

Hybrid:

1. News candidates are filtered deterministically.
2. Survivors are scored semantically.
3. A hard rejection rule still wins over a high model score.

## AI pipeline

The pipeline is a sequence of use cases, not one job.

```
Profile
→ Persona
→ Authority
→ Research
→ Relevance
→ Opportunities
→ Story Strategy
→ Draft
→ AI Writing Review
→ Fact Review
→ SEO
→ Score
→ Image Creative Brief
→ Image Prompt
→ Image Generation
→ Storage
```

The frontend advances the user through these stages. The API persists durable results after each successful stage so image retry does not regenerate the post.

OpenAI failures return safe application errors. The user retries the failed stage only.

## Prompt architecture

Runtime prompts live in `apps/api` under an explicit template layer, versioned when behavior changes.

Typical sections: role, context, objective, input, constraints, process, output format, quality criteria.

Structured outputs are schema-validated before persistence. Invalid model output is a provider failure, not stored.

External article text and user profile text enter prompts as data, never as instructions.

## Persistence direction

Persist:

- profile, experiences, writing samples
- uploaded photo metadata and bytes via StorageProvider
- generated persona and authority snapshot
- normalized news articles used in a run
- content opportunities shown to the user
- selected opportunity, story strategy, post, reviews, score
- creative brief, image prompt, generated image metadata and bytes

Do not persist:

- hidden chain-of-thought
- raw OpenAI payloads as a product feature
- failed provider dumps
- client filenames as paths

History: keep the latest persona per profile. Keep generated posts and images so regeneration can add a new version without deleting the previous publishable result. Do not build a full event-sourced history.

Aggregate root for the demo is `Profile`. There is no `User` or auth table in the MVP.

## Storage

Uploaded photos and generated images use `LocalStorageProvider` with server-generated identifiers.

The API serves them through application routes. Containers never treat a client filename as a filesystem path.

A future object-storage adapter should not require domain changes.

## News

`NewsProvider.searchNews(topics, dateRange)` returns `NewsArticle` records.

The MVP adapter is NewsAPI.org, queried with a recency window and a high-quality domain preference. The relevance engine still ranks and rejects. NewsAPI is an implementation detail.

## Error strategy

Application errors are typed and stable:

- validation
- not found
- provider unavailable
- provider timeout
- malformed AI output
- unsupported media
- storage failure
- no relevant topics

HTTP layer maps these to status codes. Messages are user-safe. Stack traces, keys, SDK bodies, and internal paths are never sent to the client.

## Testing

- Unit tests for domain scoring, rejection rules, validation, and prompt-context assembly.
- Integration tests for API + Postgres + mocked providers.
- No automated test calls the real OpenAI or NewsAPI.
- Property tests for AI stages: schema validity, required grounding fields, rejection of unsupported personal claims, failure mapping.
- End-to-end coverage only for the critical happy path once the UI exists.

## Docker Compose

```
web  →  api  →  postgres
             →  OpenAI (egress)
             →  NewsAPI (egress)
             →  local storage volume
```

Service DNS names are used between containers. `localhost` is not used to reach a sibling container.

The API waits on Postgres readiness. `.env.example` documents `OPENAI_API_KEY`, `NEWS_API_KEY`, model names, and database URL. Secrets are never committed.
