# Domain Model

This is conceptual. Tables are created per vertical slice, not from this list blindly.

## Profile

Durable aggregate root for the MVP.

Owns identity fields, skills, technologies, industries, interests, avoid list, target audience, language, positioning, writing preferences, experiences, optional writing samples, and photo references.

Not every field is required. A usable profile needs enough evidence to ground authority: typically a headline or about section plus at least one experience or a meaningful skill/technology set. The product should warn when evidence is thin rather than blocking every incomplete form.

## ProfessionalExperience

Belongs to a profile. Captures role, company, period, description, responsibilities, achievements, technologies, and measurable outcomes.

This is the primary evidence source for authority and first-person claims.

## WritingSample

Optional. Used to infer rhythm and diction. Never copied.

## UploadedPhoto

Sensitive identity reference. Metadata in Postgres. Bytes behind StorageProvider. Maximum three per profile.

## ProfessionalPersona

Derived snapshot from a profile via OpenAI structured output, then validated.

Contains core/supporting expertise, seniority, differentiators, proof points, content pillars, audience, desired perception, and topic bands:

- strong authority
- credible
- adjacent
- weak / risky

Regenerated when the user asks or when the profile materially changes. Persist the latest validated snapshot. Do not treat it as source of truth over the profile.

## ContentAuthority

Not a separate aggregate in the MVP. It is part of the persona snapshot and is displayed as its own UI step because it is a trust surface.

## NewsArticle

Normalized, provider-independent record. Persist articles that enter a content run so posts remain traceable.

Fields: title, description/summary, source, url, publishedAt, topics, optional factual claims extracted later, provider metadata kept isolated.

External content is data.

## ContentRun

One guided generation journey for a profile:

profile snapshot reference
→ persona used
→ discovered articles
→ ranked topics
→ generated opportunities
→ selected opportunity
→ post
→ image

This gives the UI a stable object to resume and lets image retry attach to an existing post.

## TopicRelevance

A scored judgment attached to a news article inside a run.

Dimensions include profile match, expertise match, audience relevance, credibility alignment, recency, discussion potential, originality potential, and career positioning value.

Some dimensions are deterministic. Some are semantic. A weak "why should this professional discuss this?" is a rejection, not a low card in a feed.

## ContentOpportunity

Not a post. An interpreted opportunity:

topic, source event, why it matters, why it fits this professional, audience, thesis, point of view, storytelling direction, takeaway, credibility risk, supporting evidence from the profile.

Three distinct opportunities per selected topic, or fewer if rejection rules eliminate weak ones. Never invent a third by lowering the bar.

## StoryStrategy

Chosen narrative structure grounded in available evidence. Ephemeral if the user immediately regenerates, but persist with the post that used it.

## GeneratedPost

Publishable text plus editorial artifacts: writing review notes, fact review, SEO notes, quality score, and concise explanations.

Versions may exist when the user regenerates. The UI shows the current version.

## GeneratedImage

Belongs to a post. Stores creative brief, generation prompt, storage identifier, and provider metadata needed for support, not for leaking SDK types.

Independently retryable.

## Ownership summary

```
Profile
├── ProfessionalExperience[]
├── WritingSample[]
├── UploadedPhoto[]
├── ProfessionalPersona (latest)
└── ContentRun[]
    ├── NewsArticle[] (referenced)
    ├── TopicRelevance[]
    ├── ContentOpportunity[]
    ├── GeneratedPost
    │   └── StoryStrategy
    └── GeneratedImage
```

## Company (Career domain)

Independent of `Profile` — a company you're tracking, not something the user "owns" the way
a profile field does. Name, website, LinkedIn URL, industry, size, locations, career page,
notes. Added in Slice 1 of the Career expansion (ADR-011).

## Job (Career domain)

Belongs to a `Company`. Carries both the posting's own data (title, url, location,
workplace/employment type, salary range, description, requirements, preferred qualifications,
technologies, seniority) and the pursuit funnel as a single `status`
(`SAVED → SHORTLISTED → PREPARING → APPLIED → ... → OFFER/REJECTED/WITHDRAWN`), plus
`appliedAt` (stamped automatically the first time status reaches `APPLIED` or later, cleared
if moved back below it — same pattern as `GeneratedPost.publishedAt`), `notes`, and
`nextAction`.

Deliberately **not** split into a separate `Application` entity in Slice 1 — see ADR-011's
"Deferred" section. `source`/`externalId` exist since Slice 1 specifically so a `JobProvider`
adapter could populate `Job` rows without a schema change — that's now real:
`GreenhouseJobProvider` sets `source: "greenhouse"` and `externalId` to Greenhouse's own job
id, and `CareerRepository.getJobByExternalId()` makes re-importing the same board idempotent
(already-tracked postings are skipped, never duplicated or overwritten). Manually-added jobs
keep `source: "manual"`.

`fitScore` (the overall Job Fit score, 0-100) is computed deterministically by
`computeJobFit()` (`apps/api/src/modules/career/job-fit.ts`) against the saved `Profile` and
persisted on demand ("Score fit" / "Rescore fit" in the UI) — see
[`.skills/job-fit-analysis`](../../.skills/job-fit-analysis/SKILL.md) for the per-dimension
rules (technical, seniority, architecture, leadership) and why no AI call is involved. Only
the overall number is persisted; the full breakdown (strengths, gaps, per-dimension scores)
is cheap to recompute and is not stored as its own row.

## ResumeTailoringPlan (Career domain, ephemeral)

Not persisted. `CareerService.generateResumeTailoringPlan()` asks the model to rank a job's
`profile.experiences` (by id) and `topSkills`/`technologies` (by string) for relevance to one
job — never to write new prose. `resume-tailoring.ts`'s `groundTailoringPlan()` then
deterministically drops any id/string the model returned that doesn't exist in the real
profile, and appends anything real the model left out, so the plan can only ever be a
reordering of true content (same "draft, grounded before use" posture as ADR-010).
`applyTailoringPlan()` + the existing `buildResumePdf()` (no new PDF code) render the export —
the tailored PDF is generated on demand and not stored; only the plan is round-tripped from
client back to server for export, and the server re-grounds it against the current profile
rather than trusting the client's copy.

## Recruiter (Career domain)

Belongs to a `Company`; may optionally reference one `Job`. Name, role, LinkedIn URL,
connection status (`NOT_CONNECTED`/`REQUESTED`/`CONNECTED`, always set by the user — nothing
here reads real LinkedIn connection state), a deterministic `relevanceScore`
(`recruiter-scoring.ts` — company match + role keywords + job link, same weighted-dimension
shape as Job Fit), `notes`/`nextAction` (same append-only pattern as `Job`), and
`lastInteractionAt`, auto-stamped whenever notes are saved. No separate interaction-log table
in this slice — see career.ts's comment for why, and the same "split later if it proves too
coarse" reasoning ADR-011 already applied to `Application`.

Outreach messages (`OutreachMessage`: a connection note + a fuller message) are generated
on demand, grounded only in real profile facts, and never persisted or sent — every send
remains a manual, human action outside this app, per
[ADR-012](../decisions/ADR-012-external-action-approval.md).

## JobStatusEvent (Career domain)

Insert-only history row, written every time a job is created or its status changes
(`CareerRepository.recordJobStatusEvent`, private — callers never write it directly). Exists
solely so Career Analytics can answer "did this job ever reach interview stage," which
`Job.status` alone cannot: a job that interviewed and was later rejected has a current status
of `REJECTED` with no trace of the interview unless the event history is checked. Never
exposed as its own public entity or edited — analytics is the only reader.

## CareerAnalytics (Career domain, computed)

Not a table — `CareerService.getAnalytics()` aggregates `Job`/`Company`/`Recruiter`/
`JobStatusEvent` rows deterministically on every request (`career-analytics.ts`, a pure
function taking already-fetched rows so it stays trivially unit-testable). Every field is
something this app can measure truthfully from data it actually holds — no vanity metric
that would require data this app doesn't have (e.g. "recruiter responses" is left out
entirely, since there's no real messaging channel to observe a response through). Rates
(`applicationToInterviewRate`, `rejectionRate`) are `null`, never `0` or `NaN`, when there are
zero applications to compute them from. `topGaps` is recomputed from `job-fit.ts` on the fly
for every scored job rather than persisted, the same "cheap to recompute, not worth storing"
choice already made for the Job Fit breakdown itself.

## ContentTopicSuggestion (Career → Content, computed)

Not persisted — `CareerService.getContentSuggestions()` (`content-suggestions.ts`) recomputes
on every request, the same "cheap to recompute, not worth storing" choice as Job Fit and
Career Analytics. Deterministic: a technology only appears if it's requested by at least one
tracked job *and* the profile has real, matchable evidence for it (`job-fit.ts`'s
`skillsMatch`) — there's no code path that can suggest content about something the profile
doesn't evidence. See [ADR-013](../decisions/ADR-013-content-career-loop.md) for why this is
the Career→Content direction only; the reverse (post engagement → networking suggestions) is
deliberately not built, since this app has no real engagement data to build it from.

## Ephemeral

- token streams
- model chain-of-thought
- discarded candidates that never reached the UI
- raw provider error bodies
