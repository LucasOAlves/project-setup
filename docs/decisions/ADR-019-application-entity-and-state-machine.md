# ADR-019 — Application becomes its own entity with an enforced state machine

## Status

Accepted

## Context

[ADR-011](./ADR-011-career-domain-boundaries.md) kept `Application` out of the schema: one
person tracking their own pursuit of a job only needed `jobs.status` and a few columns, and
that ADR said to split the table out once richer per-application state appeared.

Milestone 3 brings that state. The browser worker prepares an application for one job. The
run can end ready for review, missing information, blocked by a login or CAPTCHA, or failed.
The user can prepare it again or reject it. Milestone 4 then binds an approval to one exact
payload. The spec (section 4) states invariants that a free-form column cannot hold: only the
user approves, only an approved application is submitted, and every transition is kept in
history.

`jobs.status` deliberately allows any move, because a real search goes backward (REJECTED
after SCREENING). The application lifecycle must not do that.

## Options considered

1. **Add the new states to `jobs.status`.** No new table. But it mixes the pursuit funnel
   (interviews, offers) with the preparation lifecycle, and the funnel's "any move is fine"
   rule would weaken the invariants the spec asks for.
2. **An `applications` table with one row per job, plus an `application_events` history
   table.** Transitions go through one pure rule (`application-state.ts`) that also says which
   actor (user, worker, system) may make each move.
3. **Many applications per job, one row per attempt.** This handles re-applications, but the
   spec allows only one submission per vacancy and source. Each job has one source, so one row
   per job, with its history, covers it.

## Decision

Option 2. `applications` holds a `job_id` UNIQUE row with `status`, `mode` (AUTOMATED or
MANUAL), the supported `portal` (greenhouse, lever or ashby, or null) and the destination URL.
`application_events` records every transition with its actor and reason, and each transition
is also written to `audit_events`.

`checkTransition` encodes who may do what:
- Only the user starts a run (to PREPARING) or rejects.
- Only the run (the worker, or the system for a manual or abandoned run) records the outcome.
- No outcome can be recorded unless a run is in progress.

The repository applies a transition only if the row is still in the status it was read in,
inside one transaction with the event insert. Two concurrent writers cannot both succeed: the
loser gets a 409.

`jobs.status` keeps its role as the pursuit funnel and is not driven by this table.

## Consequences

- Milestone 4 extends the same state machine with APPROVED, SUBMITTING, SUBMITTED and
  SUBMISSION_UNKNOWN, and adds an `approvals` table that references `applications`.
- Deleting a job deletes its application and history (cascade).
- Re-preparing does not create a new row. The history shows each run.

## Tradeoffs

One row per job means a deliberate re-application after a rejection reuses the same row and
history rather than starting a fresh one. That suits a single user, and it keeps the
duplicate-submission invariant simple to enforce.
