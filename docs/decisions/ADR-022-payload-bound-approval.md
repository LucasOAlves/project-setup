# ADR-022 — Approval bound to one payload, and at most one submission

## Status

Accepted (Milestone 4). The approval part is built in ticket 2. The submission rules below are
the contract for tickets 4 and 5. Applies [ADR-012](./ADR-012-external-action-approval.md) to
job applications.

## Context

Milestone 4 lets the app submit a prepared application. The spec's invariants (section 4):
- only the signed-in user approves;
- an approval is valid for one exact payload and destination, and any material change after it
  invalidates it;
- only an APPROVED application can enter SUBMITTING, and the worker checks the approval again
  right before the final action;
- an application is submitted at most once, and an uncertain result never triggers an
  uncontrolled retry.

ADR-012 requires draft, explicit approval and an app-owned log for every EXECUTE action, but it
does not say what an approval is bound to.

## Options considered

1. **A flag on the application** (`approved_at`). Simple, but nothing ties it to what the user
   saw, so a later preparation would inherit it.
2. **An approval row bound to the payload hash, checked by comparing hashes.** Milestone 3
   already computes a canonical hash of the destination, the form's shape, every value and each
   attachment's version and file hash (`application-payload.ts`). The approval stores that hash,
   and submission recomputes it from the freshly filled page.
3. **Store a full copy of the approved payload and diff it before submitting.** Exact, but it
   duplicates personal data into another table, and the hash already detects any difference.

## Decision

Option 2. The `approvals` table (migration 0032) holds the payload hash, destination, document
ids, form revision and a 24-hour expiry. The client sends back the hash it displayed, so a change
between viewing and clicking is refused. `checkApproval` is the single validity rule. The
repository invalidates the live approval in the same transaction as any transition that leaves
the approved path, so no code path has to remember to do it. A unique index allows one live
approval per application.

Submission (tickets 4 and 5) follows these rules:
- the worker claims the application with APPROVED to SUBMITTING (a guarded update, so two runs
  cannot both claim it);
- it refills the page, recomputes the hash and runs `checkApproval` again right before the click;
- any difference before the click goes back to review;
- a run that stops after the click, or an outcome without a reliable confirmation signal,
  becomes SUBMISSION_UNKNOWN, which only the user can resolve;
- nothing retries a submission automatically, and SUBMITTED is final.

## Consequences

- An approval can never outlive what it approved: a new preparation, new answers, a different CV
  version or a changed form produce a different hash or invalidate it outright.
- A 24-hour expiry means an approval left unused needs a fresh look, since postings change.
- The approval stores document ids and hashes, not values, so no extra personal data is copied.
- SUBMISSION_UNKNOWN puts work on the user (check the portal or the confirmation email) instead
  of risking a duplicate application.

## Tradeoffs

Option 1 is less code but cannot meet "valid for one exact payload". Option 3 could show what
changed, at the cost of a second copy of personal data. With option 2 the app can say that
something changed but not what, and the user reviews the new preview to see it.
