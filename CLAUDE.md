# Working conventions for this repository

## Feature workflow

Every non-trivial change (new feature, bug fix that changes behavior, refactor
that touches architecture) follows this sequence:

1. **Plan first.** Enter plan mode for anything that touches more than a couple
   of files or involves a design decision. Get the plan approved before writing
   code.
2. **Implement, then validate.** `npm run typecheck` and `npm run test` at the
   root must be green. For anything with a UI or an observable runtime effect,
   verify it manually in the running dev app (`npm run dev`) — passing tests is
   not the same as the feature working.
3. **Re-check the documentation.** Before considering the feature done, check
   whether it made any of the following stale or incomplete, and update what's
   actually affected:
   - `README.md` — does the feature list / setup instructions still match reality?
   - `docs/architecture/system-design.md` — does the module table, provider
     list, or pipeline diagram still match what's actually wired in `app.ts`?
   - `docs/decisions/` — did this change embody a real architectural decision
     (a tradeoff between real options, not just "implemented the plan")? If so,
     write a new ADR following the existing template (Status / Context /
     Options considered / Decision / Consequences / Tradeoffs — see any
     existing `ADR-*.md` for the shape). If it changes the *consequences* of an
     existing ADR, add a short update note to that ADR rather than leaving it
     inaccurate.
   - Not every change needs a new ADR — routine bug fixes and small additions
     usually don't. A new ADR is for a genuine fork-in-the-road decision.
4. **Once docs are current (or confirmed to need no changes), suggest — don't
   assume — a commit and a PR for that feature.** State clearly what's staged
   and propose a commit message and PR description; wait for explicit
   confirmation before running `git commit`, `git push`, or `gh pr create`, per
   the standing rule that commits and pushes are never done unprompted.

## Notes specific to this project

- This repository is a personal fork — see the "Origin" section in `README.md`
  for attribution. `origin` remote is the user's own repo; `upstream` is the
  original project it was based on. Never push to `upstream`.
- No personal/professional data belongs in the repository content itself
  (see `apps/api/src/modules/content-plan/plan-data.ts`, which intentionally
  ships example data, not the user's real content plan).
