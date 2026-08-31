# ADR-010 — Document upload as a draft, never an auto-save

## Status

Accepted

## Context

Two things this session did by hand, once, for one person, needed to become
real product features usable by anyone: a resume PDF was read manually and
typed into the profile forms; a content-plan PDF was read manually and
transcribed into `plan-data.ts` as TypeScript. Both are the same underlying
capability — turn an uploaded PDF into structured data the app already has a
schema for — applied to two different destinations (profile fields, content
plan topics).

The obvious risk is the same one every AI-touches-the-profile feature in this
codebase already had to solve: an extraction step can misread, over-infer, or
hallucinate a field the source document didn't actually state, and if that
goes straight into a saved record it becomes a fact the rest of the pipeline
(persona generation, fact review, grounding) will trust. The section-comment
experience-review feature (built earlier this session) established the
answer for a different trigger — "verify before trusting a new claim, then
let the user confirm it" — and that answer generalizes directly to document
upload.

## Options considered

1. Extract and save immediately — fastest, but a misread field becomes a
   trusted fact with no review step, silently violating the "never invent
   evidence" posture the rest of the app has.
2. Build a dedicated review UI per destination (a new diff/approval screen for
   resume fields, a separate one for content-plan topics).
3. Route the extracted result through the destination's *existing* edit
   surface as a draft: merge into the in-memory state the user already
   reviews before saving (`ProfileInput` for the resume; a read-only preview
   list with one accept/discard action for the whole content-plan batch), and
   make the actual persistence step ("Save and continue" / "Use this plan")
   the same one that already exists for hand-entered data.

## Decision

Option 3, split by how much structure each destination already has:

- **Resume → profile.** `ProfileService.extractResumeDraft(bytes, provider?)`
  extracts PDF text (`pdf-text.ts`, `pdf-parse`), sends it through a
  never-invent prompt (`resume-extraction.v1.ts`, same posture as
  `persona.v1.ts`), validates against `resumeDraftSchema` (a `.pick()` subset
  of `profileInputSchema`), and returns the draft with **no DB write**.
  `App.tsx` does `setProfile((current) => ({ ...current, ...draft }))` —
  merging into the exact `ProfileInput` state the Identity/Experience/
  Positioning/Writing forms already edit. There is no new review UI: the
  existing forms *are* the review step, the same way they already are for a
  profile typed in by hand. "Save and continue" is the only path to disk.
- **Content-plan document → topics.** Same shape (`extractFromDocument()`,
  `content-plan-extraction.v1.ts`, `extractedTopicsSchema`), but the
  destination has no existing per-field edit surface for a whole batch of up
  to ~24 topics — `ContentPlanView` shows a read-only preview list instead
  (title/pillar/format per topic) with **Use this plan** / **Discard**.
  `saveUploadedTopics()` is the only path to disk, writing one row to a new
  `content_plan_uploads` table (see ADR-006's Update section).

Both extraction calls resolve their AI provider through the same
`resolveTextProvider(...)` pattern every other AI-consuming service in this
codebase uses — no new provider-selection mechanism.

## Consequences

- A single shared PDF-to-text helper (`apps/api/src/modules/profile/pdf-text.ts`)
  is used by both `ProfileService` and `ContentPlanService`, despite living
  under `profile/` — it has no profile-specific logic, it was just resume
  upload's first caller. A third document-upload feature should prompt moving
  it somewhere source-neutral (e.g. `modules/ai/` or its own `documents/`
  module) rather than a third import across module boundaries.
- Extraction is a genuinely separate AI call from persistence for both
  destinations — a network failure or malformed-JSON response during
  extraction leaves the previously-saved profile/plan completely untouched,
  by construction, not by extra error-handling code.
- The content-plan preview is intentionally coarse: accept the whole batch or
  discard it, no per-topic editing before saving (see the plan's Out of scope).
  A user who wants to fix one bad topic re-uploads or edits the saved result
  afterward through the normal per-topic status flow — acceptable for a
  batch that large; would need per-field editing if batches got small and
  frequent.
- Large documents (the real 24-topic content plan is one) push output length
  close to the text-provider's response budget — see the note below.

## Tradeoffs

Option 2 (a dedicated review UI per destination) would make the "this is a
draft" boundary more visually explicit — a diff view, a per-field accept/
reject — at the cost of building and maintaining two new UIs for something
the app already has a review surface for (the profile forms) or doesn't need
fine-grained review for (a whole plan is swapped as a unit). Reusing the
existing edit/save path for the resume keeps the mental model identical to
typing the same data in by hand; the coarser content-plan preview matches how
that data is actually consumed (as a batch, replacing the whole calendar).

## Related — output budget for large extractions

Manually verifying content-plan extraction against the real 24-topic PDF
surfaced two real bugs, both fixed as part of this feature rather than
worked around:

1. `AnthropicTextGenerationProvider`'s `max_tokens` was fixed at `16000`. The
   real plan's extraction used 15,726 output tokens against that cap — not
   truncated on the run that was checked, but with almost no margin, and one
   earlier run *did* return unparseable (truncated) JSON at that ceiling.
   Raised to `32000` to give real headroom; this is a provider-wide change,
   not content-plan-specific, since any large structured extraction shares
   the same budget.
2. The model's `priority` field (instructed as 0-100) sometimes echoed a
   ranking number from the source document a few points over 100. Rather
   than reject the whole batch over a cosmetic ranking value, `content-plan-service.ts`
   clamps `priority` into `[0, 100]` after parsing and before schema
   validation — a deterministic normalization of a ranking number, not a
   factual claim, so it doesn't compromise the "never invent evidence"
   posture the rest of extraction holds to.
