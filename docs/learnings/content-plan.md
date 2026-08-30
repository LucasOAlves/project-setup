# Content Plan reflection

## Learned

A pre-approved editorial calendar does not need its own generation pipeline. Wrapping
its briefs as a synthetic news article plus a deterministic `OpportunityPayload` let
the entire Post stage (draft, writing review, fact review, SEO, score, grounding) run
unmodified. The only new persistence is a thin status tracker; no existing table
changed shape.

Mapping a plan's `format` to an `AngleType` is a place a lazy default (`EXPERIENCE_DRIVEN`)
would have quietly broken the plan's own confidentiality policy — the briefs are
anonymized/synthetic by design, so the angle mapping deliberately never produces
`EXPERIENCE_DRIVEN`.

## Next

Reserve topics (T25-T30) are not imported; if the pilot needs a swap per the plan's own
change-control rules ("Continue, Adapt, Replace, Merge, Split, Reorder, or Retire"),
extend `plan-data.ts` rather than hand-editing generated posts.
