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

Milestones 2 to 5 (materials, Playwright preparation, approval and submission, monitoring)
are broken down once Milestone 1 ships.
