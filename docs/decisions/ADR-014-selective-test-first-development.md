# ADR-014 — Selective test-first development for deterministic logic

## Status

Accepted

## Context

This session's own history handed us a direct test case. `apps/web/src/text-format.ts`
(Unicode bold/italic character mapping for LinkedIn's "rich text" trick) was
written, then tested — following this repo's established after-the-fact
testing convention. Running `text-format.test.ts` immediately caught two real
logic bugs that were invisible from reading the code:

1. The implementation assumed Unicode has an italic digit block. It doesn't —
   digits silently stayed unstyled under italic, which was actually correct
   behavior, but only because the fallback path happened to do the right
   thing; the assumption behind it was wrong and untested.
2. Re-applying a different style to already-styled text silently did
   nothing: styled codepoints (e.g. bold "l") fall outside the plain-ASCII
   `a`-`z` range every character-mapping check was written against, so a
   "re-italicize this bolded phrase" action passed straight through
   unchanged with no error.

Both bugs were logic errors, not wiring mistakes — the kind of thing that
"looks right" on a read-through and only breaks on specific inputs. A test
written *before* the implementation, forcing those specific input/output
cases to be enumerated up front, would have surfaced both before any code
shipped, rather than by the accident of a test file existing at all.

Most of this project's recent work isn't like that, though. The large
majority of features built in this session — the five job-board provider
adapters (`GreenhouseJobProvider`, `LeverJobProvider`, `AshbyJobProvider`,
`RemoteOkJobSearchProvider`, `ArbeitnowJobSearchProvider`,
`AdzunaJobSearchProvider`), the Career→Content topic-suggestion loop, the
`IMPROVE` post-edit action — are routes and services that validate input via
Zod and forward to an already-established provider/repository/AI-call
pattern. Their tests mainly confirm the wiring is connected in the right
order; they don't discover the kind of subtle, input-dependent bug
`text-format.test.ts` just did, because there's no genuinely novel per-case
logic in them to get wrong — the pattern being copied was already validated
the first time it was built.

## Options considered

1. Full TDD, no exceptions — every change, including routine wiring, gets a
   test written before its implementation.
2. No process change — keep writing tests after implementation everywhere,
   as this repo already does.
3. Selective test-first — require it only for new deterministic/pure-logic
   modules; leave routine wiring and UI code on the existing after-the-fact
   convention.

## Decision

Adopt option 3. Test-first is now required specifically for new
**deterministic/pure-logic modules**: scoring formulas, text/data
transforms, parsers, and matching/grounding logic — code whose correctness
depends on correctly enumerating cases, not on wiring an already-established
pattern. Existing examples of this category already in the repo:
`job-fit.ts`, `recruiter-scoring.ts`, `text-format.ts`, and the claim-matching
logic inside `ground-post.ts`.

Everything else — Fastify routes, services that mainly validate a Zod schema
and forward to a provider/repository/AI call, and frontend UI wiring — keeps
the project's existing after-the-fact testing convention. That code's risk
profile is "is the wiring connected correctly," which a test written after
implementation (and manual verification in the running app, per `CLAUDE.md`'s
validate step) already covers just as well as one written before it.

Mechanically, this is now part of the feature workflow in `CLAUDE.md`: the
plan step flags any new pure-logic module as a **test-first candidate**. For
a flagged module, its test file is written before the implementation and run
once to confirm it fails for the intended reason (not a typo or a missing
export) — then implementation proceeds until the tests pass.

## Consequences

- Future deterministic/pure-logic modules get their edge cases enumerated
  before code exists to satisfy them, catching the class of bug this ADR was
  written in direct response to — before it ships, not by accident once a
  test happens to be run.
- Routine wiring additions (a new provider adapter following the
  `JobProvider` pattern, a new edit action following the `PostEditAction`
  pattern) keep their current speed — no test-first ceremony added where the
  risk doesn't justify it.
- The judgment call — "is this a test-first candidate?" — is made once,
  during planning, and stated explicitly in the plan rather than left
  implicit. It's reviewable the same way every other plan decision already
  is, rather than a silent process choice made mid-implementation.
- This is a process-only decision. No code, schema, or runtime behavior
  changes as a result of this ADR — it changes how future work in this repo
  gets built, not anything that's already built.

## Tradeoffs

Full project-wide TDD (Option 1) would guarantee no logic module ever ships
without pre-declared expected behavior, at the cost of slowing down the
routine wiring work that makes up most of this project's actual change
volume — verified against this session's own history, where the large
majority of features shipped were pattern-following wiring, not novel logic.
Option 3 accepts that a wiring bug could still slip through without a
pre-written test, mitigated by the mandatory after-the-fact test and manual
browser verification steps that stay in place regardless — in exchange for
not paying the TDD tax on work where it demonstrably wouldn't have helped.
