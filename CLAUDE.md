# CLAUDE.md

See **[AGENTS.md](./AGENTS.md)** for the full working guide — stack,
commands, repository layout, the data model, and quality gates. It is the
single source of truth for this repository.

Quick reminders:

- Package manager is **pnpm**.
- Run `pnpm format && pnpm lint && pnpm typecheck && pnpm build` before
  pushing — CI enforces all four. The build does not need a database: it
  runs migrations first, and that step skips when `DATABASE_URL` is absent.
- **Ask: did the food change, or is the record wrong?** `revise_recipe` when
  the food changed — it appends a version with a rationale and the old one
  stays readable. `update_recipe`, `update_revision`, `update_note` when the
  record is wrong. A correction writes over the version somebody cooked from,
  so reach for it only when the answer is "the record".
- **A delete is soft, and it is called delete, never "archive".** The row
  stays, it stops being visible, and `restore_record` brings it back. See
  AGENTS.md § _Delete is soft, and it is called delete_.
- All database access goes through `src/lib/queries/`; all writes go through
  `withTransaction`.
- `content/biltong|recipes|research` is a frozen archive — history, not a
  place to change a recipe. `content/generated/` is machine-written.
