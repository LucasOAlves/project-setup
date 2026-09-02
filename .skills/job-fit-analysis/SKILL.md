# Job Fit Analysis

## Purpose

Decide, explainably, how well a specific job matches this professional's real, evidenced
background. A high score must be justifiable in plain language; a low score must name what's
actually missing. Generalized from `content-relevance-scoring` — same shape, different domain
(a job posting instead of a news article, a professional profile as the match target instead
of a persona's authority bands).

## When to Use

Before showing a fit score on a tracked job, before recommending "apply" or "skip", before any
resume-tailoring step that needs to know which requirements are already covered by evidence.

## Inputs

- the job's structured fields: technologies, seniority, requirements, preferred qualifications
- the professional profile: technologies, top skills, years of experience, experiences
  (including their own `technologies`), `architectureExperience`, `leadershipExperience`

## Procedure

1. Score each dimension deterministically first. A fit score is a comparison between two
   structured records, not an interpretation task — see `.skills/ai-vs-deterministic`.
2. Technical: overlap between the job's required technologies and everything the profile
   evidences (profile technologies, top skills, and each experience's own technologies).
   No overlap possible (job lists no technologies) scores neutral-full (100), not zero —
   absence of a requirement is not a failed requirement.
3. Seniority: map both sides to a coarse band from short structured text/numbers (job's
   seniority label, profile's years of experience), then score by band distance. Missing data
   on either side scores neutral (70), never zero — an unscored dimension must not silently
   tank the overall score.
4. Evidence dimensions (architecture, leadership, ...): only "required" if the job's own text
   actually asks for it (keyword presence). If required, score high only when the profile has
   real evidence (a dedicated experience field, or the same keywords inside actual experience
   text) — never infer evidence from the job's requirements alone.
5. Combine with fixed, documented weights into one overall score. Do not let one dimension
   silently dominate; do not tune weights per job to reach a "nicer" number.
6. Turn the overall score into a small number of recommendation tiers (e.g. STRONG_APPLY /
   APPLY / STRETCH / WEAK_FIT), not a bare percentage with no interpretation.
7. Always return the dimension breakdown plus concrete strengths (what actually matched) and
   gaps (what didn't) — never just the final number.

## Quality Criteria

- Every score element traces to a specific field comparison the user could re-derive by hand.
- Gaps name specific missing technologies/evidence, not a vague "could be a stronger fit."
- No dimension can be dragged to zero by missing data alone — only by a real, evidenced
  mismatch.
- The function computing this is pure (job + profile in, result out) — no DB, no network,
  trivially unit-testable.

## Common Failure Modes

- Scoring a dimension to 0 just because the job or profile is missing that field
- Letting an AI call interpret the match instead of comparing the structured data directly
- Hardcoding weights that overfit one example job instead of a general, documented formula
- Returning only the overall number, forcing the user to trust a black box

## Output

An overall score, a per-dimension breakdown, a strengths list, a gaps list, and a
recommendation tier.

## Learnings

Slice 2 (Career module): no semantic/AI layer was added yet — every dimension is comparable
with plain string/number rules because Job's structured fields (technologies, seniority) are
already typed input, not prose that needs interpretation the way a news article's relevance
does. `content-relevance-scoring`'s hybrid step (deterministic filter, then semantic keep/reject
on survivors) is deferred until real usage shows plain substring matching misses too much
(synonyms like "k8s"/"Kubernetes", or judgment calls a keyword list can't make) — see
`docs/decisions/ADR-011-career-domain-boundaries.md`'s "Deferred" section for the standing
rule against building that ahead of a demonstrated need.

Weights (`0.45` technical, `0.20` seniority, `0.20` architecture, `0.15` leadership) mirror
`relevance.ts`'s own precedent of small, fixed, documented weights rather than a config surface.
