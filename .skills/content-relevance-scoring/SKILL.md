# Content Relevance Scoring

## Purpose

Decide whether a current event is a legitimate content opportunity for a specific professional. Popularity is not relevance.

## When to Use

Before proposing a topic, ranking news, or generating content opportunities.

## Inputs

- professional profile and persona, including evidence and topic bands
- candidate `NewsArticle` records with source, date, and URL
- target audience and desired positioning

## Procedure

1. Drop articles with missing URL, missing date, or untrusted empty source.
2. Score recency deterministically. Prefer recent official or engineering-primary sources over aggregators.
3. Score keyword/expertise overlap deterministically against skills, technologies, role, and pillars.
4. Discard candidates with no overlap and no adjacent-expertise path.
5. Ask semantically only on survivors: why should THIS professional discuss THIS topic?
6. Require evidence from the profile. A single casual mention is not authority.
7. Reject when the post would only summarize the article, invent experience, or pretend expertise.
8. Prefer a small well-aligned story over a famous unrelated one.
9. Expose user-facing rationale (match, evidence, audience, angle). Never expose chain-of-thought.

## Quality Criteria

- Every recommended topic has a specific professional connection.
- Risky authority topics are absent.
- The user can understand the recommendation without internal scores jargon.
- Deterministic filters run before the model.

## Common Failure Modes

- Ranking by trend size
- Treating one keyword hit as expertise
- Letting the model keep a weak topic to "have three results"
- Showing raw weights instead of why it fits

## Output

A ranked list of kept articles plus rejection reasons for dropped ones, and a concise Why This Post payload for each kept item.

## Learnings

Discovery: hybrid scoring is mandatory. Recency and source quality are software. Credibility alignment is semantic. A high model score cannot override a failed evidence check.

Slice 3: persona-derived queries plus URL/date/overlap filters are enough to build a candidate list. Do not ask a model to invent news when the provider returns nothing.

Slice 4: combined score is 0.4 overlap + 0.35 recency + 0.25 source quality, then semantic keep/reject. Never keep a third opportunity by relaxing evidence.
