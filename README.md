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

Slice 1 is available: progressive professional profile, experiences, positioning, writing preferences, and up to three reference photos. On the Identity step, upload a resume PDF to pre-fill these forms (nothing is saved until you review and click Save and continue); on the Experience step, download a résumé PDF generated from the current saved profile, any time new information is added.

Slice 2 is available: generate a structured professional persona and authority map from the saved profile. Set `OPENAI_API_KEY` in `.env` before generating.

Slice 3 is available: discover recent technology events from the persona. Set `NEWS_API_KEY` in `.env` before discovering.

Slice 4 is available: generate up to three content opportunities with Why this post? and select an angle.

Slice 5 is available: write a post from the selected angle, with story strategy, reviews, score, copy, and limited regeneration.

Content plan is available: after generating a persona, the "Content plan" step lists a pre-approved editorial calendar. A small example set ships in `apps/api/src/modules/content-plan/plan-data.ts`; upload your own plan as a PDF from the Content plan step to replace it (preview, then "Use this plan" — nothing is saved until you confirm), or edit `plan-data.ts` directly. Picking a topic writes a post grounded in that topic's brief instead of a discovered news article; the ad-hoc Topics/Angles path still works as before.

Career tracker is available: the "Career" step lets you track companies and jobs you're
actually pursuing — add a company, add a job against it, move it through a status funnel
(Saved → ... → Offer/Rejected/Withdrawn), and keep notes and a next action per job. This is
local tracking only; nothing talks to LinkedIn, a job board, or any external API yet — see
[ADR-011](docs/decisions/ADR-011-career-domain-boundaries.md) for the domain boundaries and
[ADR-012](docs/decisions/ADR-012-external-action-approval.md) for the human-approval policy
that will govern any future capability that writes to an external system.

Job Fit scoring is available on each tracked job: "Score fit" compares the job's technologies
and seniority against your saved profile and produces an explainable, deterministic
score — overall plus a technical/seniority/architecture/leadership breakdown, concrete
strengths, and concrete gaps. No AI call is involved; see
[`.skills/job-fit-analysis`](.skills/job-fit-analysis/SKILL.md) for the scoring rules.

Résumé tailoring is available on each tracked job: "Tailor résumé" asks the model which of
your *existing* experiences and skills to lead with for that specific job, then "Download
tailored résumé" renders a PDF from that ordering. The model never writes new resume prose —
it only re-ranks real profile content, and anything it invents or omits is corrected
deterministically before export (see `apps/api/src/modules/career/resume-tailoring.ts`).

Recruiters & contacts is a lightweight career CRM: add a contact under a company, optionally
tie them to a tracked job, and track connection status (Not connected/Requested/Connected).
"Score relevance" is a deterministic score (company match, role, job link — see
`recruiter-scoring.ts`); "Prepare outreach" drafts a short connection note and message
grounded only in real profile facts. Both outreach fields are always a draft you copy and
send yourself — this app never sends a message, a connection request, or anything else on
your behalf (see [ADR-012](docs/decisions/ADR-012-external-action-approval.md)).

Greenhouse import is available on each tracked company: enter that company's Greenhouse board
token (the slug in `boards.greenhouse.io/<token>`) and "Import from Greenhouse" pulls every
open posting from that board's real, public, unauthenticated Job Board API — no OAuth, no
LinkedIn. Re-running an import only adds postings not already tracked (matched by source +
external id); nothing is re-created or overwritten. See
[ADR-011](docs/decisions/ADR-011-career-domain-boundaries.md)'s update note for why Greenhouse,
not LinkedIn, is this project's first real job provider.

Career Analytics is the "Overview" panel at the top of the Career step: jobs tracked,
applications, interviews reached, offers, application→interview rate, rejection rate,
average fit score, companies targeted, recruiter contacts, most requested technologies, and
most common fit gaps — all computed deterministically from what's actually tracked, refreshed
after every action that could change them. Interview/offer counts use a full status-history
log (`job_status_events`), not just each job's current status, so a job that reached
interview and was later marked rejected still counts as having reached interview.

Without Docker:

```bash
npm install
docker compose up postgres -d
npm run dev
```

The API expects `DATABASE_URL` from `.env.example`.
