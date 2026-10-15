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

Approved and built on 2026-10-14. Done when spec acceptance criteria 5 and 11 pass:
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

Verified in a real headless Chromium against mock portals that copy each ATS's form
structure (`mock-portals.ts`). The real portals were not reachable from the build
environment, so the first real run of each portal is the remaining check.

## Milestone 4 — approval and submission

Approved and built on 2026-10-14 (criteria 6 to 9 are covered by
`apps/api/src/modules/browser/submission-e2e.test.ts`). Done when spec acceptance criteria 6, 7, 8, 9 and 10
pass: nothing is submitted without your explicit approval of that exact payload, a change
after approval invalidates it, a repeated run never submits twice, and an unclear result
becomes SUBMISSION_UNKNOWN instead of a retry.

| # | Spec ticket | Scope | Depends on | Test-first |
| --- | --- | --- | --- | --- |
| 1 | JOB-003 (part) | Single-user sign-in: a password whose hash is set in the environment, an httpOnly SameSite=Strict session cookie, every `/api` route behind it, and an Origin check on requests that change state. Today the API has no sign-in at all (ADR-003), and the spec only lets the signed-in user approve | — | session and Origin checks |
| 2 | JOB-020 | `approvals` table, insert-only: application, payload hash, destination, CV and cover letter document ids, form revision, decided at, expires at, and invalidated at with a reason. New states APPROVED, SUBMITTING, SUBMITTED, SUBMISSION_UNKNOWN and EXPIRED. Only you can approve, and only a READY_FOR_REVIEW application whose current hash matches the hash you saw. Preparing again, new answers or rejecting invalidate the approval | 1 | yes (transitions, approval validity) |
| 3 | JOB-024 | Per-portal submission permission in the source registry, plus a global switch that is off by default. Browser guard submit mode: during a submit run only, exactly one POST to the portal's own form action on the portal's hosts, after the run has claimed the approval | 2 | yes (guard submit rule) |
| 4 | JOB-022 | Submission executor on the browser worker: its own queue keyed by approval id, one attempt, never retried. It claims APPROVED to SUBMITTING atomically, opens a fresh page, fills it again, recomputes the payload hash with the current documents and compares it with the approved one, reads the approval from the database again just before the click, and then clicks submit. Any difference before the click sends the application back to review with the reason. Each run is an `executions` row | 2, 3 | no |
| 5 | JOB-023 | Outcome check per portal: a confirmation page or message, or the form action's response. A clear success becomes SUBMITTED with a confirmation reference and a masked screenshot. A clear validation error shown before the page leaves becomes NEEDS_INFORMATION. Anything else, including a run that stops after the click, becomes SUBMISSION_UNKNOWN. From there only you decide: "it was sent" (SUBMITTED) or "it was not sent" (back to review, needing a new approval) | 4 | yes (outcome classifier) |
| 6 | JOB-021, JOB-024 | Approval inbox: applications ready for review with the preview, destination, documents and every value that will be sent, plus Approve and Not applying. The panel shows submitting, submitted and unknown states, the execution history and the audit trail. For manual portals, blocked runs or submission switched off, an assisted path lets you submit by hand and then mark "I submitted it" | 2, 5 | no |
| 7 | JOB-029, JOB-030 | End-to-end tests against the mock portals for criteria 6 to 9: no approval means no submit request leaves, a changed payload is refused, two runs on one approval submit once, and a dropped response becomes SUBMISSION_UNKNOWN. Plus an injected-instruction page that asks the worker to submit | 4, 5 | no |

Defaults: submission is off until you switch it on, so approving first produces the assisted
path; the plan is to turn it on after the first real preparation on each portal looks right.
An approval expires after 24 hours. A login, CAPTCHA or verification page during submission
stops the run as BLOCKED_BY_PLATFORM and moves to the assisted path. Abandoned SUBMITTING runs
become SUBMISSION_UNKNOWN, never FAILED, because the click may have happened. Two ADRs: the
payload-bound approval with at-most-once submission (updating ADR-012), and single-user
sign-in (updating ADR-003); ADR-020 gets a note on the submit mode.

As in Milestone 3, verification is against the mock portals. The submit requests of the real
Greenhouse, Lever and Ashby forms cannot be reached from the build environment, so the first
real submission should be one you watch.

## Milestone 5 — monitor responses and optimize results

Approved on 2026-10-15 (Gmail read-only) and built on PR #1. Done when spec acceptance criteria 10 and 12 pass and
spec section 12's Milestone 5 is covered: what happens after an application is sent is tracked
from the company's own messages, nothing about it is decided from an ambiguous message, the
user hears about what needs them, and the funnel and model costs show where to adjust.

| # | Spec ticket | Scope | Depends on | Test-first |
| --- | --- | --- | --- | --- |
| 1 | JOB-027 (part) | Join submission to the pursuit pipeline: a SUBMITTED application (by the worker or "I submitted it") sets the job's status to APPLIED with a `job_status_events` row, so the existing Career tracker and analytics see it. Backfill the applications already submitted | — | no |
| 2 | — | Email access (decision below): Gmail API with the read-only scope and the user's own OAuth client. The refresh token is stored encrypted at rest (AES-256-GCM, key from `APP_ENCRYPTION_KEY`, never in the database or a prompt). Connect and disconnect from settings. Reading is narrowed by a Gmail query to the last 30 days and to senders from the ATS domains and the companies applied to | 1 | encryption helper |
| 3 | JOB-026 | `recruiter_messages` (spec section 7): provider message id (unique, so a re-read adds nothing), sender domain, subject, received at, the matched application, classification, evidence quote, and the body kept only for matched messages, deleted after 180 days. A scheduled worker job reads new messages hourly. Matching to an application by ATS sender, company domain or name, and job title | 2 | matcher |
| 4 | JOB-026, A10 | Classification: rules first for the ATS confirmation and rejection templates, then the text provider for the rest (prompt `recruiter-message.v1`, Zod schema). Classes: APPLICATION_RECEIVED, REJECTION, INTERVIEW_REQUEST, ASSESSMENT, OFFER, RECRUITER_OUTREACH, OTHER, UNCLEAR. Every non-UNCLEAR class needs a quote found in the message, or it becomes UNCLEAR. Before sending, email addresses, phone numbers and links are masked, and only the subject and body go to the model | 3 | yes (rules, grounding) |
| 5 | A10, JOB-027 | Response tracking in the Applications step: each message suggests a pursuit status (APPLIED confirmed, REJECTED, SCREENING, INTERVIEW, OFFER) that the user accepts or dismisses. Nothing changes status by itself. Follow-up reminders: a submitted application with no reply after 10 days is flagged "consider following up", and the app never writes to anyone | 3, 4 | follow-up rule |
| 6 | JOB-025 | Notifications through a Telegram bot (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`; off when unset): a daily digest of new jobs scoring 80 or more, an application ready for your review, a submission result (including unknown), an interview, assessment or offer message, a follow-up due, and a cost budget crossed. Messages carry job titles, companies and a link only, never contact details or message bodies. In-app, the same events show as a count on the Applications step | 5, 7 | no |
| 7 | JOB-028, criterion 12 | Model cost ledger: one `ai_usage` row per model call (purpose, provider, model, prompt version, input and output tokens, estimated USD from a price table in code) plus Brave queries. `AI_MONTHLY_BUDGET_USD` stops optional calls (explanations, cover letters, classification falls back to rules and UNCLEAR) once reached, and warns at 80% | — | cost estimate |
| 8 | JOB-027, JOB-028, criterion 10 | Operations step: the funnel from discovered to offer, with conversion by source, by score band and by portal, median time to first reply, cost by purpose and month, and the outcome-based check of the matching weights (reply rate per score band next to the relevance feedback summary). It suggests weight changes and never applies them. `GET /api/audit-events` with filters and a readable audit history showing who acted (you, the worker or the system), what ran and the result | 1, 5, 7 | funnel metrics |

Defaults: email reading is opt-in and read-only, and nothing is ever sent from the user's
account. A message that matches no application is not stored, only its id, so it is not read
again. Notifications go to Telegram because it needs only a bot token and no stored password.
Notifications stay off until the two variables are set. Follow-up after 10 days and the 80
digest threshold are settings. One ADR for email access and message classification, and a note
on ADR-016 for the classification evidence check.

Decision for Lucas: how the app reads recruiter email.
1. **Gmail API, read-only (recommended).** Narrow, revocable, no password stored. It needs a
   Google Cloud OAuth client of your own. While the client stays in "testing" Google expires the
   token every 7 days, so it should be published for personal use (Google shows an "unverified
   app" screen once, which is fine for one user).
2. **IMAP with an app password.** Works with any provider, but it stores a password that can read
   and delete all mail, which the spec asks to avoid.
3. **Paste or forward by hand.** No access at all, but tracking depends on you remembering.
Option 3 is built in any case as the fallback: paste a message into an application.

Not in this milestone: backup, restore and retention controls (JOB-031) and the deployment
runbook (JOB-032). They are Milestone 6.

## Milestone 6 — backup, retention and operations runbook

Approved on 2026-10-15 ("Pode seguir com todos faltando"). Done when spec section 6's privacy
items are covered ("Encrypt backups and provide local export/deletion. Define retention limits
for screenshots and browser sessions") and someone other than the author could deploy, back up,
restore and troubleshoot the app from the docs alone.

| # | Spec ticket | Scope | Depends on | Test-first |
| --- | --- | --- | --- | --- |
| 1 | JOB-031 | Encrypted backup: one archive with every table's rows and every stored file (CVs, letters, screenshots), gzip then AES-256-GCM under `BACKUP_ENCRYPTION_KEY` (separate from `APP_ENCRYPTION_KEY`). `npm run backup` writes it; the worker also writes one daily to `BACKUP_DIR` and keeps the newest `BACKUP_KEEP` (7) when both are set | — | yes (archive format, table order) |
| 2 | JOB-031 | Restore: `npm run restore -- <file>` into an empty, migrated database, refusing a non-empty one, a wrong key or an archive from a newer schema; rows in foreign-key order, files back into storage | 1 | yes (table order) |
| 3 | JOB-031 | Local export and deletion: `npm run backup -- --plain` writes an unencrypted export (with a warning), and `npm run delete-my-data -- --yes-delete-everything` removes the profile, application details, documents, applications, messages, the mailbox connection (token revoked) and all stored files, keeping only the audit log of what was done | 1 | no |
| 4 | JOB-031 | Retention controls: a daily worker job applies `SCREENSHOT_RETENTION_DAYS` (30), `MESSAGE_BODY_RETENTION_DAYS` (180), id-only Gmail rows after 60 days and notification records after 180 days. Browser sessions are throwaway contexts that never outlive a run, which the runbook states. The Operations step shows the policy and the last run | — | yes (cutoffs) |
| 5 | JOB-032 | `docs/operations/runbook.md`: deployment with Compose, generating secrets, first sign-in, Google and Telegram setup, backups and a restore drill, key loss and rotation, upgrades and migrations, monitoring (health, logs, audit, notifications) and what to do for each known failure (Redis down, stuck run, unknown submission, Gmail revoked, budget reached, portal blocked) | 1–4 | no |

Defaults: backups are application-level (rows as JSON plus files) rather than `pg_dump`, so one
command covers the database and the stored files and needs no Postgres client in the image (an
ADR records the choice). Deletion is a command-line step only, never an API route.
