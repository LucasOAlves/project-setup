# Job Hunter MVP Plan

Built as an extension of this repository's Career module on its existing stack
([ADR-015](../decisions/ADR-015-job-hunter-worker-process.md)). Full plan and gap analysis:
the "Job Hunter AI — MVP Implementation Plan" doc in the project.

## Milestone 1 — find and explain jobs

Done when spec acceptance criteria 1, 2, 3 and 12 pass. Test-first per ADR-014 where marked.

| # | Spec ticket | Scope | Depends on | Test-first |
| --- | --- | --- | --- | --- |
| 1 | JOB-001 | Redis and a BullMQ worker in Compose | — | no |
| 2 | JOB-002, JOB-010 | `sources`, job provenance, `job_evaluations`, `audit_events`, profile version | 1 | provenance helpers only |
| 3 | JOB-004 | Discovery/evaluation queues, backoff, idempotency, redacted structured logs | 1 | no |
| 4 | JOB-005 | Source registry with per-source policy; Remotive and Himalayas adapters | 2 | no |
| 5 | JOB-006 | Normalizer (USD/month, region, type, age); cross-source dedupe | 2, 4 | yes |
| 6 | JOB-007 | Eligibility rules: eligible / excluded / unknown, with quoted evidence | 5 | yes |
| 7 | JOB-009 | Daily discovery job, safe to re-run | 3, 6 | no |
| 8 | JOB-011 | Matching v2 with the spec's six weights and confidence | 6 | yes |
| 9 | JOB-012, JOB-013 | Explanation agent with Zod schema and evidence check, prompt version, cost | 2, 8 | yes (evidence check) |
| 10 | JOB-008 | Ranked feed with filters and explanation detail | 7, 9 | no |
| 11 | JOB-014 | Relevance feedback per evaluation | 10 | no |

## Milestone 1.5 — more sources and fixes from a job-hunting guide review

Added on 2026-10-14 before Milestone 2: more sources, search-engine discovery through the Brave
Search API (Google's Custom Search JSON API is closed to new customers), and gaps found by
comparing the pipeline with a job-hunting guide. Full analysis in the project doc
"Job Hunter: mais fontes, busca via Google e melhorias do guia".

| # | Scope | Test-first |
| --- | --- | --- |
| 1 | Ashby pay range (`includeCompensation=true`); recognize both Greenhouse board domains from a pasted URL | URL parser only |
| 2 | Eligibility: US-timezone-only exclusion, EOR/contractor positive signal | yes |
| 3 | Configurable discovery titles and match target roles, with FDE and AI Engineer added | no |
| 4 | Workable and SmartRecruiters board adapters | no |
| 5 | Target-company watchlist polled daily, at most once an hour per company | ATS detection only |
| 6 | Search-engine discovery via the Brave Search API (`site:` queries on ATS domains) | query building and result parsing |
| 7 | We Work Remotely, Working Nomads and Jobspresso feeds, after checking each one's terms | no |
| 8 | Catalog of every listed site by kind (automatic, talent platform, link-out, freelance) | no |
| 9 | Ghost-job and freshness signals; prefer the ATS record in dedupe | yes |

## Milestone 2 — tailored application materials

Approved and built on 2026-10-14. Done when spec acceptance criterion 4 passes:
generated documents contain only verified candidate facts. Builds on the existing résumé
tailoring (`resume-tailoring.ts`), which today only reorders profile content and stores nothing.
Nothing is submitted in this milestone.

| # | Spec ticket | Scope | Depends on | Test-first |
| --- | --- | --- | --- | --- |
| 1 | JOB-010 | Profile fields applications ask for: email, phone, city/country, links, education, certifications, spoken languages with level, work authorization, notice period, salary expectation. Kept out of every model prompt | — | no |
| 2 | JOB-015 | `documents` table (job, profile version, type, content, file hash, storage key), immutable versions, list and download | 1 | content hash only |
| 3 | JOB-015 | Tailored CV v2: pick and order experiences and bullets for one job, a short summary whose every sentence is backed by a profile quote, gaps listed instead of added; ATS-friendly PDF saved as a version | 2 | yes (summary grounding) |
| 4 | — | Optional cover letter: model draft, each sentence checked against the profile and the posting, unsupported sentences removed; editable before saving a version | 2, 3 | yes (sentence grounding) |
| 5 | JOB-016 | Answers to common application questions: fixed bank (authorization, notice, salary, English level, time zone, years with a technology, why this company); deterministic from profile fields where possible, grounded model text for open ones, missing data marked "needs your input" | 1, 2 | yes (answer mapper) |
| 6 | JOB-015, JOB-016 | "Materials" panel on each job: generate, review the gaps, edit, download, version history | 3, 4, 5 | no |

Defaults: materials in English only; the cover letter is generated only on request; the
question bank is fixed in code for now. A new ADR covers storing generated documents as
immutable versions tied to a profile version.

## Milestone 3 — prepare applications with Playwright

Proposed on 2026-10-14, awaiting approval. Done when spec acceptance criteria 5 and 11 pass:
the browser worker prepares a supported application without submitting it, and an
unsupported portal falls back to manual completion. Nothing is submitted in this milestone;
approval and submission are Milestone 4.

| # | Spec ticket | Scope | Depends on | Test-first |
| --- | --- | --- | --- | --- |
| 1 | JOB-020 (data only) | `applications` table and state machine (PREPARING, NEEDS_INFORMATION, READY_FOR_REVIEW, BLOCKED_BY_PLATFORM, FAILED, USER_REJECTED) with a full transition history; one application per job and source | — | yes (transition rules) |
| 2 | JOB-017 | Separate browser worker process and Compose service with Playwright Chromium: its own queue, one job at a time, timeouts, a throwaway browser context per run, no shell access. Navigation guard: only the job's ATS domain, never localhost, private networks or cloud metadata; downloads blocked | 1 | yes (host guard) |
| 3 | JOB-018 | Form reading for Greenhouse, Lever and Ashby application pages: label, type, required, options. Page text is treated as data, never as instructions. Local mock portals of each ATS for tests | 2 | no |
| 4 | JOB-018, JOB-019 | Field mapper: each form field to an Application details value, a prepared answer, or the CV and cover letter versions; required fields with no verified value become questions for you | 3 | yes (mapper) |
| 5 | JOB-018, JOB-019 | Fill and preview: fill the fields, attach the CV PDF, check what the page shows, take a screenshot with contact details masked, and compute a payload hash for Milestone 4's approval. No code path clicks submit, and the network guard blocks the submit request. Screenshots are kept for 30 days | 4 | yes (payload hash) |
| 6 | JOB-019, JOB-024 | "Prepare application" on each job: preview of every field, open questions you answer before preparing again, and a manual fallback for unsupported portals (copy-ready answers, the CV and the link) | 5 | no |

Defaults: conventional Playwright with one adapter per ATS, with Playwright MCP left for
later; only Greenhouse, Lever and Ashby are automated, and everything else uses the manual
fallback; the browser runs headless; a login, CAPTCHA or verification page stops the run as
BLOCKED_BY_PLATFORM and is never worked around. Two ADRs: Application as its own entity
(updating ADR-011), and the isolated browser worker.

Milestones 4 and 5 (approval and submission, monitoring) are broken down once Milestone 3 ships.
