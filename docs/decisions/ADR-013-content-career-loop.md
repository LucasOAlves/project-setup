# ADR-013 — Content↔Career intelligence loop is asymmetric by design

## Status

Accepted

## Context

The Career expansion's stated differentiator is that Content and Career reinforce each
other: market signal from tracked jobs should inform what to write about, and — per the
original mission brief — content engagement should eventually inform networking. Building
both directions naively, without checking what real data actually backs each one, risks
repeating the exact mistake this project already corrected once in Career Analytics —
`career-analytics.ts` explicitly omits "recruiter responses" from its metrics because there
is no real channel to measure it through, rather than reporting a number this app can't
back up.

## Options considered

1. Build both directions symmetrically, inferring or approximating the data Content→Career
   would need (e.g., treat every post's `outcomeNotes` free-text field as if it reliably
   signals recruiter engagement).
2. Build only the Career→Content direction now, since it's the one this app has real,
   structured data for; explicitly defer Content→Career until a real data source exists,
   rather than fake one.
3. Build neither, treating the loop as future work entirely.

## Decision

Option 2.

**Career → Content (built).** `content-suggestions.ts`'s `computeContentTopicSuggestions()`
is a pure, deterministic function: it tallies which technologies the user's *tracked jobs*
actually request (reusing the same tally shape as `career-analytics.ts`'s `topTechnologies`),
then keeps only the ones the profile has real, matchable evidence for
(`job-fit.ts`'s `skillsMatch`, exported for this reuse) — a technology with no evidence is
dropped, never suggested. Each surviving suggestion carries the market-demand fraction, a
concrete evidence line (the specific experience it traces to), and a ready-to-edit hook. The
UI's "Draft this as a topic" button hands that hook, evidence, and technology straight into
`CustomTopicsView`'s existing form as a pre-filled draft (`CustomTopicDraft`) — never
auto-created, the same draft-then-confirm posture as every other AI-adjacent feature in this
codebase (ADR-010). No AI call is involved anywhere in this direction; it's a filtered,
grounded aggregate over data this app already owns.

**Content → Career (deferred, not built).** The original brief's own example — "Post →
engagement → relevant professional interaction → potential contact → Career CRM suggestion"
— requires knowing who engaged with a post and how. This app has no LinkedIn integration
(ADR-011) and therefore no real engagement data: no likes, no comments, no impressions, no
identity of who interacted. The only content-side signal that exists at all is
`GeneratedPost.outcomeNotes`, a free-text field the user *manually* types after publishing —
useful as a journal entry, not a structured signal a deterministic rule could safely turn into
"here's a recruiter to add." Building this now would mean either (a) doing shallow keyword
matching on free text and presenting it as intelligence it isn't, or (b) an AI call
interpreting vague prose into a fabricated-sounding CRM suggestion — both fail this project's
standing bar of "never suggest a connection this app can't actually justify."

## Consequences

- The loop the product now demonstrates is real and traceable end-to-end: a technology
  suggestion can always be traced back to a specific tracked job and a specific real
  experience, the same trust bar every other feature in this codebase holds to.
- "57% of your target jobs ask for System Design, and your profile has real System Design
  experience" — the mission's own example — is exactly what this direction produces.
- The reverse direction remains explicitly open, not abandoned: if a real engagement signal
  ever exists (an official LinkedIn analytics API, per a future ADR revisiting ADR-011's
  scope) or `outcomeNotes` grows structured fields, that would be the moment to build it —
  against real data, the same way this ADR insisted on for the direction that shipped.

## Tradeoffs

Shipping only half the originally-imagined loop is a smaller demo than "the two domains
fully reinforce each other" implies. The alternative — approximating the missing half with
weak signal dressed up as intelligence — would have produced a flashier feature that quietly
violates the project's own standing rule against suggesting things it can't justify. Judged
not worth the trade.
