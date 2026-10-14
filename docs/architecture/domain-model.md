# Domain Model

This is conceptual. Tables are created per vertical slice, not from this list blindly.

## Profile

Durable aggregate root for the MVP.

Owns identity fields, skills, technologies, industries, interests, avoid list, target audience, language, positioning, writing preferences, experiences, optional writing samples, and photo references.

Not every field is required. A usable profile needs enough evidence to ground authority: typically a headline or about section plus at least one experience or a meaningful skill/technology set. The product should warn when evidence is thin rather than blocking every incomplete form.

`version` (integer, starts at 1) is bumped on every profile save. Job Hunter evaluations and
generated documents record the version they were computed from, so a result can always be
traced to the exact facts it used (spec JOB-010).

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
adapter could populate `Job` rows without a schema change — that's now real: each `JobProvider`
board adapter (`GreenhouseJobProvider`, `LeverJobProvider`, `AshbyJobProvider`,
`WorkableJobProvider`, `SmartRecruitersJobProvider`) sets `source` to
its own vendor name and `externalId` to that vendor's own job id, and each `JobSearchProvider`
adapter (`RemoteOkJobSearchProvider`, `ArbeitnowJobSearchProvider`, `AdzunaJobSearchProvider`,
`RemotiveJobSearchProvider`, `HimalayasJobSearchProvider`)
does the same for search results. `CareerRepository.getJobByExternalId()` makes re-importing
the same board — or re-adding the same search result — idempotent (already-tracked postings are
skipped, never duplicated or overwritten). Manually-added jobs keep `source: "manual"`. See
ADR-011's second update note for why board import and keyword search are two separate ports.

`fitScore` (the overall Job Fit score, 0-100) is computed deterministically by
`computeJobFit()` (`apps/api/src/modules/career/job-fit.ts`) against the saved `Profile` and
persisted on demand ("Score fit" / "Rescore fit" in the UI) — see
[`.skills/job-fit-analysis`](../../.skills/job-fit-analysis/SKILL.md) for the per-dimension
rules (technical, seniority, architecture, leadership) and why no AI call is involved. Only
the overall number is persisted; the full breakdown (strengths, gaps, per-dimension scores)
is cheap to recompute and is not stored as its own row.

Provenance (Job Hunter, migration 0016): imported jobs also store `rawDescription` (the text
exactly as the source returned it, kept apart from the user-editable `description`),
`canonicalUrl` and `contentHash` (from `job-provenance.ts`: tracking params, fragment and
trailing slash removed; sha256 of normalized title + company + description), and
`sourcePostedAt` when a source reports it.

Cross-source dedupe (JOB-006): before creating an imported job, `CareerService` asks
`CareerRepository.findJobByProvenance()` for a job with the same canonical URL or, when the
description has 50+ characters of real text, the same content hash. A match is skipped (board
import) or returned instead of a new row (search import). `source` + `externalId` still makes
re-importing from the same source idempotent. Board import hashes with the tracked company's
name, so a board posting and an aggregator copy under a differently spelled company name only
dedupe through the canonical URL.

`normalizedData` (migration 0018) holds what `job-normalization.ts` derives at import:
salary in USD per month (`usdMonthlyMin`/`usdMonthlyMax`, `approximate` when converted from
another currency with the static rates in that file, `null` when undisclosed), region tokens
from the location text (`WORLDWIDE`, `LATAM`, `BRAZIL`, `USA`, ...), and employment type. The
original salary range and currency also go into `salaryMin`/`salaryMax`/`salaryCurrency`.
Rows imported before 0018 keep `{}`.

## Source (Job Hunter)

One row per job-source adapter (`greenhouse`, `lever`, `ashby`, `remoteok`, `arbeitnow`,
`adzuna` seeded by migration 0016, `remotive` and `himalayas` by 0017 with their reviewed terms
in `notes`, `workable` and `smartrecruiters` by 0020, `brave` by 0022 and `weworkremotely` by 0023). `SourceRegistry` reads it: `CareerService` calls `assertDiscoveryAllowed()` before
every board import or search, and `PATCH /api/career/sources/:id` toggles `enabled`. The per-source permission registry from the spec:
`discoveryAllowed` gates scheduled discovery, `applicationMode` (`MANUAL` / `ASSISTED` /
`AUTOMATED`) caps how far application automation may go, `termsUrl` records what was
reviewed. Every source starts `MANUAL`.

## JobEvaluation (Job Hunter)

Insert-only: one row per evaluation of a `Job` against a `Profile.version`. Holds eligibility
(`ELIGIBLE` / `EXCLUDED` / `UNKNOWN` plus the quoted reasons), the score, its breakdown and
confidence, the structured explanation and its evidence, and the model/prompt version and
token counts behind it. Re-evaluating adds a row.

Today `POST /api/career/jobs/:id/evaluate` writes the eligibility part: `job-eligibility.ts`
(JOB-007) reads the job's title, location and `rawDescription` and returns `EXCLUDED` (US
residency or citizenship, work authorization in a country the candidate lacks, location limited
to regions outside LATAM/Americas/Brazil/worldwide, on-site or hybrid abroad, a requirement to
live in a US time zone), `ELIGIBLE` (an accepted region in the location, or wording like "from
anywhere in the world"), or `UNKNOWN`. Each reason quotes the exact text that decided it; an
exclusion always wins over a confirmation, and `UNKNOWN` is never shown as eligible. Asking for
overlap with US hours does not exclude, since a Brazil-based candidate can work them. A third
kind of reason, `SUPPORTS`, records hiring through an EOR (Deel, Remote.com, "employer of
record") or as an independent contractor: it never changes the status, and on an `UNKNOWN` job
it raises the geography score from 50 to 65 while the dimension stays unknown. `modelVersion`
is `eligibility-rules@2` (`@1` before the time-zone and EOR rules).

Jobs the rules did not exclude are then scored by matching v2 (`job-matching.ts`, JOB-011),
when a profile is saved: six weighted dimensions from the spec (technical stack 30%, seniority
and responsibilities 20%, experience and achievements 20%, geographic and contract fit 15%,
compensation 10%, other preferences 5%), each 0-100 with notes and a `known` flag. The stack
is read from the posting text against a fixed technology vocabulary, because discovered jobs
carry no structured technology list. `confidence` is the share of weight the posting gave
enough to score, so an undisclosed salary is an uncertainty (`COMPENSATION_UNDISCLOSED`, score
50, confidence 90) rather than an exclusion. `score`, `confidence` and the breakdown
(`scoreBreakdown`: dimensions, matched and missing skills, flags) are stored on the row and
`modelVersion` becomes `eligibility-rules@2+matching@2`. Excluded jobs keep a null score. The
compensation target is `MATCH_TARGET_USD_MONTHLY` (default 6000). This is separate from the
user-triggered Job Fit score on `Job.fitScore`, which reads fields typed on a tracked job.
Jobs scoring at least `EXPLANATION_MIN_SCORE` (default 60) are shortlisted and explained by
the configured text provider (`job-explanation.ts`, JOB-012/013), at most
`EXPLANATION_DAILY_LIMIT` per UTC day. The explanation follows spec A05 (summary, why
shortlisted, matched requirements, gaps, geographic eligibility, compensation, technical
relevance, risks, CV emphasis, interview topics, recommended action, confidence). Each claim
is a `FACT` or an `INFERENCE` with quoted evidence, and `job-explanation-grounding.ts` keeps
only quotes found in the job text or the profile text that were sent (ADR-016). The row stores
the grounded explanation, the surviving quotes in `evidence`, `promptVersion`
(`job-explanation.v1`), the model name appended to `modelVersion`, and the token counts.
Only professional evidence from the profile is sent: no name, contact details or employer
names. If the model call fails, the score is still stored without an explanation.

## JobFeedback (Job Hunter)

The user's relevance verdict on one `JobEvaluation` (JOB-014): `RELEVANT` or `NOT_RELEVANT`,
reasons from a fixed list (great match, wrong stack, wrong seniority, pay too low, location,
role type, company, other) and an optional note. Insert-only: the newest row for a job is the
current verdict, and a verdict on an older evaluation no longer shows once the job is
re-evaluated. `GET /api/career/feedback/summary` (`job-feedback.ts`) compares the verdicts
with the match score: how often they agree at the shortlist threshold, the average of each
dimension for relevant and not-relevant jobs, and the most given reasons. It informs a change
to the match weights and never changes them by itself.

## CompanyWatch (Job Hunter)

One row per watched `Company` (`company_watches`, migration 0021): the ATS board to read
(`source` and `boardToken`, any of the five board adapters) and what the last poll found:
`lastPolledAt`, `lastStatus` (`NEVER` / `OK` / `FAILED` with `lastError`), open roles, roles
posted in the last 30 days and roles new to the tracker. The worker polls it daily and never
more than once an hour (`company-watch.ts`). Five or more roles posted in 30 days shows as
"Hiring fast". Deleting the company deletes its watch. Watching again with another board resets
the poll history.

## TalentPlatformProfile (Job Hunter)

One row per talent platform the user has touched (`talent_platform_profiles`, migration 0024),
keyed by the site id from the static catalog `JOB_SITES` (`packages/shared/src/job-sites.ts`):
`status` (`NOT_STARTED` / `APPLIED` / `IN_REVIEW` / `APPROVED` / `REJECTED` / `NOT_INTERESTED`),
a free-text `note` and `updatedAt`. Only sites of kind `TALENT_PLATFORM` accept one. The
catalog itself is code, not data: adding a site is a change to that file.

## AuditEvent (Job Hunter)

Insert-only trail of who (`USER` / `SYSTEM` / `WORKER`) did what to which entity, with a
correlation id across a pipeline run. Payloads never carry credentials or raw personal data.
Written through `AuditRepository.record()` (payload redacted on the way in); today the worker writes `WORKER_JOB_COMPLETED` / `WORKER_JOB_FAILED` for pipeline queues.

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
