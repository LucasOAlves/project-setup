# ADR-003 — Unauthenticated single-workspace MVP

## Status

Accepted

## Context

The product journey starts at a professional profile. The prompt never required login, teams, or multi-tenant isolation. Auth would consume a slice that does not demonstrate personalized authority.

## Options considered

1. Full signup/login before profile
2. Magic-link or OAuth with a User table
3. No auth: `Profile` is the aggregate root in a local workspace

## Decision

Ship without user accounts. The local deployment holds one working profile/workspace.

Security still applies to uploads, prompts, keys, and validation. Missing auth is not missing input validation.

## Consequences

- Slice 1 can show product value immediately
- A later User/Auth ADR will be required before any shared or hosted multi-user deployment
- No personal data access-control model exists yet; the demo is trusted-local

## Tradeoffs

This is unacceptable for a public multi-user service. It is acceptable for the Compound Engineering MVP demo.

## Update (Milestone 4)

[ADR-021](./ADR-021-single-user-sign-in.md) adds optional single-user sign-in. With
`APP_PASSWORD_HASH` set, every API route needs a session. Without it the app stays open as
described here, except that approving and submitting job applications are refused.
