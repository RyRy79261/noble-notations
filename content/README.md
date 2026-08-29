# Content archive

This directory is the **frozen, verbatim archive** of everything that lived in
the Docusaurus `docs/` tree before the move to a database-backed repository.
Each file keeps its original prose exactly as written; only the front matter
was normalised (`title`, `kind`, `archived_from`, `summary`).

## Why it exists

Two reasons:

1. **Provenance.** These notes were written over years of actual batches. They
   are the primary record, and the structured rows in Postgres are derived from
   them by `scripts/ingest-archive.ts`. If the derivation is ever wrong, this is
   what it gets re-derived from.
2. **Durability.** The database is the source of truth going forward, but it is
   a hosted service. `scripts/export-markdown.ts` writes every recipe and every
   revision back out to `content/generated/` on demand, so the repository always
   holds a readable, greppable, diffable copy that survives Neon disappearing.

## Layout

```
content/
  biltong/      batch logs and running spice notes (batches 1-6)
  recipes/      recipes as originally written
  research/     technique research, long-form
  generated/    DB export — machine-written, do not hand-edit
```

## Rules

- **Do not edit `biltong/`, `recipes/`, or `research/` to change a recipe.**
  They are history. Fixing a recipe means creating a revision in the database
  (via the MCP server or the site), which is then re-exported to
  `content/generated/`.
- Typo fixes and formatting are fine — the point is that the *substance* is
  preserved.
- `content/generated/` is written by a script. Anything you type there will be
  overwritten on the next export.
