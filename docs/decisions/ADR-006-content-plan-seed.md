# ADR-006 — Content Plan topics as deterministic synthetic opportunities

## Status

Accepted

## Context

The user supplied `linkedin-technical-publishing-plan.pdf`: a fixed 12-week, 24-post
editorial calendar with pre-approved briefs (working title, format, priority, hook,
key points, CTA, confidentiality classification, bibliography). This is a different
shape of input than the existing pipeline, which discovers current events via
`NewsProvider` and lets the model evaluate relevance against the persona.

The plan's topics are already vetted by the user outside the app. Running them back
through AI opportunity evaluation would add variance and cost without adding value —
the "why this fits" reasoning is already in the brief.

## Options considered

1. Extend `content_opportunities`/`opportunity_sets` schema with a nullable
   `articleId` and a new `topicId` reference, adding a second code path through
   `OpportunityService`.
2. Build a fully separate post-generation pipeline for plan topics.
3. Represent each selected plan topic as a synthetic `news_articles` row (provider
   `content_plan`) plus a deterministically-built `OpportunityPayload`, created via
   the existing `ResearchRepository.create()` / `OpportunityRepository.create()` /
   `OpportunityService.select()`, with no AI call.

## Decision

Option 3. A new `ContentPlanService.selectTopic()`:

1. Inserts one synthetic article via `ResearchRepository.create()` — `source` is
   "LinkedIn Technical Publishing Plan", `url` is the brief's first bibliography
   source, `provider` is `content_plan`.
2. Builds an `OpportunityPayload` directly from the brief fields (`evidence` = the
   brief's key points, `angle` mapped from format, never `EXPERIENCE_DRIVEN` since
   the plan's confidentiality policy forbids first-person proprietary claims).
3. Persists it via `OpportunityRepository.create()` and marks it selected via the
   existing `OpportunityService.select()`.
4. Records topic status in one new table, `content_plan_topics`, keyed by the plan's
   own topic id (`T01`-`T24`).

`PostService.generate()` needs no changes: it already reads the selected opportunity
by `opportunities.getSelected()`, and `ground-post.ts` grounds claims against the
opportunity's article URL and the profile corpus regardless of where the opportunity
came from.

## Consequences

- No schema change to `news_articles`, `research_runs`, `opportunity_sets`, or
  `content_opportunities`.
- Selecting a plan topic creates its own research run and opportunity set, tagged
  `source: "content_plan"` — it does not replace Discover News' own "latest" state
  (see ADR-009; this was a real bug for a while, fixed after Custom Topics made it
  observable).
- Only the 24 approved topics (T01-T24) are imported; reserve/rejected topics
  (T25-T36) are out of scope for this pilot.
- Engagement metrics from the plan's measurement section (24h/7d/30d) are not
  tracked — only editorial status (Planned/Selected/Drafted/Published/Skipped),
  since no LinkedIn analytics API is available.

## Tradeoffs

A schema extension (option 1) would be more explicit about "this opportunity came
from a plan, not discovery" but duplicates code paths in `OpportunityService` for
no behavioral gain. Reusing the existing tables through a synthetic article keeps one
code path and repository set at the cost of a slightly unusual `content_plan`
provider value on the article record.

## Related

Custom Topics (user-authored topics, added later) reuses this exact synthetic-
opportunity pattern verbatim — same `ResearchRepository.create()` /
`OpportunityRepository.create()` / `OpportunityService.select()` sequence, `source:
"custom"` instead of `"content_plan"`, no new ADR needed for it. See ADR-009 for
the source-scoping fix this pattern's second and third users made necessary.
