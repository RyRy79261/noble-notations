# AGENTS.md

Working guide for AI agents (and humans) contributing to **Noble Notations**.
This file is the single source of truth for conventions; `CLAUDE.md` points
here.

## What this is

A structured repository of recipes, ingredients, techniques and batch logs,
backed by Postgres and exposed both as a website and as an MCP server.

The organising idea is **revisions**. A recipe is a stable identity with a
slug and a title; its ingredients and steps belong to a `recipe_revisions`
row, and every revision records _why_ it exists. Refining a recipe appends a
revision and moves a pointer. A stored revision can still be corrected —
`update_revision` exists for a record that is wrong, not for a dish that
changed. That is the whole reason the project exists: the same dish kept
being re-derived from scratch in every conversation instead of getting
better.

History can still be written down late. `backfillRevision` records a version
that existed **before** everything stored, for an older version found in a
notebook or an earlier conversation. It is not an exception to the rule: it
never moves the current revision and never touches a stored one, so nothing
a reader sees changes. Revision numbers are permanent and never reissued —
they are in URLs and in the keys that remember ticked ingredients — so a
backfill takes the next number and `occurred_at` says where it belongs, and
a deleted version leaves a hole rather than closing one. Numbers say
when a version was recorded; `occurred_at` says when it existed, and the
history is ordered by the latter.

## Stack

- **Next.js 16** (App Router) on **React 19**, TypeScript 5.9
- **Tailwind CSS v4** (configured in CSS, no `tailwind.config.*`) with
  **shadcn/ui** primitives; tokens live in `src/app/theme.css`
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
    theme.css             the only stylesheet: Tailwind, the design tokens,
                          and the base block of seven declarations
                          preflight has no answer for
    api/mcp/              the MCP endpoint and its OAuth 2.1 + DCR stack
  components/             shared UI
    ui/                   vendored shadcn/ui primitives. M3 creates it.
  db/                     schema.ts (source of truth) and client.ts
  lib/
    domain/               Zod schemas, units, slugs — the submission contract
    queries/              the only DB access paths. read.ts (live rows only,
                          and ESLint refuses it the base tables), write.ts,
                          live.ts (the six views, plus the one aliased base
                          table), deleted.ts (the bin, and the one read
                          module that sees deleted rows)
    mcp/                  tools, OAuth primitives, admin session
    utils.ts              cn(), the class merger shadcn/ui expects
components.json           shadcn/ui configuration (css: src/app/theme.css)
postcss.config.mjs        runs @tailwindcss/postcss
design/BUILD-PLAN.md      the milestone plan and the design tokens
design/TOKEN-MAP.md       what each token means and why (D-11)
docs/mcp-connector.md     connector design reference and its gotchas
```

`src/app/theme.css` is the only stylesheet, and `src/app/layout.tsx` is the
only file that imports it. It is one `@import 'tailwindcss'` — theme,
preflight and utilities, in their own cascade layers — followed by the
design's tokens and one `@layer base` block.

That base block is the whole of what `src/app/globals.css` left behind. That
file was the pre-Tailwind design system, 1,892 lines; M1 to M6 kept it alive
under a cascade layer called `legacy` with the preflight off, because the
reset and its base rules fight each other, and M7 deleted the file, the layer
and the preflight comment together (D-03). Seven declarations had no
preflight counterpart and are restored in the base block, each with the
measurement that says why; two more are stated there for clarity, so the
block holds nine declarations in four rules. Read `design/TOKEN-MAP.md` §10 before you touch them: dropping
any one of them moves the whole site.

Styling rule of thumb: a component reads a token (R-BLD-02), never a raw
value, and never a bare class name that no stylesheet defines. A hook a test
needs is a `data-` attribute, not a class.

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
- **Adding a revision is how a dish changes. Correcting a record is a
  different act, and the connector has both.** `revise_recipe` when the food
  changed; `update_recipe`, `update_revision`, `update_note` when the record
  is wrong. The question that separates them is: did the food change? Reach
  for the correction only when the answer is no — a correction writes over
  the version somebody cooked from. `backfillRevision` is still the one way
  to add a version out of order, and it only adds ones older than everything
  stored, so it cannot change what is current. Nothing carries forward into
  a backfill: inheriting a later version's ingredients would invent a
  history that never happened, so an old version states its own.
- **A child is replaced with its parent, never on its own.** An ingredient
  line, a step, a note source, a mass flow stage, an experiment item and an
  observation have no update and no delete of their own. A caller removes
  one by sending the parent's whole list without it. That is already the only
  shape the write layer has — `writeRevisionBody` takes whole lists,
  `applyTaxonomy` and `applyLinks` delete and rewrite, `logExperiment`
  replaces items and observations as a pair — and the two cross-checks that
  bind a step to an ingredient line, `checkStepReferences` and
  `checkCarriedUses`, both decide by counting how many lines answer to a
  name. A per-line delete would remove one of two lines without re-running
  that count and silently re-point the step at the survivor.
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
- **A Tailwind class string inside a comment is a class string** — and so is
  one inside a Markdown file this repository tracks. Tailwind v4 scans raw
  source text, not JSX attributes, so quoting a value read off the design
  emits a real utility into the production stylesheet, raw hex included, and
  R-BLD-02 and R-TKN-04 are then broken by a comment. Put a space inside the
  brackets when quoting one — `bg-[ #FCFAF6 ]` scans to nothing and still
  greps — and check with
  `grep -oE '\\#[0-9A-Fa-f]{6}' .next/static/chunks/*.css` after a build.

## Delete is soft, and it is called delete

The connector has full CRUD. Every record an agent can create it can now
update and delete, and a delete is soft: the row stays, it stops being
visible, and it can be restored.

### Why the rule changed

The old rule was that nothing could be deleted and nothing edited in place.
It was defending the right thing and it was aimed at the wrong target. The
purpose here is an **accurate history**, not an immutable record — and those
two only agree while every row was written on purpose.

They stop agreeing the moment two chats write the same revision. That
happens; this is a connector several conversations hold at once. The second
one is not a version of the dish, because the dish did not change between
them. It is a data-entry accident. A rule that preserves it is not
protecting the history — it is protecting a mistake, and it makes the
history say a person cooked something twice when they cooked it once.

So the defence moves from a prohibition to a question, and the question is
about the food rather than about the database, because that is the thing
the caller reliably knows:

> **Did the food change, or is the record wrong?**

If the food changed, `revise_recipe` — it appends a version and the old one
stays readable. If the record is wrong, `update_recipe`, `update_revision`
or `update_note`. That sentence is in both tool descriptions, in the server
instructions and in `get_started`, and it is the sentence whose absence
costs a history: an agent that corrects a revision when it meant to add one
writes over the version somebody cooked from.

Database size is not a reason for any of this. It was considered and it does
not matter at this scale.

### The columns, and the six tables that carry them

```sql
deleted_at        timestamptz NULL
deleted_by        text        NULL
deleted_reason    text        NULL
deleted_event_id  uuid        NULL
```

On `recipes`, `recipe_revisions`, `notes`, `experiments`, `ingredients` and
`taxonomy_terms`. Eleven other tables deliberately do not carry them:

- **Children** — `recipe_ingredients`, `recipe_steps`, `recipe_mass_flows`,
  `recipe_mass_flow_stages`, `note_sources`, `experiment_items`,
  `experiment_observations`. Their lifetime is their parent's, and every read
  that reaches them starts from a live parent, so the parent's filter is
  theirs. See the Conventions bullet on replacing a child with its parent.
- **Link tables** — `recipe_terms`, `recipe_step_ingredients`,
  `ingredient_relations`, `recipe_links`. A link has no identity worth
  keeping, and every read joins it to the thing it points at — which is now a
  view — so an edge to a deleted tag is already invisible. A flag here would
  be a second way to hide the same edge. **Invisible is not the same as
  safe**, though, and that cost one round: `applyTaxonomy` and `applyLinks`
  replace their list wholesale, `get_recipe` does not show an edge whose
  target is deleted, and a caller sending back the list it was shown
  therefore could not keep one. The edge was hard-deleted with no way to get
  it back. Both now delete only the edges whose target is LIVE, so the edge
  to a deleted row survives the rewrite and comes back with the restore.
- **`mcp_audit_log` must never be deletable.** A trail that can be hidden is
  not a trail.

`deleted_at` and not `is_deleted`, because a timestamp answers _when_, which
both the bin listing and the restore order need, and because it is already
this repository's vocabulary for a row that stopped counting at a moment:
`mcp_access_tokens.revoked_at`, `mcp_auth_codes.consumed_at`.

`deleted_by` is denormalised on purpose and the audit log is not enough for
it. `writeMcpAudit` is fire-and-forget and swallows its own failure into a
`console.warn`; nothing reads `mcp_audit_log`; that table records tool
_calls_ while the bin needs row _state_; and `pnpm ingest` reaches the write
layer with no principal at all. So `deleteRecord` takes an explicit
`actor: string | null` and `tools.ts` passes `principal.userId`. That is the
one new thing the write layer learns.

### The cascade stamp, and how restore stays exact

Every delete mints one `eventId` and writes it — with the date, the actor
and the reason — to every row it touches, the root included. Each `UPDATE`
carries `AND deleted_at IS NULL`, so **a row that was already deleted is
skipped and keeps its own stamp**. A restore reads the addressed row, takes
its `deleted_event_id`, and clears all four columns on every row carrying
that id.

The addressed row is also read `FOR UPDATE`, because the predicate alone was
not enough. `withTransaction` runs at READ COMMITTED, so two connectors
deleting one record both read it live and both write: the cascade was safe —
the loser's UPDATEs matched nothing — but the root's was not, and the loser's
event id overwrote the winner's on the root while the children kept the
winner's. `restore_record` clears by the root's id, so it brought back the
root alone and left a live recipe whose `current_revision_id` named a deleted
revision. The lock is the same answer `describeMechanism` takes for the same
shape; `docs/mcp-connector.md` states the reasoning.

### The lock order, and the recipe-tree mutex

Two rows taken in two orders is a deadlock, and a deadlock in a delete is
worse than the bug it would be fixing: Postgres kills one transaction and the
caller is told _An internal error occurred_. So the rule is written down
once, in `write.ts` under `THE LOCK ORDER`, and it is **`recipes` is locked
LAST**. Every writer that touches a recipe and something below it reaches the
recipe row at the end — `reviseRecipe`, `updateRevision`, `updateRecipe`, and
deleting an ingredient, a tag or a revision.

A delete or a restore addressing a **recipe** is the one exception and cannot
be anything else: the recipe is the row it addresses, so it locks that first
and cascades to the revisions after. That leaves exactly one pair in opposite
orders — a recipe delete against a revision delete of the same recipe — and
both functions therefore take a per-recipe `pg_advisory_xact_lock` as the
FIRST statement of the transaction, before any row lock at all. A transaction
can never be holding a row somebody else wants while it waits for that, so it
cannot be one edge of a cycle; and holding it, the two orders never meet.
Forced open with a `pg_sleep` between the two locks, that pair deadlocks 6
times out of 6 without the mutex and 0 times out of 6 with it.

### Why the pointer is read under the recipe row's lock

`current_revision_id` must name a LIVE revision. `deleteRecord`'s revision
branch reads it and may move it, and unlocked that was a check-then-act
across two rows that lost to itself: two calls deleting two **different**
revisions of one recipe both read the pointer before either committed, A
moved it onto B's target, and B — holding the value it read before A ran —
saw a pointer that did not name its own target and left it alone. Both
committed and the pointer named a deleted revision. The page still drew,
because `getRecipeBySlug` falls back to the newest live revision, but the
page foot lost its effectivity line, `update_recipe` reported a deleted
revision number as a success, and `reviseRecipe` carried the deleted
revision's ingredients and steps into a new **live** revision — deleted
content public again with no restore called.

So the pointer, the survivor list and the "only version" refusal are all read
after `FOR UPDATE` on the recipe row, and `updateRecipe` re-reads the
revision it is about to point at under the same lock rather than trusting the
check it made before. `reviseRecipe` also refuses to read a deleted revision
as the one it supersedes: that is the backstop, not the fix, and it is there
because a wrong pointer does more damage at that read than anywhere else.

That makes the child-deleted-first case need no bookkeeping. Delete note N,
then later delete its recipe R: N is skipped and keeps its own date and its
own reason, restoring R does not bring N back, and `restore_record` on N is
what does.

The trees, children first: a recipe takes its revisions, its notes and its
runs; a revision takes its notes, and runs pinned to it are **not** touched,
because the run happened — the batch log keeps the number and reads
_withdrawn_; a run takes its notes; an ingredient and a tag take their notes
and then refresh the search vector of every recipe that referenced them.

**Those two refreshes are not optional and no display test can catch them.**
`drizzle/0001_search_indexes.sql` folds tag labels into weight B and
ingredient names into weight D of `recipes.search_vector`, and the triggers
fire on `recipe_terms` and `recipe_ingredients`, not on the tag or the
ingredient row. Migration `0007` also rewrites `recipe_search_vector` itself
to skip deleted tags and ingredients — without that the refresh is a no-op
and free-text search keeps matching a word that is nowhere on the site.

One restore rule, and it is uniform:

> **A restore is refused when the record the row belongs to is still deleted.
> The refusal names what to restore first.**

A cascaded child's parent is always deleted in the same event, so addressing
the child is refused; a root's parent is always live, so clearing by event
id is exactly the right set. Restore never has to know the tree.

### Two things a delete does not do

**It does not renumber.** Revision numbers are in public URLs and in the
`nn:checked:{slug}:{revision}` browser key, and renumbering does not 404 —
it serves a _wrong_ page silently. `reviseRecipe` computes
`MAX(revision_number) + 1` over the base table, so a deleted number is
**retired and can never be reissued**. That is the second place the soft part
earns its keep: a hard delete would free the number, the next revise would
take it, and an old bookmark would quietly point at a different version.

**It does not leave a recipe with no version.** Deleting the current
revision moves the pointer to the newest survivor by
`COALESCE(occurred_at, created_at) DESC, revision_number DESC` — the ordering
the history already uses, and not `MAX(revision_number)`, for the reason
`getRecipeIdentity`'s own comment gives. Deleting the only revision is
refused. **The invariant: `recipes.current_revision_id` always names a live
revision of a live recipe**, and every child read depends on it. A restore
does **not** move the pointer back; `update_recipe { currentRevisionNumber }`
is the explicit way to say what people read.

### How every read stays filtered

Three layers, and the second is a CI gate rather than a convention.

1. **Six views.** `recipes_live`, `recipe_revisions_live`, `notes_live`,
   `experiments_live`, `ingredients_live`, `taxonomy_terms_live`, declared in
   `src/db/schema.ts` and generated into the migration. `read.ts` selects
   from nothing else.
2. **An import ban.** `eslint.config.mjs` scopes a `no-restricted-imports`
   rule to `src/lib/queries/read.ts` and refuses the six base tables by name,
   under `paths` for `@/db/schema` and under `patterns` for every relative
   spelling of the same module — `'../../db/schema'` passed the `paths` form,
   which matches a literal specifier. A new query there cannot name a base
   table, and `pnpm lint` is a CI gate. This was chosen over a shared `and(live(t), …)` helper for exactly
   that reason: a helper can be left out, an import ban cannot. Two
   exceptions, both named in comments — `listExperiments` and `getExperiment`
   import `recipeRevisionsAll` from `src/lib/queries/live.ts`, because a run
   pinned to a withdrawn version must still read its number; and `listDeleted`
   is not in `read.ts` at all. It lives in `src/lib/queries/deleted.ts`, the
   one read module allowed to see deleted rows.
3. **A census, because the lint rule cannot see inside a template literal.**
   `read.ts` has four raw-SQL sites. `e2e/deleted-census.ts` enumerates
   `Object.entries(read)`, compares that set against its own call table and
   fails when either side has an entry the other does not — so a new exported
   read function that nobody added to the table fails the suite on the day it
   lands, naming itself — then calls every one and asserts no serialised
   result carries the deleted sentinel and at least one carries the live one.

On the write side, one rule: **a write that names a deleted row by its own
key restores it when the tool is an upsert, and refuses when the tool appends
or corrects.** `resolveIngredient`, `resolveTermId`, `upsertIngredient`,
`upsertCategory` and `logExperiment` restore — naming an ingredient in a real
recipe line is proof it exists, and failing the whole recipe over a
bookkeeping state would be the wrong trade.

**By its own key means the key the CALLER wrote.** A line carried forward
unchanged is not one: `copyIngredientLines` reads the canonical name off the
base table, so echoing it back through `resolveIngredient` restored an
ingredient for any `revise_recipe` or `update_revision` that changed only the
steps — the write layer naming its own row at itself. A kept line now carries
the ingredient **id** it already held and re-uses it, whatever state that row
is in. For the same reason `collectNeedsDescription` reports live rows only:
a write result naming a deleted tag is followed by advice to call
`upsert_category` on it, and that restores it.

Everything else raises
`ConflictError` and names `restore_record`.

Two of those upserts are why `pnpm ingest` has a guard of its own, and it
covers all four seeded kinds. The recipe and the experiment passes read the
BASE table for what is already present, so a deleted row counts as present
and is skipped. The taxonomy and the ingredient passes had no such check and
write through `upsertCategory` and `upsertIngredient`, which restore — so
every seeded tag and every seeded ingredient came back on the next load, with
the notes their delete cascaded, silently, logging the word it logs for a
live row. `pnpm build` runs `pnpm ingest:deploy`, so that was a deploy
undoing an owner's delete. Both passes now read `deleted_at` first and print
a skip that names `restore_record`. **A build must not resurrect anything a
person deleted on purpose.**

### It is not called archive, and that is not a style preference

Three things in this repository already carry that word, and each means
something different:

| Thing                               | Means                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `recipes.status = 'archived'`       | Readable at its own address, off the index. `getRecipeBySlug` deliberately has no status filter. |
| the `/archive` route and `content/` | The frozen Markdown provenance, read off disk by `src/lib/archive.ts`, never the database.       |
| `deleted_at`                        | Not readable anywhere. 404.                                                                      |

A fourth meaning would make all four unreadable. **No code, comment, tool
name, description or document may use the word "archive" for a delete.** A
caller says delete; the row survives; restore brings it back.

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

`GITHUB_ISSUE_TOKEN` turns `report_issue` on. It must be a **fine-grained**
token on `RyRy79261/noble-notations` only, with **Issues: read and write**
and **Metadata: read**, and nothing else — never a classic `repo` token,
which would let this endpoint read private code and push. Without the
variable the tool is not registered at all and the guide stops naming it.
Five labels must exist before the first report (`agent-report`,
`report:bug`, `report:unclear-docs`, `report:missing-capability`,
`report:idea`); see `docs/mcp-connector.md` § Reporting a fault.

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
`upsert_category`, and the fields `categoryType` and `categories`. The
reader-facing route is `/classes`; the old `/taxonomy` and `/categories`
URLs both redirect permanently to it.

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

What decides which half a thing goes in: the instructions are paid for in
every conversation whether or not they are used, so they hold only what an
agent must know **before** its first call, one sentence each. The guide is
paid for once, by an agent that asked, so it holds the explanation. _Did the
food change, or is the record wrong?_ is in both, because an agent that
never calls `get_started` still has to answer it before it writes.

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

- Do not commit `.next/` or `build/` (git-ignored).
- This is Next.js 16. Several conventions moved: `middleware.ts` is now
  `proxy.ts`, and route params are Promises. The version's own docs ship in
  `node_modules/next/dist/docs/` — read those rather than trusting memory.
  `next dev` offers to append that advice to this file automatically;
  `agentRules: false` in `next.config.ts` turns it off so this file stays
  hand-written.
