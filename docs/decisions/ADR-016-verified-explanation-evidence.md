# ADR-016 — Job explanations keep only evidence the code can find in the source

## Status

Accepted

## Context

The Job Hunter spec (A05, JOB-012) asks for a structured explanation of each shortlisted job:
why it fits, which requirements the candidate meets, what is missing, eligibility,
compensation, risks, CV emphasis and interview topics. It requires that confirmed facts be
kept apart from inferences and that every material job-specific conclusion reference the job
description or the verified profile. Unknown eligibility must never be presented as confirmed
(A03).

A model writes this explanation. Models cite convincingly whether or not the cited text
exists, and the job posting is untrusted input that can carry instructions. The repository
already grounds model output deterministically elsewhere: resume tailoring may only return
ids and skills that exist on the profile (`groundTailoringPlan`), post drafts are checked
against their sources (`ground-post.ts`).

## Options considered

1. Trust the model: validate the JSON shape with Zod and store what it returns.
2. Verify in code: the model must quote its evidence verbatim, and a pure function checks every
   quote against the exact job text and profile text that were sent, dropping or downgrading
   what it cannot find.
3. Ask a second model call to judge whether each claim is supported.

## Decision

Option 2, in `job-explanation-grounding.ts`, written test-first (ADR-014):

- A quote counts only if it appears in the source it names (`JOB` or `PROFILE`), ignoring case,
  whitespace, curly quotes and dash styles, and is at least 8 characters long.
- Material sections need evidence from a specific source: a matched requirement needs a profile
  quote, and a gap, geographic or compensation claim needs a job quote. A claim without one is
  dropped.
- In the other sections a `FACT` without a valid quote becomes an `INFERENCE`.
- When the eligibility rules returned `UNKNOWN`, no geographic claim stays a `FACT`.
- The stored explanation records how many claims were dropped or downgraded and how many quotes
  were removed, so the user can see how much of the model's output survived.

## Consequences

- Nothing shown as a fact rests on text the code could not find. A fabricated profile claim
  ("ran Kafka in production") is removed, not shown with a warning.
- Explanations cost one model call per shortlisted job, bounded by `EXPLANATION_MIN_SCORE`
  and `EXPLANATION_DAILY_LIMIT`. Token counts and the model name are stored on each
  `job_evaluations` row.
- The check proves that a quote exists, not that it supports its claim. A real but
  irrelevant quote passes, so a claim's relevance still rests on the model. Option 3 could be
  added on top later if that turns out to matter in practice.
- The executive summary, CV emphasis and interview topics are free text with no evidence
  slots. They are kept as written, presented as the model's summary.

## Tradeoffs

Option 1 is simpler, but it breaks the spec's evidence requirement exactly where it matters
most. Option 3 doubles the cost per job and replaces one model's judgment with another's.
Option 2 is cheap and deterministic, but it is strict about wording: a paraphrased quote is
discarded even when the claim is true, which can leave an explanation thinner than the
model wrote it.

## Update (Milestone 5)

The same quote check now backs recruiter message classification (`message-classification.ts`,
prompt `recruiter-message.v1`). A class other than UNCLEAR stands only on a quote found in the
masked subject and body the model saw, using the same `quoteAppearsIn` matching. Here a missing
quote does not downgrade the answer to an inference: it makes the message UNCLEAR, because a
class is what a status suggestion is built on (spec A10). Rejections and plain confirmations
from ATS templates are classified by rules first, without a model call.
