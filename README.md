# Noble Notations

A structured repository of recipes, ingredients, techniques and batch logs.

Every recipe is versioned. Its ingredients and steps belong to an immutable
revision, and each revision records _why_ it exists — so a dish gets refined
across revisions instead of being re-derived from scratch every time somebody
asks for it. That is the entire point: the history of how something got good
is the most valuable part of it.

Live at **[noble-notations.ryanjnoble.dev](https://noble-notations.ryanjnoble.dev)**.

## What is in here

- **Taxonomy** — faceted classification: cuisine, course, technique, diet,
  season, equipment, occasion, preservation, texture, ingredient class.
- **Ingredients** — a canonical list with aliases, densities and substitutes,
  separate from the per-recipe lines that reference it. "Everything I have
  made with gochujang" is a query, not a memory exercise.
- **Process** — ordered, phased steps carrying duration, temperature,
  equipment, and the ingredients each step consumes.
- **Notes** — typed annotations with citable sources: observations, research,
  substitutions, warnings, results, ideas, corrections.
- **Experiments** — recorded runs with per-item measurements. Six years of
  biltong batches live here.

## The MCP connector

The repository speaks the Model Context Protocol. Connected to a Claude
project, a conversation can search what is already recorded and append
revisions directly — so a refinement worked out in chat lands here instead of
evaporating.

Endpoint: `https://noble-notations.ryanjnoble.dev/api/mcp/mcp`

See [`docs/mcp-connector.md`](./docs/mcp-connector.md) for the design and
[`/connect`](https://noble-notations.ryanjnoble.dev/connect) for setup.

## The archive

Everything that predates the database is preserved verbatim under
[`content/`](./content) — those files are the provenance record the
structured rows were derived from. In the other direction, `pnpm export`
writes every recipe and revision back out to `content/generated/`, so the
repository always holds a readable, diffable copy of the data.

## Running it

```bash
pnpm install
cp .env.example .env.local     # fill in DATABASE_URL

pnpm db:migrate                # apply migrations
pnpm ingest                    # load the archive
pnpm dev
```

A `*.neon.tech` connection string uses Neon's serverless drivers; anything
else uses node-postgres, so a local Postgres works for development.

Contributor conventions, the data model and the quality gates are in
[`AGENTS.md`](./AGENTS.md).
