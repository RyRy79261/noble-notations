# AGENTS.md

Working guide for AI agents (and humans) contributing to **Noble Notations**.
This file is the single source of truth for conventions; `CLAUDE.md` points
here.

## What this is

A structured repository of recipes, ingredients, techniques and batch logs,
backed by Postgres and exposed both as a website and as an MCP server.

The organising idea is **revisions**. A recipe is a stable identity with a
slug and a title; its ingredients and steps belong to an immutable
`recipe_revisions` row, and every revision records _why_ it exists. Refining
a recipe appends a revision and moves a pointer — nothing is ever edited in
place. That is the whole reason the project exists: the same dish kept being
re-derived from scratch in every conversation instead of getting better.

## Stack

- **Next.js 16** (App Router) on **React 19**, TypeScript 5.9
- **Postgres** via **Drizzle ORM** — Neon in production, plain Postgres locally
- **MCP** via `mcp-handler` + `@modelcontextprotocol/sdk`, OAuth 2.1 + DCR
- **pnpm** is the package manager
- Deployed on **Vercel**; CI is GitHub Actions

## Commands

```bash
pnpm install
pnpm dev                # dev server
pnpm build              # production build
pnpm start              # serve the production build

pnpm typecheck          # tsc --noEmit
pnpm lint               # ESLint
pnpm format             # Prettier write
pnpm format:check       # Prettier check (CI uses this)

pnpm db:generate        # emit SQL from src/db/schema.ts into drizzle/
pnpm db:migrate         # apply committed migrations
pnpm ingest             # load content/ into the database (idempotent)
pnpm export             # write the database back out to content/generated/
```

## Repository layout

```
content/                  frozen Markdown archive (provenance; see its README)
  generated/              machine-written export from the database
drizzle/                  committed SQL migrations
scripts/                  migrate, ingest, export, password hashing
src/
  app/                    App Router pages, metadata, OG images
    api/mcp/              the MCP endpoint and its OAuth 2.1 + DCR stack
  components/             shared UI
  db/                     schema.ts (source of truth) and client.ts
  lib/
    domain/               Zod schemas, units, slugs — the submission contract
    queries/              read.ts and write.ts, the only DB access paths
    mcp/                  tools, OAuth primitives, admin session
docs/mcp-connector.md     connector design reference and its gotchas
```

## The four systems

1. **Taxonomy** — faceted, hierarchical terms. Terms never cross facets, so
   "smoking" the technique and "smoking" the preservation method stay
   distinct.
2. **Ingredients** — a canonical list, separate from the per-recipe lines
   that reference it. This is what makes referential queries possible.
3. **Process** — ordered, phased steps with duration, temperature, equipment
   and per-step ingredient references.
4. **Notes** — typed annotations with citable sources, attachable to a
   recipe, revision, step, ingredient or experiment.

Plus **experiments**: a recorded run of a revision with per-item
observations. The biltong batch logs are experiments, not recipes.

## Conventions

- **All database access goes through `src/lib/queries/`.** Pages, MCP tools
  and scripts share those functions so the site and the connector can never
  disagree about what a recipe is.
- **All writes go through `withTransaction`.** A recipe whose revision landed
  but whose ingredients did not is worse than no recipe, because the site
  renders it as an empty dish.
- **Never edit a recipe in place.** Add a revision. The write layer has no
  update path for ingredients or steps, deliberately.
- **`src/lib/domain/schemas.ts` is the submission contract.** MCP tools, the
  ingest script and the exporter all derive from it. Tools take the raw
  _shape_ (for JSON Schema) and parse with the assembled _schema_ (for
  cross-field refinements), so the advertised signature and the enforced
  contract cannot drift.
- **Do not hand-edit `content/biltong/`, `content/recipes/`, or
  `content/research/`** to change a recipe — they are history. Fix the
  database and re-export.
- **`content/generated/` is machine-written.** It is overwritten by
  `pnpm export`.
- Migrations are generated (`pnpm db:generate`) and committed. Never run
  `drizzle-kit push` against a real database; it diffs without a migration
  file and will drop columns.
- Scripts run with `NODE_OPTIONS=--conditions=react-server`, because
  `server-only` otherwise resolves to its throwing client entry outside Next.

## Local development

The app picks its driver from `DATABASE_URL`: a `*.neon.tech` host uses
Neon's serverless drivers, anything else uses node-postgres over plain TCP.
So a local Postgres works:

```bash
createdb noble
export DATABASE_URL=postgresql://localhost/noble
pnpm db:migrate && pnpm ingest && pnpm dev
```

Every database-backed page degrades to an explanatory notice rather than a
stack trace when `DATABASE_URL` is unset, so the build and the archive work
without one.

`pnpm build` runs `pnpm db:migrate:deploy` first, so a deployment ships its
schema with its code. That step _skips_ when `DATABASE_URL` is unset (CI has
no database and must stay green) but fails the build when a configured
database is unreachable or a migration errors. It applies schema only —
seeding the archive is still a separate `pnpm ingest`.

## Environment

See `.env.example`. `DATABASE_URL` is required for content;
`NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` and `ALLOWED_EMAILS` are
required for the MCP connector's consent screen (Vercel injects the first,
you set the other two); `MCP_PUBLIC_URL` should be set in production (see
the `VERCEL_URL` gotcha in `docs/mcp-connector.md`).

## Quality gates

`.github/workflows/ci.yml` runs on every push and PR and must stay green:
format check → lint → typecheck → production build. The build step needs no
database — the migration it now runs skips itself when `DATABASE_URL` is
absent. Before pushing:

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm build
```

The build does not need a database: its migration step skips when
`DATABASE_URL` is absent.

## Do not touch

- `.claude/` and `.planning/` are managed by the GSD tooling — do not
  hand-edit or reformat them. Note that `.planning/PROJECT.md` predates this
  rebuild and describes the old static-site architecture; treat this file as
  authoritative where they disagree.
- Do not commit `.next/` or `build/` (git-ignored).
- This is Next.js 16. Several conventions moved: `middleware.ts` is now
  `proxy.ts`, and route params are Promises. The version's own docs ship in
  `node_modules/next/dist/docs/` — read those rather than trusting memory.
  `next dev` offers to append that advice to this file automatically;
  `agentRules: false` in `next.config.ts` turns it off so this file stays
  hand-written.
