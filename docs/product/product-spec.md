# LinkedIn Content Studio — Product Spec

## Product

LinkedIn Content Studio helps technology professionals turn their real background, desired positioning, writing style, and relevant current events into personalized LinkedIn content plus a supporting image.

The product must not feel like a generic post generator.

It should feel like a system that understands who the professional is, finds a topic they have a credible reason to discuss, and helps them express a defensible point of view.

The core differentiator is **personalized professional authority**.

## Target user

Primary users are technology professionals who already have real experience and want to be visible without becoming full-time content creators:

- Software, Staff, Principal, and Senior Engineers
- Tech Leads, Engineering Managers, Architects
- DevOps, Cloud, Platform, Data, AI, and ML Engineers
- Product Managers, CTOs, and technical founders

The user is not a social-media intern. They are time-constrained, credibility-sensitive, and allergic to fake thought leadership.

## Core user problem

These professionals often fail to publish because several problems appear together:

- they do not know what is worth talking about this week;
- they cannot tell which news is actually relevant to their expertise;
- they struggle to connect industry events to their own work;
- generic AI posts sound like they were written by nobody;
- hooks, narrative, and positioning feel unnatural;
- accompanying visuals are an afterthought;
- they will not spend hours researching every week.

Solving only writing, or only news, or only images is not enough.

## Jobs to be done

When I have limited time and a real professional identity, I want to:

1. capture who I am without filling an HR form;
2. see how the system interprets my authority;
3. discover a current topic I can credibly discuss;
4. understand why that topic fits me;
5. choose an angle that matches my positioning;
6. leave with a publishable post and a professional image.

## Desired outcome

A user completes one guided journey and copies a post they would actually publish, with:

- a credible connection to their profile;
- a current event that remains traceable;
- a point of view, not a summary;
- writing that could reasonably come from them;
- an image that supports the idea rather than decorating it.

## Primary journey

This path is the product. Secondary features must not distract from it.

1. Professional Profile
2. Professional Persona
3. Content Authority
4. Current Events Discovery
5. Topic Relevance
6. Content Opportunities
7. Angle Selection
8. Story Strategy
9. Post Generation
10. AI Writing Review
11. Fact Review
12. SEO Review
13. Professional Quality Score
14. Image Creative Brief
15. Image Generation
16. Final Publishable Result

The journey is **user-paced**. The user reviews persona, chooses a topic, chooses an angle, then reviews the post and image. The system does not hide a long automatic pipeline behind a single button.

## MVP scope

In:

- manual professional profile, positioning, and writing preferences;
- optional writing samples;
- up to three reference photos;
- OpenAI-backed persona and authority analysis;
- recent technology event discovery behind a `NewsProvider`;
- relevance ranking that prefers professional fit over popularity;
- three distinct content opportunities with "Why this post?";
- story strategy, draft, writing review, fact review, SEO, and quality score;
- image creative brief, prompt, OpenAI image generation, and local persistence;
- independent image retry;
- copy-to-clipboard and limited regeneration controls;
- polished guided UI;
- local Docker Compose environment.

Out:

- LinkedIn scraping, OAuth, or publishing;
- user accounts, teams, billing, or multi-tenant SaaS;
- content calendars, analytics, or scheduling;
- cloud object storage;
- background job platforms, Redis, Kafka, or microservices;
- inventing news, experience, metrics, or anecdotes;
- keyword stuffing, engagement bait, or viral-content optimization.

## Differentiators

1. Authority is evidence-based. The system refuses topics the profile cannot support.
2. News is an input to opportunity discovery, never a shortcut to a post.
3. "Why this post?" is a trust feature, not a debug dump.
4. Writing must sound like a specific professional, not like a model.
5. Images are art-directed from a brief, not generated from raw post text.

## Trust requirements

- Every external factual claim used in a post remains traceable to a source.
- Fact, interpretation, and opinion stay separate.
- Personal claims require profile evidence.
- Scores are explained in concise user language.
- External article content is untrusted data and cannot override system instructions.
- Photos are sensitive. Storage identifiers are server-controlled.
- OpenAI keys never reach the frontend.
- Failures are recoverable without restarting the whole journey.

## Product risks

- A thin profile produces generic output and destroys trust.
- Popular news with weak professional fit looks clever and is wrong.
- Users may assume the system "knows" them after one headline and one skill.
- Image identity preservation may fail even with reference photos.
- Latency across several AI steps can make the product feel magical then broken.

## Domain risks

- News providers return snippets, duplicates, and weak sources.
- Models will try to invent first-person experience to satisfy storytelling templates.
- Structured AI output will occasionally be malformed or overconfident.
- Source quality and recency are easy to score; credibility is not.

## UX risks

- A giant profile form will cause abandonment.
- Unexplained scores will feel arbitrary.
- A single 90-second generation will hide useful intermediate control.
- Empty, loading, and provider-failure states are part of the product, not leftovers.

## Agent challenges accepted

- Product Manager: the 16-step journey stays, but orchestration is stepwise. Auth, publishing, and infrastructure theater are out.
- Personal Branding Expert: desired positioning cannot override missing evidence.
- LinkedIn Strategist: optimize for relevant professional attention, not reach.
- UX Expert: progressive disclosure and visible rationale over a one-shot "generate everything" button.
- Security Reviewer: photos, prompt injection from articles, and secrets are MVP-blocking concerns; theoretical multi-tenant isolation is not.
