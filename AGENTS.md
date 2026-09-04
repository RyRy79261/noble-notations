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

History can still be written down late. `backfillRevision` records a version
that existed **before** everything stored, for an older version found in a
notebook or an earlier conversation. It is not an exception to the rule: it
never moves the current revision and never touches a stored one, so nothing
a reader sees changes. Revision numbers stay dense and permanent — they are
in URLs and in the keys that remember ticked ingredients — so a backfill
takes the next number and `occurred_at` says where it belongs. Numbers say
when a version was recorded; `occurred_at` says when it existed, and the
history is ordered by the latter.

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
scripts/                  migrate, ingest, export, token minting
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

1. **Categories** — tags grouped by category type, each with a plain-English
   explanation and an optional parent. A tag never crosses category types,
   so "air-drying" the technique and "air-drying" the preservation method
   are two tags with two different explanations. The database columns still
   say `taxonomy_terms.facet`; the mapping happens at the query boundary.
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
  update path for ingredients or steps, deliberately. `backfillRevision` is
  the one way to add a version out of order, and it only adds ones older
  than everything stored — it cannot change what is current. Nothing carries
  forward into a backfill: inheriting a later version's ingredients would
  invent a history that never happened, so an old version states its own.
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
database is unreachable or a migration errors. It applies schema only.

### Loading the archive from a deployment

Migrations run on every build; the archive does not. A build must not
decide on its own to write rows to the database it is deploying against.
So `pnpm build` also runs `pnpm ingest:deploy`, which does nothing unless
that deployment asked for it. Three ways to ask:

| Ask                                                         | Fits                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A `.ingest-request` file at the repository root             | A pull request. Nothing in the project settings changes.                         |
| `INGEST_ON_DEPLOY` set to anything but `0`, `false` or `no` | A one-off production run from the Vercel dashboard, or one preview branch.       |
| `[ingest]` in the commit message                            | Only near the **start** of the message — Vercel truncates it. Do not rely on it. |

To load the archive from a pull request:

1. Write a `.ingest-request` file. Put the reason in it — the build prints
   what it says.
2. Push the branch. Vercel builds the preview.
3. Read the build log. The ingest prints every row it creates or skips.
4. Delete the file before merging, or the load repeats on every build.

The file is the one signal that does not depend on Vercel's build
environment. The commit-message marker was tried first and did not fire.
The build log said why: `VERCEL_GIT_COMMIT_MESSAGE` was there, but Vercel
truncates it at roughly a thousand characters and the marker sat at the
end of a long message. That route therefore works only for a marker near
the start of the subject, and only where the project exposes system
environment variables at all — neither condition is visible from inside
this repository. When the archive is not loaded, the build log names all
three signals and says what it found for each, which is how this was
diagnosed.

Two things to know before doing this. A preview build carries the Preview
environment's `DATABASE_URL`, and unless the project sets a different one
per environment that is the production database — so treat a marked
preview as a write to production. And the ingest is idempotent but not
free: it re-runs on every build that still carries the marker.

The deploy path never passes `--force`. It adds what is missing. Adding
revisions to recipes that already exist stays a manual `pnpm ingest
--force` from a terminal.

## Environment

See `.env.example`. `DATABASE_URL` is required for content;
`NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` and `ALLOWED_EMAILS` are
required for the MCP connector's consent screen (Vercel injects the first,
you set the other two); `MCP_PUBLIC_URL` should be set in production (see
the `VERCEL_URL` gotcha in `docs/mcp-connector.md`).

## Quality gates

`.github/workflows/ci.yml` runs on every push and PR and must stay green:
format check → lint → typecheck → production build, plus an end-to-end job
against a throwaway Postgres. The build step needs no database — the
migration it runs skips itself when `DATABASE_URL` is absent. Before
pushing:

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm build
```

The build does not need a database: its migration step skips when
`DATABASE_URL` is absent.

## Words and writing style

**User-facing text uses ASD Simplified Technical English.** Short
sentences. One idea in each sentence. Active voice. No word that needs
another word to explain it. This applies to page copy, MCP tool
descriptions and the agent guide — not to code comments, which explain
_why_ and need their full vocabulary.

The word "taxonomy" is not used anywhere a person or an agent reads. The
vocabulary is:

| Say                                         | Not                      |
| ------------------------------------------- | ------------------------ |
| Categories                                  | Taxonomy, classification |
| Category type (cuisine, course, technique…) | Facet                    |
| Tag                                         | Term                     |

**The database columns did not change.** `taxonomy_terms.facet` is still
`facet`, and `CategoryType` is an alias over the same enum. Renaming those
columns would be a destructive migration in exchange for a vocabulary
change, which is a bad trade. The mapping happens at the query boundary:
`TermView.categoryType` reads from `taxonomyTerms.facet`.

MCP names follow the same vocabulary: `list_categories`,
`upsert_category`, and the fields `categoryType` and `categories`. The old
`/taxonomy` URLs redirect permanently to `/categories`.

## Note kinds

`science` and `research` are the two that get confused, and the split is
deliberate:

- **science** — what is physically or chemically happening _in the dish_,
  and why a technique works. "Duxelles is a moisture barrier, not a flavour
  layer." Rendered in its own section at the bottom of a recipe.
- **research** — what was learned _around_ the dish afterwards:
  alternatives, hacks, sourcing, background. "Where to buy crayfish in
  Berlin."

`research` originally carried both, which is why "The science" needed a
kind of its own rather than a filter over the existing one.

## Agent onboarding

`src/lib/mcp/guide.ts` is the single source for both the MCP server's
`instructions` (the short version, surfaced by clients that read it) and
the `get_started` tool (the full guide). They live together so they cannot
drift. Tool descriptions explain one tool each; the guide explains how the
pieces fit — most importantly that the repository is revision-first.

## Shopping lists and filtering

`buildShoppingList(slugs)` combines several recipes' _current_ revisions
into one list grouped by `CATEGORY_ORDER` (shop order, not alphabetical).
Amounts sum only within a compatible unit bucket — mass and volume convert
freely, count units never do, because every count unit carries `toBase: 1`
and three cloves plus two heads are not five of anything. Unquantified
lines are flagged, never guessed at.

`FilterableGroups` is the shared filter for any grouped view. Server
Components pre-render each heading and row and pass them in as nodes; the
client only decides what to show. **A Server Component may pass JSX across
that boundary but not a function** — hence `layout` / `tableHead` rather
than a render callback.

## End-to-end tests

`pnpm test:e2e` runs Playwright against a real production build and a real
Postgres. There are no mocks: the suite exercises the lifecycle the project
exists for — an MCP client writes a recipe, tags it, describes those tags,
then _revises_ rather than duplicating, and the site serves each state.

```bash
createdb noble_test
DATABASE_URL=postgresql://localhost/noble_test pnpm test:e2e
```

**`DATABASE_URL` is destroyed on every run.** `e2e/global-setup.ts` drops
both the `public` and `drizzle` schemas — the second matters, since leaving
the migration journal behind makes the migrator skip work it has not done —
then migrates and seeds through the real `pnpm ingest`. Point it at a
scratch database.

The interactive half of OAuth needs a browser, a Neon Auth session and a
human clicking Approve, so the suite mints bearer tokens with
`pnpm mcp:token` and drives the real MCP endpoint with them. Everything
downstream of consent — transport, tool registry, per-call scope checks — is
the real path. `pnpm mcp:token` is also the quickest way to get a token for
curl.

Set `PLAYWRIGHT_CHROMIUM_PATH` when the machine's Chromium is a different
revision from the one Playwright expects; unset, Playwright resolves its
own.

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
