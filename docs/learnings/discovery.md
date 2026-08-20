# Discovery learnings

## What required substantial reasoning

- Whether the 16-step journey is one backend job or a user-paced workflow
- Where AI is necessary versus where it would only add variance
- How to discover news without fabricating it or scraping LinkedIn
- How to keep OpenAI as the MVP vendor without letting it own the domain

## Product

The differentiator is not generation quality in isolation. It is refusing to speak where the profile has no evidence, then explaining the recommendation.

Desired positioning is a filter, not a costume.

## Domain

Persona is a derived snapshot. Profile remains the evidence source. Content opportunities are not posts. News articles must be persisted for traceability.

## What failed as an assumption

- "We need auth to persist a profile."
- "Three opportunities must always be returned."
- "An OpenAI service object is an architecture."
- "Trending news is useful by default."

## Procedures that will repeat

- Provider isolation
- AI vs deterministic classification
- Relevance scoring with hard rejection
- Structured-output validation

## What does not deserve persistence

- A speculative Skill library for every agent
- ADRs for "use TypeScript" or "use Postgres" as already constrained by the prompt
- Packages for AI and database with a single consumer

## Classification

| Finding | Destination |
| --- | --- |
| Relevance procedure | Skill `content-relevance-scoring` |
| Vendor boundaries | Skill `provider-isolation` + ADR-002 |
| AI vs code | Skill `ai-vs-deterministic` |
| No auth | ADR-003 |
| NewsAPI adapter | ADR-004 |
| User-paced stages | ADR-005 |
| Modular monolith | ADR-001 |
| Thin-profile warning | Product spec / UX flow |
