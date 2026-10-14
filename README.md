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

To require sign-in, run `npm run hash-password -w @studio/api`, type a password of at least 12 characters, and paste the two lines it prints (`APP_PASSWORD_HASH`, `SESSION_SECRET`) into `.env`. The app then asks for that password, keeps you signed in for `SESSION_TTL_HOURS` (default 7 days) with an httpOnly cookie, and refuses state-changing requests from other sites. Without a password the app stays open as before, but approving and submitting job applications are refused, because only the signed-in user may approve one (see [ADR-021](docs/decisions/ADR-021-single-user-sign-in.md)).

Compose also starts Redis and a background `worker` (BullMQ, see [ADR-015](docs/decisions/ADR-015-job-hunter-worker-process.md)). It runs Job Hunter's daily discovery: every day at `DISCOVERY_CRON` (default 09:00 `America/Sao_Paulo`) it searches each source in `DISCOVERY_SOURCES` for each of `DISCOVERY_KEYWORDS` (by default including "forward deployed engineer" and "ai engineer"), spacing requests per source's rate limits, imports new postings (re-runs never duplicate a job), runs the eligibility rules on each new one and queues the non-excluded ones for evaluation. With `BRAVE_SEARCH_API_KEY` set, the same run also searches the web through the Brave Search API: one `site:` search per ATS domain (Ashby, both Greenhouse domains, Lever, Workable, SmartRecruiters) for `WEB_SEARCH_TITLES` with LATAM terms, past week only, and imports the postings it points at from each company's own ATS API (see [ADR-017](docs/decisions/ADR-017-web-search-discovery-via-ats-apis.md)). `POST /api/career/discovery/run` queues today's run on demand, once per source per day. To run the worker on the host instead: `npm run worker -w @studio/api` with `REDIS_URL` pointing at a local Redis.

Compose also starts a `browser-worker` (Playwright's image, Chromium inside) that prepares job applications for Greenhouse, Lever and Ashby postings without submitting them. It has no model keys, only opens the job's own application site, and every request that could submit the form is blocked (see [ADR-020](docs/decisions/ADR-020-isolated-browser-worker.md)). To run it on the host: `npm run browser-worker -w @studio/api`, with `BROWSER_EXECUTABLE_PATH` pointing at a Chromium if Playwright's is not installed. Set `BROWSER_MOCK_PORTALS=true` to try the flow locally against mock Greenhouse, Lever and Ashby pages (`apps/api/src/modules/browser/mock-portals.ts`) with no network. Jobs whose link is one of the `MOCK_POSTINGS` URLs then prepare end to end.

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

Tailored CV v2 (Job Hunter, `POST /api/career/jobs/:id/documents/cv`) goes further and saves
the result as a versioned document: the model picks which of each experience's own sentences
to show and writes up to three summary sentences, and code keeps only what the profile
supports (`tailored-cv.ts`). Highlights are reused word for word; a summary sentence must quote
the profile and may not add a number or technology the profile lacks; every experience, skill
and technology stays. Technologies the job asks for that the profile lacks are listed as gaps,
never added. Name, contact details and employer names are not sent to the model: the CV header
comes from Application details and is added after the model answers.

A cover letter is optional and generated only on request
(`POST /api/career/jobs/:id/documents/cover-letter`). Every sentence must quote the profile or
the posting; a claim about you needs a profile quote, and a sentence that adds a number or a
technology its sources lack is removed (`cover-letter.ts`). The greeting, sign-off and header
are added by code. Your edits are saved as a new version with
`POST /api/career/jobs/:id/documents/cover-letter/edits`.

Application answers (`POST /api/career/jobs/:id/documents/answers`) cover the questions forms
usually ask: work authorization, visa sponsorship, notice period, salary expectation, location,
time zone, English level, years of experience, profile links and years with up to three of the
job's technologies (counted from the dated experiences that list them). They come only from
what you entered in Application details and your profile (`application-answers.ts`); anything
those do not answer is left blank as "needs your input", never guessed. "Why do you want to work
here?" is drafted by the model under the cover letter's evidence rules. Edits are saved as a new
version with `POST /api/career/jobs/:id/documents/answers/edits`.

In the app, each Job feed card has a **Materials** button. It generates the CV, the cover
letter and the answers, shows the gaps and missing details, lets you edit the letter and the
answers, downloads the PDFs, and lists every earlier version.

Next to it, **Application** prepares the application itself, without submitting it
(Milestone 3). For a Greenhouse, Lever or Ashby posting, the browser worker opens the form in a
private browser, reads every field and fills what your stated data answers:
- contact details and links from Application details;
- your name and current employer from the profile;
- prepared answers, and years with a technology counted from dated experiences;
- the CV PDF from Materials.

It then reads each value back from the page and shows a preview: every field with where its
value came from, and a screenshot with your typed details masked. Required questions nothing
answers (work authorization yes/no, a select whose options do not match) come back as
"Questions only you can answer". Answers you give are saved and reused when another form asks
the same question. Consent boxes are only ticked if you agree for that application, and
voluntary self-identification is never filled.

A login, CAPTCHA or bot check stops the run as blocked. Nothing works around it. Any other
portal, or a blocked one, shows the manual path instead: the posting link, the CV and the
prepared answers to copy.

When the review looks right, **Approve this application** records your approval of exactly
that form: the same values, files and destination, identified by its payload hash
([ADR-022](docs/decisions/ADR-022-payload-bound-approval.md)). Approving needs sign-in. The
approval lasts 24 hours. Preparing again, new answers, rejecting or **Withdraw approval**
cancel it. Submitting an approved application is the next part of Milestone 4. Until then
nothing is sent.

Automatic submission stays off unless two settings agree: `APPLICATION_SUBMISSION_ENABLED=true`
for the deployment, and the portal set to `AUTOMATED` in source settings
(`PATCH /api/career/sources/greenhouse` with `{"applicationMode":"AUTOMATED"}`, likewise for
`lever` and `ashby`). Greenhouse, Lever and Ashby start as `ASSISTED`: the app prepares, you
submit. Check each portal's terms before turning it on. The application panel says which
applies.

Recruiters & contacts is a lightweight career CRM: add a contact under a company, optionally
tie them to a tracked job, and track connection status (Not connected/Requested/Connected).
"Score relevance" is a deterministic score (company match, role, job link — see
`recruiter-scoring.ts`); "Prepare outreach" drafts a short connection note and message
grounded only in real profile facts. Both outreach fields are always a draft you copy and
send yourself — this app never sends a message, a connection request, or anything else on
your behalf (see [ADR-012](docs/decisions/ADR-012-external-action-approval.md)).

Job board import is available on each tracked company: pick a board source (Greenhouse, Lever,
Ashby, Workable or SmartRecruiters), enter that company's board token (the slug in `job-boards.greenhouse.io/<token>` or
the older `boards.greenhouse.io/<token>`, `jobs.lever.co/<token>`, `jobs.ashbyhq.com/<token>`, `apply.workable.com/<token>` or
`jobs.smartrecruiters.com/<token>`)
or paste a board or job URL and let the app work out the source and token, and "Import from…"
pulls every open posting from that board's real, public, unauthenticated Job Board API — no
OAuth, no LinkedIn. Ashby imports include the published pay range (`includeCompensation=true`).
"Watch daily" puts the company on the watchlist instead: the worker reads its board every day
at `DISCOVERY_CRON` (never more than once an hour per company, "Check now" included), imports
new postings, runs them through eligibility and scoring like discovered jobs, and shows the
open roles, how many were posted in the last 30 days and a "Hiring fast" badge at five or more.
Re-running an import only adds postings not already tracked (matched by source + external id);
nothing is re-created or overwritten. See
[ADR-011](docs/decisions/ADR-011-career-domain-boundaries.md)'s update notes for why Greenhouse,
not LinkedIn, is this project's first real job provider, and for the later board/search split.

Job search is available above the company list: pick a search source (RemoteOK, Arbeitnow,
Adzuna, Remotive, Himalayas or We Work Remotely — Adzuna needs a free `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` from
developer.adzuna.com; the others need no key), enter keywords and an optional location, and "Add to tracker" imports
one result — creating its company automatically (matched case-insensitively, or created new) if
it isn't tracked yet. Unlike board import, search spans many companies at once instead of one
company's own board. A collapsible "New to these sites?" guide next to the search panel explains
each source and how to find a company's board token.

Each source can be turned off without a code change: `GET /api/career/sources` lists the
per-source registry (whether discovery is allowed, how far application automation may go, the
terms that were reviewed), and `PATCH /api/career/sources/:id` with `{ "enabled": false }`
stops every search or board import against it. Search results show "via <source>" linking back
to the original posting, which the Remotive, Himalayas and We Work Remotely terms require.

The "Application details" step holds what application forms ask for beyond the profile:
contact details, education, certifications, spoken languages, work authorization, visa
sponsorship, notice period, time zone and salary expectation
(`GET`/`PUT /api/profile/application-details`). Contact details are never sent to an AI provider.

The "Job sites" step lists every site on the user's list grouped by how it takes part in the
search (`JOB_SITES` in `packages/shared/src/job-sites.ts`): read automatically by discovery,
talent platforms (with a per-platform status, note and last-updated date, saved through
`GET /api/career/job-sites/profiles` and `PUT /api/career/job-sites/:id/profile`), sites to
browse yourself (no feed, a login, or terms that do not allow reuse), freelance marketplaces
and sites that are not job sources. Only the first group is ever read automatically.

Eligibility rules (Job Hunter) run with `POST /api/career/jobs/:id/evaluate`: a job comes back
`ELIGIBLE`, `EXCLUDED` or `UNKNOWN` for a Brazil-based remote candidate, with the exact sentence
or location text behind each verdict. A requirement to live in a US time zone excludes; hiring
through an EOR such as Deel is shown as a supporting signal that never confirms eligibility on its
own. Jobs that are not excluded also get a 0-100 match score
over the spec's six weighted dimensions, a confidence (how much of the score the posting
actually supports) and flags such as undisclosed compensation (the title counts toward the
preferences dimension when it contains one of `MATCH_TARGET_ROLES`, by default seniority words
plus Forward Deployed and AI Engineer variants); the worker does the same for
every job discovery finds. Jobs scoring 60 or more are also explained by the configured text
provider (why they fit, matched requirements, gaps, eligibility, pay, risks, what to stress
in the CV), and every quote in the explanation is checked against the posting or your
profile before it is kept ([ADR-016](docs/decisions/ADR-016-verified-explanation-evidence.md)). `GET /api/career/jobs/:id/evaluation` returns the latest.

The **Job feed** step lists every discovered or tracked job ranked by match score, then
confidence, then the newest posting. It filters by eligibility (excluded jobs hidden by default), minimum score,
source, title or company, and posting age. Each card opens the eligibility quotes, the score
breakdown and the explanation, with every claim's quoted evidence. Jobs can be (re)evaluated
from the card, and "Run discovery now" queues today's discovery. API: `GET /api/career/feed`.
Cards also flag a posting with no date, one posted 30+ days ago, and a likely ghost job
(60+ days), and mark a published salary and a link to the company's own careers site. When
the same role arrives from an aggregator and from the company's ATS board, it is tracked
once, linked to the company's posting.
Mark a job relevant or not, with reasons. The feed then shows how often the match score agrees
with you and which reasons come up most. Once each side has enough verdicts, it also names the
dimension that best separates relevant from not-relevant jobs.

Content ideas from your job search close the Content↔Career loop, one direction of it: the
Career step surfaces which technologies your tracked jobs actually request, kept only when
your profile has real, matchable evidence for them — never a technology you can't prove.
"Draft this as a topic" hands the grounded hook straight into a pre-filled My Topics draft,
which you review and confirm exactly like any other custom topic. The reverse direction
(post engagement informing networking suggestions) is deliberately not built — this app has
no real engagement data to build it from; see
[ADR-013](docs/decisions/ADR-013-content-career-loop.md) for why faking that signal was
rejected rather than shipped.

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
