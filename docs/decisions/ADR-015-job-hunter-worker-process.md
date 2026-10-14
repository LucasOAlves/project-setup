# ADR-015 — Job Hunter grows in this repo, with a BullMQ worker process

## Status

Accepted

## Context

The Job Hunter AI spec (v1.1) describes a personal assistant that discovers remote jobs
daily, filters them by eligibility, ranks and explains them, and later prepares and submits
human-approved applications. It names an Angular + NestJS + PostgreSQL + Redis/BullMQ stack.

This repository already holds much of the spec's Milestone 1 in its Career module
([ADR-011](./ADR-011-career-domain-boundaries.md)): six job-source adapters, deterministic job
fit scoring, grounded resume tailoring, a status funnel, and the external-action approval
policy ([ADR-012](./ADR-012-external-action-approval.md)). What it has never had is
background work: every step so far runs inside a request the user triggered
([ADR-005](./ADR-005-user-paced-generation.md)). A daily discovery run, per-job evaluation
batches, and (Milestone 3) browser sessions cannot live in a request handler.

## Options considered

1. A new repository on the spec's Angular + NestJS stack, porting the existing adapters.
2. Extend this repository on its current stack; run scheduled work with an in-process timer
   inside the API.
3. Extend this repository on its current stack; add Redis + BullMQ and a separate worker
   process that is a second entrypoint of `apps/api`.
4. As 3, but with the worker as its own `apps/worker` package.

## Decision

Option 3. Job Hunter is built here, on React + Fastify + Drizzle + PostgreSQL, and the spec's
frontend/backend framework choice is set aside (its domains, agents and invariants still
apply). Background work runs in `apps/api/src/worker.ts` on BullMQ queues backed by Redis.
Queue names live in `apps/api/src/worker/queues.ts`. Compose runs `redis` and `worker`
alongside `api`, `web` and `postgres`; the worker reuses the API's Docker image.

## Consequences

- The worker imports the same modules (career services, providers, repositories) as the API,
  so there is no shared package to extract, consistent with ADR-001.
- The API still owns migrations; the worker starts after the API is healthy.
- Scheduled work (job schedulers) and retries come from BullMQ rather than hand-rolled timers,
  and survive API restarts.
- ADR-005's user-paced posture still holds for content generation. Job discovery is the first
  pipeline that runs without a click, and it only reaches SEARCH/ANALYZE levels of ADR-012.
- Local runtime now needs Redis; host-run development needs a local Redis or `docker compose
  up redis`.

## Tradeoffs

Option 2 avoids Redis but loses scheduled jobs whenever the API restarts and gives no retry or
concurrency control, which the Milestone 3 browser worker needs. Option 4 gives a cleaner
process boundary but would duplicate the API's module wiring or force a premature package
split. Option 1 matches the spec exactly but rebuilds working, tested code before the first
job feed can exist.
