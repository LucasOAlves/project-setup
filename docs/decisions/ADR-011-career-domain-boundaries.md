# ADR-011 — Career domain as an additive module; LinkedIn as a future provider, not the domain

## Status

Accepted (Slice 1 only — see Scope below)

## Context

The product is expanding from a content-only tool into a Career & Professional Growth
Platform: job tracking, fit scoring, resume tailoring, and eventually recruiter/networking
intelligence, alongside the existing content pipeline (persona → discovery → opportunity →
post → image).

This ADR does not replace or invalidate [ADR-003](./ADR-003-unauthenticated-workspace.md)
(unauthenticated single-workspace) or the product spec's explicit MVP exclusions ("LinkedIn
scraping, OAuth, or publishing... user accounts, teams, billing, or multi-tenant SaaS...
background job platforms, Redis, Kafka, or microservices"). It sits alongside them as a new
decision for a new domain, kept comparable rather than merged into the old text, per the
project's own convention of appending an "Update" section instead of rewriting a decision
(see ADR-002's, ADR-006's) — here the difference is large enough to warrant a new numbered
ADR rather than an update note, since it defines a new domain's boundaries rather than
revising an existing one's consequences.

## Options considered

1. **A second, disconnected application** dedicated to career/job-search, sharing nothing
   but the database.
2. **A LinkedIn-shaped domain** — model `Job`, `Company`, `Application` etc. directly against
   LinkedIn's data shapes and APIs, since LinkedIn is the dominant source in practice.
3. **An additive domain module inside the existing monolith** (`apps/api/src/modules/career/`),
   following the same package-by-domain, routes→service→repository shape as every existing
   module, with job data sourced from a `JobProvider` port — LinkedIn as one *possible* future
   adapter behind it, not the shape of the domain itself.

## Decision

Option 3.

- **Same monolith, same conventions.** `career` is a new top-level module directory,
  identical in shape to `profile`, `content-plan`, `custom-topics`: `*-routes.ts` (thin) →
  `*-service.ts` (domain rules) → `*-repository.ts` (Drizzle). No second app, no separate
  deployment, no new orchestrator.
- **Professional profile stays the single source of truth.** Career reads `ProfilePublic`
  (`packages/shared/src/profile.ts`) for job matching, resume tailoring, and fit scoring
  inputs — the same aggregate already used for persona and content generation (see
  domain-model.md's `Profile` ownership). No parallel "career profile" is created.
- **`Job`/`Company` are provider-agnostic from the schema up**, even though Slice 1 has
  exactly one way to create them: a person typing the data into a form (`source: "manual"`
  on the `jobs` row, mirroring how `content_plan_topics`/`custom_topics` already carry a
  `source` discriminator). No `JobProvider` interface is built yet — see Deferred below —
  but no field, table, or route assumes LinkedIn, Greenhouse, or any other vendor's shape.
- **`Application` is not a separate table in Slice 1.** The mission brief modeled `Job` and
  `Application` as distinct concepts; for this repository's actual scale (one person tracking
  their own pursuit of a role, essentially always exactly one application per job posting),
  a separate join-table doubles the write path and the query surface for no behavior gained
  yet. `jobs.status` carries the full pursuit funnel (`SAVED` → ... → `OFFER`/`REJECTED`/
  `WITHDRAWN`) and `jobs.applied_at`/`jobs.notes`/`jobs.next_action` carry the
  application-tracking fields directly. This mirrors `.agents/software-architect.md`'s
  standing instruction to avoid "generic abstractions for hypothetical future requirements"
  and the project's own "do not over-model the first implementation" bias (product-spec.md,
  ADR-006). If a real need for many-applications-per-job or richer per-application state
  (multiple resume versions per attempt, re-applications) shows up, split the table then,
  as its own migration — not now.
- **LinkedIn is a future provider, never the domain.** No table, schema field, or service
  method encodes a LinkedIn-specific shape. The port this decision defers (`JobProvider`,
  parallel to `NewsProvider`/`TextGenerationProvider` per
  [ADR-002](./ADR-002-provider-isolation.md) and `.skills/provider-isolation`) is named for
  the capability ("give me normalized job postings"), not the vendor.

## Deferred (explicitly, not forgotten)

- **`JobProvider` interface + adapters** (Greenhouse, Lever, LinkedIn) — Slice 5 per the
  original mission's slice plan. Slice 1 has exactly one source (a person's own typing), so
  building the interface now would be exactly the "interface for symmetry" `.skills/provider-isolation`
  warns against ("do not wrap stable internal code in interfaces for symmetry"). The schema's
  `source`/`external_id` columns exist today specifically so this can be added later without
  a breaking migration.
- **`Recruiter`/`Interview` entities** — Slices 3–4. No ingestion, scoring, or outreach
  pipeline exists yet to populate them; modeling them empty now is speculative schema.
- **`JobFit` scoring** — Slice 2. Slice 1 ships `jobs.fit_score` as a nullable column so the
  UI has a stable place to render it once Slice 2 exists, but nothing computes it yet.

## Consequences

- Career and Content are two domains in one deployable, sharing `Profile` as the only
  cross-domain aggregate — consistent with how `content-plan`/`custom-topics`/`opportunities`
  already coexist today.
- No new infrastructure (no auth, no queue, no second database) enters the stack for Slice 1.
- A future LinkedIn/Greenhouse/Lever integration is additive (new adapter file + new `source`
  value), not a rewrite, because the boundary is drawn now even though it's implemented later.
- This ADR's Slice-1 scope explicitly does **not** resolve whether the platform will later
  need authenticated, multi-user, or externally-writing capability (LinkedIn OAuth,
  outreach automation). That remains governed by ADR-003 until a dedicated ADR revisits it —
  this document does not attempt to settle that question, it only ensures Career's Slice-1
  shape doesn't foreclose either answer.

## Tradeoffs

Collapsing `Application` into `jobs.status` (rather than a separate table, per option in the
original brief) is easier to outgrow later than to build prematurely: a future split requires
a migration and a backfill, but building the join now would mean maintaining two tables and
two write paths for a relationship that is 1:1 in every case this product currently has to
serve. Judged as the right trade for Slice 1's actual scale.

## Related

[ADR-002](./ADR-002-provider-isolation.md) (provider isolation pattern reused for the deferred
`JobProvider`), [ADR-003](./ADR-003-unauthenticated-workspace.md) (still governs auth/scope —
not superseded), [ADR-006](./ADR-006-content-plan-seed.md) and
[ADR-010](./ADR-010-document-upload-drafts.md) (precedents for `source`-discriminated,
provider-agnostic domain records this ADR follows), [ADR-012](./ADR-012-external-action-approval.md)
(human-approval policy for any future write-capable Career action).
