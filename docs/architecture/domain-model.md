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
"Deferred" section. `source`/`externalId` exist now so a future `JobProvider` adapter
(Greenhouse, Lever, LinkedIn) can populate `Job` rows without a schema change, even though
Slice 1's only source is a person typing the data in (`source: "manual"`).

`fitScore` is a nullable column reserved for the Job Fit engine (a later slice); nothing
computes it yet.

## Ephemeral

- token streams
- model chain-of-thought
- discarded candidates that never reached the UI
- raw provider error bodies
