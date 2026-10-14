# System Design

## Shape

LinkedIn Content Studio is a **modular monolith** in a Turborepo:

- `apps/web` — React, TypeScript, Vite
- `apps/api` — Fastify, TypeScript, PostgreSQL; also the background worker entrypoint (`src/worker.ts`, BullMQ on Redis — ADR-015)
- `packages/shared` — API contracts, domain types, error codes used by both apps
- `packages/config` — shared TypeScript configuration

AI, persistence, and news adapters live inside `apps/api`. They are not packages. Only web and api share types.

Local runtime is Docker Compose: `web`, `api`, `worker`, `postgres`, and `redis`.

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
| profile | profile, experiences, writing samples, photos metadata, resume PDF import (draft, ADR-010) and export |
| persona | persona generation, authority model persistence |
| news | NewsProvider calls, article normalization, persistence |
| relevance | deterministic filters + semantic relevance |
| opportunities | content opportunities, selection (source-scoped, ADR-009), rejection, why-this-post |
| content-plan | the 24-topic editorial calendar as deterministic synthetic opportunities (ADR-006), replaceable by PDF upload (ADR-010) |
| custom-topics | user-authored topics as deterministic synthetic opportunities (ADR-006 pattern, ADR-009) |
| posts | story strategy, draft, reviews, scores, regeneration, publish tracking |
| images | creative brief, prompt, generation, association with post |
| uploads | photo validation and storage identifiers |
| ai | prompt templates, structured-output validation, provider clients |
| career | companies, jobs, job-pursuit status, job fit scoring, résumé tailoring, recruiter/outreach tracking, career analytics, job board import + job search, and Career→Content topic suggestions — additive domain, shares `Profile` as its only cross-domain aggregate (ADR-011); `JobProvider` port (per-company board import — Greenhouse, Lever, Ashby, Workable, SmartRecruiters) and `JobSearchProvider` port (keyword search across companies — RemoteOK, Arbeitnow, Adzuna), all public/unauthenticated except Adzuna's free self-serve key; no LinkedIn integration, no external write ever happens automatically (ADR-012); the Content↔Career loop is one direction only, by design (ADR-013). Job Hunter (ADR-015) adds the source registry, normalization and dedupe, eligibility rules, daily discovery, matching v2, the evidence-checked explanation agent (ADR-016) the ranked job feed (`GET /api/career/feed`, `job-feed.ts`; web step "Job feed") relevance feedback with a calibration summary (`job_feedback`, `job-feedback.ts`) and the target-company watchlist (`company_watches`, `company-watch.ts`, `company-watch-service.ts`) |

Modules may call use cases across boundaries. They must not import OpenAI SDK types, NewsAPI types, or filesystem paths.

## Provider boundaries

Volatile external capabilities are interfaces. Domain code depends on the interface.

```
TextGenerationProvider              (TEXT_PROVIDER env)
├── OpenAITextGenerationProvider    (default; OPENAI_TEXT_MODEL, e.g. gpt-4.1)
└── AnthropicTextGenerationProvider (ANTHROPIC_TEXT_MODEL, e.g. claude-opus-5; ADR-007)

ImageGenerationProvider             (IMAGE_PROVIDER env)
├── OpenAIImageGenerationProvider   (default; OPENAI_IMAGE_MODEL, e.g. gpt-image-1)
└── PollinationsImageGenerationProvider (no key; ADR-008)

NewsProvider
└── NewsApiNewsProvider

StorageProvider
└── LocalStorageProvider

JobProvider                         (Career domain, board import, ADR-011)
├── GreenhouseJobProvider           (public, unauthenticated)
├── LeverJobProvider                (public, unauthenticated)
├── AshbyJobProvider                (public, unauthenticated, includes pay ranges)
├── WorkableJobProvider             (public careers widget, unauthenticated)
└── SmartRecruitersJobProvider      (public Posting API, list + one detail call per posting)

JobSearchProvider                   (Career domain, keyword search, ADR-011)
├── RemoteOkJobSearchProvider       (public, unauthenticated)
├── ArbeitnowJobSearchProvider      (public, unauthenticated)
├── AdzunaJobSearchProvider         (free self-serve ADZUNA_APP_ID/ADZUNA_APP_KEY)
├── RemotiveJobSearchProvider       (public, unauthenticated, attribution required)
└── HimalayasJobSearchProvider      (public, unauthenticated, attribution required)

Both ports are gated by SourceRegistry (`sources` table): CareerService and the
worker's DiscoveryService call assertDiscoveryAllowed(source) before any board import or search.

(no LinkedIn adapter exists for either port)
```

There is no `OpenAIService` god object. Text and image generation are separate
capabilities. Both now have two selectable adapters, chosen at process startup via
env vars — see ADR-007 (text) and ADR-008 (image) for why and their consequences.

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

The pipeline is a sequence of use cases, not one job. There are three ways to reach
the "Opportunities" stage, converging on the same downstream pipeline and tagged
by `source` on `research_runs` / `opportunity_sets` (ADR-009):

```
Profile → Persona → Authority
                       │
        ┌──────────────┼────────────────────┐
        ▼               ▼                    ▼
  Discover News   Content Plan (ADR-006)  Custom Topics (ADR-006 pattern)
  Research         synthetic article       synthetic article
  → Relevance       (deterministic)        (deterministic, user-authored)
  → AI-scored       → no AI evaluation     → no AI evaluation
    Opportunities     (already vetted)       (already vetted, user-picked angle)
        │               │                    │
        └──────────────┴────────────────────┘
                        ▼
              Opportunities.select() (source-scoped)
                        │
                        ▼
                Story Strategy → Draft → AI Writing Review
                → Fact Review → SEO → Score
                → Image Creative Brief → Image Prompt
                → Image Generation → Storage
```

Only Discover News calls the model to evaluate and score candidates. Content Plan
and Custom Topics build the `OpportunityPayload` deterministically from
already-trusted input (the plan's brief, or what the user typed) and skip AI
evaluation entirely — see ADR-006 for why that tradeoff is correct for pre-vetted
input.

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
- normalized news articles used in a run (`research_runs.source`, `news_articles.provider`)
- content opportunities shown to the user (`opportunity_sets.source`,
  `opportunity_sets.selected_at` — which selection is current, across sources; ADR-009)
- selected opportunity, story strategy, post, reviews, score
- creative brief, image prompt, generated image metadata and bytes
- companies and jobs tracked in the Career module, including pursuit status and the
  first-applied timestamp (ADR-011)

Do not persist:

- hidden chain-of-thought
- raw OpenAI payloads as a product feature
- failed provider dumps
- client filenames as paths
- an uploaded resume/content-plan PDF's raw bytes, or an extraction draft the
  user has not confirmed (ADR-010) — the generated résumé PDF is likewise
  rendered on demand from the saved profile, never stored

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
worker  →  redis (BullMQ queues + schedulers)
             →  NewsAPI (egress)
             →  local storage volume
```

Service DNS names are used between containers. `localhost` is not used to reach a sibling container.

The API waits on Postgres readiness and runs migrations. The worker starts after Redis and the API are healthy; queues (`system`, `discovery`, `evaluation`), default retries (3 attempts, exponential backoff from 30s) and deterministic job ids live in `apps/api/src/worker/queues.ts` and `job-ids.ts`, so enqueueing the same discovery run or evaluation twice is a no-op. The `discovery` queue runs `DiscoveryService.runSource` (`modules/career/discovery.ts`): one job scheduler per source in `DISCOVERY_SOURCES` (cron `DISCOVERY_CRON` in `DISCOVERY_TZ`, stale schedulers removed on start), keywords searched sequentially with per-source spacing, each posting imported through `JobIntake` (the same import path the API uses, deduped by provenance), eligibility evaluated only for newly created jobs, and non-excluded jobs queued on `evaluation`. The run's counts are the job's return value and go into its completion audit event. `POST /api/career/discovery/run` enqueues the day's run from the API. The same queue carries the watchlist: a daily `watchlist` scheduler (same cron) fans out one `watch-company` job per watched company, 5s apart, with an id per company per UTC hour; `CompanyWatchPoller` skips a company polled in the last hour, reads its board through the shared board adapters (`board-providers.ts`), imports through `JobIntake.importBoardPosting` (the path manual board import also uses), runs eligibility, queues non-excluded jobs on `evaluation`, and records open roles, roles posted in the last 30 days and new roles on `company_watches`. `POST /api/career/companies/:id/watch/check` queues one poll from the API. The `evaluation` queue runs `JobIntake.evaluateJob`: eligibility rules, then matching v2 (`job-matching.ts`) against the current profile for jobs the rules did not exclude, appended as a `job_evaluations` row. Jobs scoring at least `EXPLANATION_MIN_SCORE` are then explained by `JobExplainer` (`job-explanation.ts`, prompt `ai/prompts/job-explanation.v1.ts`) with the default text provider, at most `EXPLANATION_DAILY_LIMIT` per UTC day; every quote is checked against the source text before it is stored (ADR-016). A failed model call is retried by the queue, and on the last attempt the score is stored without an explanation. With no API key for `TEXT_PROVIDER` the worker logs that explanations are disabled and stores scores only. The same path backs `POST /api/career/jobs/:id/evaluate`. Worker logs are JSON lines passed through `observability/redact.ts` (sensitive keys and email addresses masked); final job failures on pipeline queues are also written to `audit_events`. `.env.example` documents `OPENAI_API_KEY`, `NEWS_API_KEY`, model names, and database URL. Secrets are never committed.
