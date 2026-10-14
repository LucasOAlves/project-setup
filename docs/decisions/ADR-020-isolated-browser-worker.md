# ADR-020 — Applications are prepared in a separate, guarded browser worker

## Status

Accepted

## Context

Milestone 3 opens job application pages in a real browser to read and fill their forms. The
spec (section 6) asks for:
- isolated browser profiles;
- navigation restricted to configured destinations;
- no access to localhost, private networks or cloud metadata;
- limited filesystem access;
- no shell execution from browser-driven agents;
- timeouts and concurrency limits;
- treating every page as untrusted input.

Milestone 3 must also never submit an application. That is Milestone 4, behind an approval.

The existing worker ([ADR-015](./ADR-015-job-hunter-worker-process.md)) runs discovery and
evaluation. It holds the model provider keys and talks to many public APIs.

## Options considered

1. **Run Playwright inside the existing worker.** One process fewer. But Chromium would share
   a process and its environment with the model keys, and a hung page would hold up
   discovery.
2. **A separate browser worker process and Compose service, on its own queue.** It gets only
   the database and Redis. Every request is checked by a pure guard, each run uses a
   throwaway browser context, and the whole run has a deadline.
3. **Playwright MCP driven by a model.** The spec prefers conventional Playwright for stable
   forms. A model choosing actions from page content is exactly where a prompt injection in
   a posting would act, and it would need its own guard anyway.

## Decision

Option 2, with conventional Playwright. Playwright MCP is left for later, for portals the
fixed adapters cannot handle.

- **Process:** `browser-worker.ts` is the only consumer of `application-prep`. It runs one
  application at a time, is never retried (preparing again is the user's call), and has a
  deadline of `BROWSER_RUN_TIMEOUT_MS`. In Compose it runs from Playwright's image as an
  unprivileged user, with memory and CPU limits, no model keys and no published port.
- **Browser:** each run launches Chromium and creates a fresh context: no stored cookies or
  profile, downloads and service workers off, WebSockets closed.
- **Network guard:** `browser-guard.ts`, pure and test-first, checks every request.
  - Pages only open on the job's ATS (Greenhouse, Lever or Ashby).
  - https only.
  - Local names, IP literals and hosts that resolve to private, loopback, link-local,
    CGNAT or metadata ranges are refused.
  - Write requests (POST, PUT, PATCH, DELETE) are refused, except Ashby's read-only
    GraphQL queries, which it needs to render the form.
  - Since that is also how a form is submitted, the guard by itself makes a submission
    impossible.
- **More checks on top of the guard:**
  - An init script disables form submission in every frame.
  - The landed URL is checked after redirects, which bypass request routing.
  - No code path clicks a submit button.
- **Logins and CAPTCHAs:** a login wall, a visible CAPTCHA or a bot check
  (`blocking-page.ts`) ends the run as BLOCKED_BY_PLATFORM. Nothing works around it.
- **Recording outcomes:** the worker records each run's outcome through
  `ApplicationService` as WORKER (ADR-019). A run left in PREPARING for 10 minutes is failed
  by the system. Error messages are not stored, only their kind, since they can carry page
  content.

## Consequences

- Milestone 4 must open a deliberate, narrow exception in the guard for the final submit of
  an approved payload. Until then nothing can submit.
- A portal that changes how it loads (a new write request needed to render the form) fails
  the run rather than degrading quietly, and the user falls back to the manual path.
- Tests run a real headless Chromium against mock portals served through the session's
  `mockResponse` hook. Under test nothing reaches the network. These tests are skipped when
  no Chromium is installed.

## Tradeoffs

Refusing every write by default may break a portal that needs one to show its form. Allowing
writes by pattern would make "never submits" depend on guessing every portal's submit
endpoint. The default deny was chosen.

Checking DNS before Chromium connects leaves a small rebinding window. Main-frame hosts are
restricted to the ATS domains, which bounds what that window can reach.
