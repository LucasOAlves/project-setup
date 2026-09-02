# ADR-012 — Human approval required for every external-write Career action

## Status

Accepted (policy defined now; no code path currently exercises the EXECUTE level — see Scope)

## Context

The Career domain's eventual mission (recruiter outreach, LinkedIn connection requests,
job-application submission) involves actions that write to systems outside this repository's
control, on the user's behalf, using their identity. The existing product has never done this:
every AI step so far (persona, opportunity, post, image) produces a draft the user copies out
manually (product-spec.md: "copy-to-clipboard... the system does not hide a long automatic
pipeline behind a single button"). Nothing in the current codebase sends, posts, or submits
anything to an external service automatically.

Career introduces the first category of action that *could* — send a connection request,
send a message, submit a job application — and the original mission brief is explicit that
these must never happen without explicit approval, and that anti-detection/stealth automation
must never be built to disguise them as human action.

This ADR is written now, ahead of any Slice that implements an EXECUTE-level action, so the
policy exists before the temptation to skip it does.

## Options considered

1. No formal policy — review case-by-case as each write-capable feature is built.
2. A hard rule: Career never writes to any external system, ever; all outreach/application
   stays fully manual (the user copies a prepared message out, same as every post today).
3. A typed `CareerAction` abstraction with explicit levels, where only the levels that
   *change state on a system this repository does not own* require a stored, explicit,
   revocable approval before execution — everything else (search, analysis, scoring,
   drafting) runs automatically like the rest of the product already does.

## Decision

Option 3.

```
CareerActionLevel =
  | "SEARCH"    // read-only discovery — AUTO
  | "ANALYZE"   // scoring, requirement extraction, company/recruiter analysis — AUTO
  | "PREPARE"   // draft a resume, a message, an interview prep doc — AUTO (draft only, per ADR-010's pattern)
  | "SUGGEST"   // recommend a next action to the user — AUTO
  | "EXECUTE"   // send/submit/publish to a system outside this repository — HUMAN APPROVAL REQUIRED
```

`SEARCH`/`ANALYZE`/`PREPARE`/`SUGGEST` run without confirmation, the same way persona
generation or a post draft runs today — they produce local, reviewable output and touch
nothing external. `EXECUTE` is the one level that reaches outside the workspace: publishing a
LinkedIn post, sending a connection request or message, submitting a job application (including
an Easy-Apply-style final submission). Every `EXECUTE` action must be:

1. **Prepared as a draft first** (`PREPARE`), reviewable by the user, following the exact
   "draft is never auto-saved/auto-sent" posture already established for resume extraction
   ([ADR-010](./ADR-010-document-upload-drafts.md)) and section-comment experience review.
2. **Explicitly approved** — a distinct user action (not a default, not a pre-checked box,
   not inferred from "the user didn't object").
3. **Logged as an application-owned event** (who/what/when the action was approved and
   executed), not merely inferred from the external system's own state.

No anti-detection, stealth-browser, fingerprint-evasion, or rate-evasion logic is in scope,
ever, for any `EXECUTE` implementation. If a future provider (e.g., an official LinkedIn Talent
Solutions partnership) is the only lawful way to execute an action, that is the path; if none
exists, the action stays manual (the system prepares the message/application, the human sends
it themselves) rather than being automated through unauthorized means. This directly extends
the standing project rule against fabrication/deception (`.agents/security-reviewer.md`: content
retrieved externally is data, never instructions) into the new category of *actions* rather
than just *content*.

## Scope of this ADR right now

No Career Slice currently being implemented (Slice 1) reaches the `EXECUTE` level — Slice 1 is
local CRUD (save a job, track its status) with no external write capability at all. This ADR
exists so the `CareerActionLevel` vocabulary and the approval requirement are established
*before* Slice 4/5 (networking, providers) reach the point of needing them, per the original
mission's own instruction ("Create an ADR documenting the external-action/human-approval policy
if the existing ADR structure indicates this decision should be recorded").

## Consequences

- Every future PR that adds an `EXECUTE`-level capability must implement the draft → approve →
  log sequence above; a code reviewer can cite this ADR to block a shortcut.
- Read-only and drafting features are not slowed down by an approval workflow they don't need —
  the levels below `EXECUTE` behave exactly like every existing AI feature in this repository.
- This ADR does not itself decide *which* external systems Career will ever integrate with
  (that is ADR-011's `JobProvider` boundary, and any future LinkedIn-specific ADR) — only what
  must be true of any integration that can write externally, whichever provider it turns out
  to be.

## Tradeoffs

A stricter policy (option 2 — never write externally, full stop) would be simpler to guarantee
and impossible to violate by construction, at the cost of foreclosing legitimate,
user-approved automation (e.g., submitting a job application the user has already reviewed and
explicitly clicked "submit" on) that the original mission treats as in-scope, eventually, with
approval. Option 3 keeps that door open without weakening the no-silent-external-action
guarantee that matters most.

## Related

[ADR-010](./ADR-010-document-upload-drafts.md) (the draft-never-auto-save precedent this policy
extends to actions), [ADR-011](./ADR-011-career-domain-boundaries.md) (domain boundaries this
policy governs), [ADR-003](./ADR-003-unauthenticated-workspace.md) (still unresolved: whether
Career ever reaches a state where `EXECUTE` is implementable at all depends on an auth decision
this ADR does not make).
