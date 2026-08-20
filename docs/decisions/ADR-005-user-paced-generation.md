# ADR-005 — User-paced generation instead of a background pipeline

## Status

Accepted

## Context

Persona, research, opportunities, post reviews, and image generation can exceed a comfortable single HTTP timeout. The user also must choose a topic and an angle. A hidden 90-second job would remove the product's trust surfaces.

## Options considered

1. One API call that runs the full pipeline
2. Redis/queue/worker with job polling
3. User-paced HTTP use cases; frontend walks the journey; durable state in Postgres

## Decision

Each stage is an explicit use case. The UI shows intermediate results. Postgres holds the `ContentRun`. Image generation retries against an existing post.

No job platform in the MVP.

## Consequences

- Latency is visible and recoverable per stage
- Why This Post? and angle selection stay first-class
- The client is an orchestrator of user decisions, not of domain rules

## Tradeoffs

More round trips. That is desirable here. A worker can be introduced later if a stage must run unattended.
