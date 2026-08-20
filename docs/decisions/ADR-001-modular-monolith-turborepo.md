# ADR-001 — Modular monolith in Turborepo with Docker Compose

## Status

Accepted

## Context

The MVP needs a React frontend, a Fastify API, PostgreSQL, and a reproducible local environment. The prompt suggested several packages. Microservices, Kubernetes, and extra infrastructure would make the demo look sophisticated and finish late.

## Options considered

1. Separate repositories for web and API
2. Microservices per domain module
3. Modular monolith in one Turborepo, Compose for local runtime
4. Frontend-only app calling OpenAI directly

## Decision

Use a Turborepo modular monolith: `apps/web`, `apps/api`, `packages/shared`, `packages/config`. Run web, api, and postgres with Docker Compose.

Do not extract `ai` or `database` packages until a second consumer exists.

Do not put OpenAI keys in the frontend.

## Consequences

- One deployable API, clear module folders
- Shared types without sharing implementations
- Compose is the documented developer path
- Future extraction of a provider package is possible but not prepaid

## Tradeoffs

Turborepo adds some workspace ceremony. That cost is lower than splitting services or duplicating types.
