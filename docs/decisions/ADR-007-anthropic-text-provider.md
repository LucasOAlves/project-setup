# ADR-007 — Anthropic as a second `TextGenerationProvider`

## Status

Accepted

## Context

The MVP shipped with `OpenAITextGenerationProvider` as the only implementation of
`TextGenerationProvider` (ADR-002). The OpenAI account used for local development
and demos ran out of credits (`429 You have no credits remaining`), which is an
account problem, not an architecture problem — but it blocked every AI-dependent
step (persona, opportunities, post draft/review, image brief) until resolved.
Anthropic's API was cheaper to fund for this project and the provider interface
already existed specifically so a vendor could be swapped without touching domain
code.

## Options considered

1. Wait on OpenAI credits / fund the same account
2. Add `AnthropicTextGenerationProvider` behind the existing `TextGenerationProvider`
   interface, selectable via env var
3. Replace OpenAI outright

## Decision

Add `AnthropicTextGenerationProvider` (`apps/api/src/modules/ai/anthropic-text-generation-provider.ts`)
implementing the same `TextGenerationProvider` interface as the OpenAI adapter.
Select the active provider at startup with `TEXT_PROVIDER=openai|anthropic`
(`apps/api/src/env.ts`), defaulting to `openai` so no existing deployment changes
behavior silently. Model name is a separate env var per vendor
(`OPENAI_TEXT_MODEL`, default `gpt-4.1`; `ANTHROPIC_TEXT_MODEL`, default
`claude-opus-5`), because model identity is a vendor concern, not a domain one.

No prompt, schema, or use case changed. `apps/api/src/app.ts` picks the concrete
provider once at wiring time; every downstream module (`persona`, `opportunities`,
`posts`, `ai/image-brief`) still only depends on the interface.

## Consequences

- Local `.env` needs either `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` depending on
  `TEXT_PROVIDER` — both are documented in `.env.example`.
- Claude models in current use (Sonnet 5 / Opus 5) reject the `temperature`
  parameter (`400 'temperature' is deprecated for this model`) — the Anthropic
  adapter omits it entirely rather than conditionally passing it, keeping the
  adapter simple at the cost of not exposing temperature tuning for that vendor.
- Claude's structured JSON responses for the larger prompts (post review, opportunity
  evaluation) were being truncated at `max_tokens: 8000` in non-streaming mode.
  The adapter uses `client.messages.stream()` + `.finalMessage()` with
  `max_tokens: 16000` to avoid truncation on long outputs — this makes every
  Anthropic-backed call a streamed call, even though the app doesn't surface
  incremental tokens to the user (streaming here is purely for the timeout/size
  headroom, not for UX).
- Claude tends to be more verbose than GPT-4.1 for the same instructions, which
  surfaced separately as schema-max-length failures in `post-review.v1.ts` and
  `image-brief.v1.ts` — fixed by adding explicit `(max N characters)` hints to
  those prompts' OUTPUT FORMAT sections and widening a couple of Zod max-lengths.
  This is a prompt-engineering consequence of provider choice, not a provider-layer
  fix, which is exactly the boundary ADR-002 intended: the adapter stayed a thin
  translation layer, the model-behavior difference got absorbed in prompts.
- No cost/quality A/B was run between vendors; the switch was availability-driven,
  not a benchmarked decision. A future revisit could compare quality once both
  accounts are reliably funded.

## Tradeoffs

Keeping both providers alive (rather than migrating fully to Anthropic) means two
vendor SDKs, two error-mapping modules (`openai-error.ts` / `anthropic-error.ts`),
and two sets of provider-specific quirks to remember. The alternative — picking one
vendor permanently — would simplify the codebase but reintroduce the single-point-
of-failure ADR-002 was written to avoid.
