# ADR-008 — Pollinations.ai as a free `ImageGenerationProvider`

## Status

Accepted

## Context

Slice 6 (image generation) shipped with `OpenAIImageGenerationProvider` as the only
implementation of `ImageGenerationProvider` (ADR-002). The same OpenAI account with
no credits that motivated ADR-007 also blocked image generation. Anthropic has no
image-generation API at all, so ADR-007's fix didn't cover this capability. The
question was whether a genuinely free, no-key image API existed that was good
enough for demo purposes.

## Options considered

1. Fund the OpenAI account and stay single-provider
2. Google AI Studio (Imagen) — free tier exists but still requires an API key and
   account setup
3. Hugging Face Inference API — free tier exists but rate limits and cold-start
   latency are unpredictable for a demo
4. Pollinations.ai — fully free, no API key, no account, direct HTTP GET

## Decision

Add `PollinationsImageGenerationProvider`
(`apps/api/src/modules/ai/pollinations-image-generation-provider.ts`) implementing
`ImageGenerationProvider`. Select the active provider with
`IMAGE_PROVIDER=openai|pollinations` (`apps/api/src/env.ts`), defaulting to
`openai`. The adapter calls
`GET https://image.pollinations.ai/prompt/{encodeURIComponent(prompt)}?width=1024&height=1024&model=flux&nologo=true&seed={random}`
and reads the raw JPEG bytes directly from the response body — no request
authentication, no client library, no async job polling.

## Consequences

- `IMAGE_PROVIDER=pollinations` needs no API key at all, which makes the image
  generation step usable in any environment, including one with no funded vendor
  account — useful for demos and for anyone forking the project.
- Pollinations has **no reference-photo / image-to-image support**. OpenAI's
  `images.edit()` can incorporate the user's uploaded reference photos
  (`packages/shared` `photos` on the profile); Pollinations' adapter ignores that
  input entirely and generates from the text prompt alone. This is a real
  capability gap, not just a quality difference — documented here so it isn't
  mistaken for a bug later.
- No SLA, no documented rate limits, no uptime guarantee — acceptable for a demo
  and for the "at least something ships when OpenAI is unfunded" use case; not a
  choice to make for a production system without revisiting.
- The image is returned as opaque bytes with no metadata (no revised prompt, no
  safety classification) unlike OpenAI's response shape — the adapter normalizes
  both into the same internal `GeneratedImage` model so `ImageService` never
  branches on which provider produced the bytes.

## Tradeoffs

A paid, authenticated provider (Google AI Studio, Hugging Face) would have offered
more predictability and a documented usage contract, at the cost of needing another
API key the demo environment didn't reliably have. Pollinations trades away that
predictability for zero setup friction, which matched the actual constraint at the
time (no funded account, need to keep demonstrating the feature).
