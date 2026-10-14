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

Milestones 2 to 5 (materials, Playwright preparation, approval and submission, monitoring)
are broken down once Milestone 1 ships.
