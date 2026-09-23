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
.claude/skills/           repository skills. writing-style/ holds the ASD STE
                          rule; the connector serves the same rule as the
                          resource noble-notations://writing-style
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

And two relationships between recipes: **links**, four editorial edges in
`recipe_links`, and **variations**, one structural edge in
`recipes.variant_of_id`. See _A variation is a recipe, not a revision_.

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
- **A note's text is fixed; where it hangs is not.** `reattachNote` moves a
  note to another record and touches nothing a reader reads — kind, title,
  body, conditions, sources and `created_at` all survive byte for byte.
  This is not a hole in the rule above: a note's content being immutable
  and its location being immutable are two decisions, and only the first
  follows from the revision rule. The choice of parent is usually forced by
  what happens to exist yet, and a note written against a batch because the
  recipe did not exist was otherwise stranded there for good. A note pinned
  to a revision or a step is refused, because that one really is a
  statement about a stored version. Every previous home is kept in
  `notes.previous_subjects` — the audit log cannot hold it, since an audit
  row is built from the arguments a call was made with and so names only
  the destination. This is D-13.
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

## A variation is a recipe, not a revision

Dan dan noodles with shiitake instead of pork is not revision 4 of dan dan
noodles. Nothing was learned and the pork version was not superseded, so a
revision is the wrong record and an expensive one: it moves
`current_revision_id`, and the dish somebody came to read stops being on its
own page.

It is a **variation** — a recipe of its own, with its own slug, its own
revisions and its own batch logs, saying which dish it came from. That is
one column, `recipes.variant_of_id`, and one line beside it,
`recipes.variant_note`. This is D-17.

The question that separates a revision from a correction has a third answer:

| The dish                     | The tool         |
| ---------------------------- | ---------------- |
| got better                   | `revise_recipe`  |
| went a different way         | `create_variant` |
| is fine, the record is wrong | `update_recipe`  |

**It is a column and not a `recipe_links` row, and that is the whole
decision.** `variant_of` was a fifth link kind until migration `0010` and
could hold none of what a variation needs: `uq_recipe_link` let a recipe
belong to two families at once, nothing refused a cycle because nothing read
those edges as a tree, and `applyLinks` replaces a recipe's whole link list
— so a caller echoing back what `get_recipe` showed it dropped its own
parentage, silently, along with the panel and the breadcrumb that depend on
it. That is the same shape as the link-table bug recorded below, with more
to lose. The four remaining kinds are editorial remarks about two finished
dishes and keep their wholesale-replace contract, which is right for what
they are.

**`variantOf` on `update_recipe` is not a list and has three states.** Absent
leaves the family alone; a slug moves the recipe into that family; `null`
makes it a dish of its own again and clears `variantNote` with it. It is how
a wrong parent is corrected and how a family is split — `create_variant` is
how one is made.

**Nothing carries forward into a variation.** The rule `backfillRevision`
has, for the same reason: inheriting the parent's ingredients records a dish
nobody cooked, and the part that differs is why the variation exists.

**The panel shows the whole family from any member.** `variantFamily` in
`read.ts` climbs to the base dish and comes back down, so a reader standing
on one variation sees the dish it came from, its siblings and its own branch
— the same tree from every member. Membership is one rule covering two
cases: **live, not a draft — or this recipe itself.** A deleted recipe is
not a node, so the family breaks at the gap and `restore_record` rejoins it
exactly; a draft breaks it the same way, because `draft` means hidden from
listings and a panel on a public page is a listing. The exception is what
lets a draft variation see its own family while it is being written.

**Two guards keep it a tree.** `variant_not_self` is a CHECK, because no
write path can reach around a constraint. Longer cycles are
`assertNoVariantCycle`, a recursive walk up from the proposed parent — and
it is check-then-act across two rows, so it takes `VARIANT_GRAPH_LOCK`
first. That lock has one rule, stated where it is defined: **a writer takes
at most one advisory lock, and takes it first**, which is what keeps it from
ever meeting `RECIPE_TREE_LOCK`. The walk uses `UNION` rather than `UNION
ALL` so that a cycle somebody wrote by hand is reported instead of spinning
a backend; `variantFamily` carries `VARIANT_DEPTH_LIMIT` for the same
reason, because a loop there is a page that hangs rather than a page that is
wrong.

## Delete is soft, and it is called delete

The connector has full CRUD. Every record an agent can create it can now
update and delete, and a delete is soft: the row stays, it stops being
visible, and it can be restored. `delete_record` takes seven kinds — a
recipe, a version, a note, a run, an ingredient, a tag and an image.

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

On `recipes`, `recipe_revisions`, `notes`, `experiments`, `ingredients`,
`taxonomy_terms` and `images`. Twelve other tables deliberately do not carry
them:

- **Children** — `recipe_ingredients`, `recipe_steps`, `recipe_mass_flows`,
  `recipe_mass_flow_stages`, `note_sources`, `experiment_items`,
  `experiment_observations`, `experiment_images`. Their lifetime is their
  parent's, and every read
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
ingredient row. Migration `0009` also rewrites `recipe_search_vector` itself
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

1. **Seven views.** `recipes_live`, `recipe_revisions_live`, `notes_live`,
   `experiments_live`, `ingredients_live`, `taxonomy_terms_live`,
   `images_live`, declared in `src/db/schema.ts` and generated into the
   migration. `read.ts` selects from nothing else.
2. **An import ban.** `eslint.config.mjs` scopes a `no-restricted-imports`
   rule to `src/lib/queries/read.ts` and refuses the seven base tables by
   name,
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

## Images

Two tools put a picture into this repository. Issue #54 is why the first
exists: every image field took a web address and nothing here could make
one, so an agent holding a photograph could not fill any of them.

**A photograph never passes through the model.** That is issues #56 and #58,
and it is the rule to keep. The model writes every character of a tool call,
so a photograph sent as base64 is millions of tokens: it fills the context
and fails. `request_image_upload` returns a one-hour, one-picture link; the
person opens it and picks the file; the browser writes the original straight
to the blob store (a Vercel function refuses a body over 4.5 MB); the server
shrinks it and puts it on the record the link named. `upload_image` keeps
`sourceUrl`, fetched by the server behind an SSRF guard, and `data`, which is
for a small picture the agent made. `docs/mcp-connector.md` § _Getting a
photograph in_ has the design.

The bytes go to **Vercel Blob**. The row goes in `images`, the seventh
soft-deletable table. **What a recipe stores is `/images/<id>` — this site's
own address, never the blob's** — and that is the decision the rest follows
from. A reference to a picture is a text column and not a foreign key (a
recipe may point at somebody else's site), so deleting an image row cannot
touch the rows naming it. Serving from `/images/[id]`, which reads
`images_live`, makes one soft delete take the picture off every record at
once and a restore bring them all back, with no stored revision rewritten.
The alternative was a delete that edited versions people cooked from in
order to hide a photograph. `docs/mcp-connector.md` § _Images_ has the
rest, including the four questions the issue left open and what each was
answered with.

**There is no `delete_image`.** The issue asked for one; `image` is a kind
of `delete_record` instead. See § _Delete is soft, and it is called delete_ —
a second delete verb would need a second undo, and then there are two
answers to "how do I get it back".

Three records gained `hero_image_url` and `hero_image_alt` with this:
ingredient, experiment and taxonomy term. A run also gained a LIST,
`experiment_images`, because a run is the record a photograph is worth most
to and one run produces several.

`sharp` resizes and re-encodes on the way in — 2400 pixels on the longest
edge, WebP, with anything over 25 MB refused — and makes 480, 960 and 1600
pixel copies beside it. `/images/<id>?w=` picks between them and the site's
`<img>` tags name them in `srcset`. Every way in goes through
`src/lib/images/ingest.ts`, so the three cannot drift. `@vercel/blob` is
behind `src/lib/images/blob.ts` and nothing else imports the server SDK;
the upload page imports `@vercel/blob/client` for the browser `put`.

**`upload_image` and `request_image_upload` are registered only when
`BLOB_READ_WRITE_TOKEN` is set**, the same way `report_issue` depends on
`GITHUB_ISSUE_TOKEN`. It is set in Production and Preview and on neither a
developer's machine nor CI, so `pnpm build` and every gate stay green
without it, and the guide describes the tools only where they exist. The
e2e suite sets a stub token and points `VERCEL_BLOB_API_URL` (and, for the
browser, `NEXT_PUBLIC_VERCEL_BLOB_API_URL`) at `e2e/blob-stub.ts`, so the
suite never reaches
blob.vercel-storage.com — the same guarantee `e2e/github-stub.ts` gives for
GitHub.

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

`BLOB_READ_WRITE_TOKEN` turns `upload_image` and `request_image_upload` on. The Vercel Blob
integration sets it, along with `BLOB_STORE_ID` and
`BLOB_WEBHOOK_PUBLIC_KEY`, in Production and Preview; this repository reads
only the first. Without it neither tool is registered, the guide stops
naming them, and every other tool works unchanged — so a local database
and `pnpm build` need nothing.

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

| Job               | What it does                                       |
| ----------------- | -------------------------------------------------- |
| `changes`         | Path filter; only gates `e2e`                      |
| `quality`         | format check → lint → typecheck → production build |
| `e2e`             | Playwright against a throwaway Postgres service    |
| `migration-drift` | `pnpm db:generate` must leave `drizzle/` unchanged |
| `supply-chain`    | `pnpm audit --audit-level high`                    |
| `ci-pass`         | Aggregate; **this is the required status check**   |

Before pushing:

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm build
```

The build does not need a database: its migration step skips when
`DATABASE_URL` is absent. Neither does `migration-drift` — `drizzle-kit
generate` reads `src/db/schema.ts`, not a server.

Require `ci-pass` in branch protection, not the individual jobs. A skipped
job never reports a status, so requiring a job that is allowed to skip
(`e2e`, on a docs-only PR) blocks the PR forever. `ci-pass` always reports
and checks the others itself.

`.github/workflows/neon-pr-cleanup.yml` deletes the `preview/<branch>` Neon
branch that the Vercel integration creates for a PR's preview deployment,
when the PR closes. It needs the `NEON_API_KEY` and `NEON_PROJECT_ID` repo
secrets and fails loudly without them — an unnoticed leak fills the project's
branch quota. CI itself never touches Neon: every DB-backed job brings its
own throwaway Postgres.

Dependency updates come from `.github/dependabot.yml`, weekly and grouped.
The grouping is load-bearing rather than cosmetic: `next`, `react`,
`tailwindcss` and `@playwright/test` are each exact-pinned alongside a
package that must carry the same version, so an ungrouped bump opens two PRs
that each fail on their own. Add to a group before pinning something new.

## Words and writing style

**User-facing text uses ASD Simplified Technical English.** Short
sentences. One idea in each sentence. Active voice. No word that needs
another word to explain it. This applies to page copy, MCP tool
descriptions and the agent guide — not to code comments, which explain
_why_ and need their full vocabulary.

**It applies to the recipes too, not only to the shell around them.** A
title, a summary, a step, a rationale, a note and the explanation on a tag
or an ingredient are all read by a cook, usually on a phone and usually
mid-task. Write a step as one instruction: "Cut the beef into strips of
10 mm", not "the beef is then butterflied and cut down". Give a number and
a unit for every amount, time and temperature; if nobody measured it, say
so in a note rather than writing "a good glug". The one exception is a
quotation from a source, which is copied exactly.

Most recipes arrive through the connector, so the rule is stated where an
agent reads it: `howToWrite` in `src/lib/mcp/guide.ts` is the long version,
`PLAIN_ENGLISH` in `src/lib/mcp/tools.ts` is the reminder appended to every
write tool that stores prose, and the short instructions carry a paragraph
of it. Those three move together, and `e2e/auth-guide.spec.ts` fails if one
of them loses it; `/llms.txt` states it once more, for an agent that only
ever scrapes the site. This is D-14.

**The rule is also a skill and a document you can load.**
`.claude/skills/writing-style/SKILL.md` is the copy a person working in this
repository reads, and the copy Claude Code loads when it is about to write
or review any word a reader sees. The connector serves the same rule as the
MCP resource `noble-notations://writing-style`, so an agent can pull it in
once and hold it for a session instead of re-reading the whole guide.

Those two are separate copies ON PURPOSE, and
`src/lib/mcp/resources.ts` gives the reason: the connector runs in a Vercel
function, Next traces the files a route needs from its imports, and a path
built at runtime traces nothing — a connector that read the skill file off
disk would fail in production and pass every local test. The copies cannot
drift in silence: `e2e/writing-style.spec.ts` enumerates the rules and
fails, naming the rule, when one copy states something the other does not.
Change one and change the other in the same commit.

**A screen says what it found, not how it works.** Issue #21 is the record:
`/search` printed its HTTP method, the query string its form produced and
how many fields there were to clear, and read as a debug view of itself. A
reader came to cook. Copy that explains the build — the transport, the
revision machinery, how to connect an agent — belongs on `/connect`, in
`AGENTS.md` or in a code comment, not in a lede or a band. `/connect` is
the one exempt screen, because the protocol is its subject.
`e2e/site.spec.ts` sweeps every other screen for the jargon. D-14 took the
home page's HOW THIS WORKS band out under this rule, and cut each lede back
to what a reader can act on.

The word "taxonomy" is not used anywhere a person or an agent reads. The
vocabulary is:

| Say                                         | Not                             |
| ------------------------------------------- | ------------------------------- |
| Categories                                  | Taxonomy, classification        |
| Category type (cuisine, course, technique…) | Facet                           |
| Tag                                         | Term                            |
| Batch log                                   | Experiment (reader-facing only) |

**The database columns did not change.** `taxonomy_terms.facet` is still
`facet`, and `CategoryType` is an alias over the same enum. Renaming those
columns would be a destructive migration in exchange for a vocabulary
change, which is a bad trade. The mapping happens at the query boundary:
`TermView.categoryType` reads from `taxonomyTerms.facet`.

MCP names follow the same vocabulary: `list_categories`,
`upsert_category`, and the fields `categoryType` and `categories`. The
reader-facing route is `/classes`; the old `/taxonomy` and `/categories`
URLs both redirect permanently to it.

**A batch log and an experiment are the same record.** The reader's word
won the URL — `/batch-logs`, with `/experiments` redirecting permanently to
it — and everything under the reader keeps the other word: the
`experiments` table, `ExperimentView`, and the `list_experiments`,
`get_experiment` and `log_experiment` tools. Unlike the categories rename,
this split reaches an agent, because an agent reads the tool names and then
looks at the site. That is what issue #19 was: a connector that only knew
`experiment` could not find a page that had existed since the rename, and
reported it as missing. So the guide names both words and the addresses.

## Note kinds

`science` and `research` are the two that get confused, and the split is
deliberate:

- **science** — what is physically or chemically happening _in the dish_,
  and why a technique works. "Duxelles is a moisture barrier, not a flavour
  layer." Rendered in its own section at the bottom of a recipe.
- **research** — what was learned _around_ the dish afterwards:
  alternatives, hacks, sourcing, background. "Where to buy crayfish in
  Berlin."

A `research` note must carry at least one source.
`requireSourcesForResearch` in `src/lib/domain/schemas.ts` enforces it on
all five note paths — `add_note`, and the `notes` array on `create_recipe`,
`revise_recipe`, `backfill_revision` and `log_experiment`. No other kind
requires one and no kind forbids one: `writeNotes` stores `sources` for
every kind, and the study reader filters citations by subject rather than
by kind (see the comment in `src/lib/queries/read.ts`, which notes that the
Wellington's one source hangs off a `warning`). A note with nothing to cite
is an `observation` or an `idea`, not an unsourced `research`. A source
entry must itself name something — `noteSourceSchema` refuses `{}`, a blank
string and a bare `accessedAt` — so one empty object does not satisfy the
count.

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

**The guide must also name the website's words and its addresses.** An
agent writes through the connector and is then asked about the result by
someone looking at the site, so it needs to know what the site calls the
thing it just wrote and where that thing now is. A connector that knows
only `experiment` cannot answer "where is it" about `/batch-logs`. Keep the
addresses in the guide relative: `NEXT_PUBLIC_SITE_URL` is set nowhere
here, so `site.url` falls back to the production host and an absolute
address would be wrong on every preview deployment.

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
