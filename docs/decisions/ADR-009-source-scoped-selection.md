# ADR-009 — `source`-scoped "latest selection" instead of one global pointer

## Status

Accepted

## Context

The MVP had exactly one way to reach a content opportunity: Discover News
(`OpportunityService.generate()` → `OpportunityRepository.getLatest()` →
`select()`). `getLatest()` and the derived `getSelected()` had no notion of
"which flow created this" because there was only ever one flow — every
`opportunity_sets` row was implicitly a Discover row.

Content Plan (ADR-006) then added a second way to reach an opportunity, reusing
the same `opportunity_sets` table with a synthetic, deterministic payload instead
of an AI-scored one. This immediately exposed the missing scoping: selecting a
Content Plan topic and then generating a post would silently use whichever
opportunity Discover News had last selected, because `PostService.requireWriteContext()`
called `OpportunityService.getSelected()`, which called `getLatest()` with no
source argument. A first fix added a `source` column
(`research_runs.source` / `opportunity_sets.source`, `"discover" | "content_plan"`,
migration `0008_source_scoping.sql`) and scoped `getLatest(source)` by it — enough
to stop Content Plan and Discover from clobbering each other's *research/browsing*
state.

Custom Topics (a third, user-authored path, same synthetic-opportunity shape as
Content Plan) then added a third `source` value, `"custom"`. This is when the
remaining bug surfaced during manual testing: `OpportunityService.getSelected()` —
the method `PostService` actually calls when writing a post with no explicit
`opportunityId` — still called `getLatest()` with **no argument**, which defaulted
to `"discover"`. Selecting a Content Plan or Custom topic updated that source's own
`selectedOpportunityId`, but "Write post" kept resolving Discover's selection
instead, silently writing about the wrong topic. Because Discover News had real
prior selections from earlier testing, this failed by producing a *plausible but
wrong* post rather than an obvious error — the worse kind of bug to leave in.

## Options considered

1. Have the frontend pass an explicit `opportunityId` through every "select a
   topic" → "write post" hand-off, for all three entry points
2. Track "the one true current selection" as its own concept, independent of which
   source produced it
3. Keep `getSelected()` hardcoded to `"discover"` and special-case Content Plan /
   Custom Topics call sites

## Decision

Add `opportunity_sets.selected_at` (migration `0011_opportunity_selected_at.sql`),
stamped by `OpportunityRepository.select()` every time a set's
`selectedOpportunityId` is set. Add `OpportunityRepository.getMostRecentlySelected()`:
the opportunity set with a non-null `selectedOpportunityId`, ordered by
`selected_at DESC NULLS LAST`, across **all** sources. `OpportunityService` exposes
this as `getCurrentSelection()`; `getSelected()` (used by `PostService` for
fresh, non-editing generation) now calls it instead of the source-hardcoded
`getLatest()`. A new `GET /api/opportunities/selected` route exposes the same
resolution to the frontend, so `PostView`'s "a different angle is selected" staleness
check compares against the real current selection instead of Discover's alone —
`fetchSelectedOpportunities()` replaces the old `fetchOpportunities()` call there.

`OpportunityService.getLatest()` (used by `OpportunitiesView` to browse Discover's
own candidate list) stays hardcoded to `"discover"` on purpose — that call answers
"what did Discover find," a source-specific question, not "what's currently
selected."

Postgres orders `NULL` **first** in a plain `ORDER BY x DESC` (NULLs sort as
"largest"), not last — the first version of this fix used
`.orderBy(desc(opportunitySets.selectedAt))` and still returned a stale,
pre-migration row with `selected_at IS NULL` ahead of a genuinely recent selection.
The working query uses a raw `sql` fragment: `` sql`${opportunitySets.selectedAt} DESC NULLS LAST` ``,
since drizzle-orm 0.44's query builder has no `nullsLast()` chain on `desc()`.

## Consequences

- Every "select a topic" action across Discover, Content Plan, and Custom Topics
  now converges on one correct, source-agnostic notion of "what should Write Post
  use" — new entry points (a hypothetical fourth source) get this for free by
  calling the same `OpportunityRepository.select()`.
- Rows created before this migration have `selected_at IS NULL` and sort behind any
  real selection, which is the desired legacy behavior (never resurrect an old
  selection over a fresh one) — but means a workspace with *only* pre-migration
  selections and no fresh one would see `getCurrentSelection()` fall back to
  whichever `NULL` row Postgres happens to return, which is unspecified ordering
  among ties. Acceptable for a single-workspace MVP; would need a backfill for a
  multi-tenant version.
- Option 1 (explicit `opportunityId` everywhere) was rejected because it would
  have required every "select" call site in the frontend to thread state into
  `PostView` the same way `editingPostId` already does, multiplying a UI-state
  concern to solve what was fundamentally a backend query bug.

## Tradeoffs

Explicit ID-threading (Option 1) is more predictable — no query ordering to get
right — at the cost of every frontend "select" flow needing to carry and hand off
an ID. The chosen approach keeps the frontend simple (still just `generatePost()`
with no ID for a fresh write) by making the backend's notion of "current
selection" actually correct, which is where the bug lived in the first place.
