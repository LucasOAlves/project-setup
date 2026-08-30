# LinkedIn Content Studio

Professional LinkedIn content for technology specialists, grounded in their real experience and relevant current events.

This repository started with specialized agents under `.agents/` and no application. Product, domain, and architecture were defined before application scaffolding.

## Origin

This project is a personal fork of [alexseixasv/project-setup](https://github.com/alexseixasv/project-setup), originally created by Alex Seixas Venancio. The initial scaffolding, agent definitions under `.agents/`, and early planning docs are his work — the git history in this repository preserves his original commits as-is.

Everything built on top of that starting point (the application itself, the Content Plan / Custom Topics / Discover News pipeline, multi-provider AI support, the runtime provider selector, per-paragraph post comments, the architecture documentation, and everything else under `docs/decisions/` from ADR-006 onward) is my own work, developed independently as a personal exploration of the original idea. No license was specified in the upstream repository at the time of this fork; this repository does not claim one either — see the upstream project for terms if you plan to reuse it.

## Current status

Discovery and planning are in `docs/`. Implementation follows vertical slices in `docs/plans/mvp.md`.

## Knowledge

- Product: `docs/product/`
- Architecture: `docs/architecture/`
- Decisions: `docs/decisions/`
- Plans: `docs/plans/`
- Learnings: `docs/learnings/`
- Agents: `.agents/`
- Skills: `.skills/`

## Local run

```bash
cp .env.example .env
docker compose up --build
```

Then open `http://localhost:5173`.

Slice 1 is available: progressive professional profile, experiences, positioning, writing preferences, and up to three reference photos.

Slice 2 is available: generate a structured professional persona and authority map from the saved profile. Set `OPENAI_API_KEY` in `.env` before generating.

Slice 3 is available: discover recent technology events from the persona. Set `NEWS_API_KEY` in `.env` before discovering.

Slice 4 is available: generate up to three content opportunities with Why this post? and select an angle.

Slice 5 is available: write a post from the selected angle, with story strategy, reviews, score, copy, and limited regeneration.

Content plan is available: after generating a persona, the "Content plan" step lists a pre-approved editorial calendar defined in `apps/api/src/modules/content-plan/plan-data.ts` (a small example set is included — replace it with your own topics, same shape). Picking one writes a post grounded in that topic's brief instead of a discovered news article; the ad-hoc Topics/Angles path still works as before.

Without Docker:

```bash
npm install
docker compose up postgres -d
npm run dev
```

The API expects `DATABASE_URL` from `.env.example`.
