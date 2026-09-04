# CLAUDE.md

See **[AGENTS.md](./AGENTS.md)** for the full working guide — stack,
commands, repository layout, the data model, and quality gates. It is the
single source of truth for this repository.

Quick reminders:

- Package manager is **pnpm**.
- Run `pnpm format && pnpm lint && pnpm typecheck && pnpm build` before
  pushing — CI enforces all four. The build does not need a database: it
  runs migrations first, and that step skips when `DATABASE_URL` is absent.
- **Never edit a recipe in place.** Add a revision with a rationale; the
  write layer has no update path for ingredients or steps.
- All database access goes through `src/lib/queries/`; all writes go through
  `withTransaction`.
- `content/biltong|recipes|research` is a frozen archive — history, not a
  place to change a recipe. `content/generated/` is machine-written.
- Do not hand-edit `.claude/` or `.planning/` (GSD-managed). `.planning/`
  predates this rebuild and describes the old static-site architecture.
