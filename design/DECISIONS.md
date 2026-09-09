# Build Decisions

This file holds each decision the build made that the specification did not
answer. Read it before you review the branch.

Each entry says what I chose, why, and what to do to change it.

---

## D-01 — The address of a batch log with no recipe

**Status:** Decided. Change it if you disagree.
**Date:** 2026-09-09
**Touches:** R-NAV-07, R-NAV-08, K-01, §8.1

### The problem

K-01 decided that a run can name no recipe. The index at `/batch-logs`
lists every run. That part is clear.

The detail page is not clear. The design draws one address:
`/recipes/baumy-biltong/batch-logs/batch-four`. A run with no recipe cannot
use that shape. It has no recipe slug to put in it. The specification does
not say what its address is.

### What I chose

Two routes. Each run has exactly one live address.

| Route                              | Serves                                            |
| ---------------------------------- | ------------------------------------------------- |
| `/recipes/[slug]/batch-logs/[log]` | A run that names a recipe. The design draws this. |
| `/batch-logs/[log]`                | A run that names no recipe.                       |

`/batch-logs/[log]` also answers for a run that **does** name a recipe. It
then redirects to the nested address. This keeps one canonical address for
each run and gives a stable address to link to before the recipe exists.

The old address `/experiments/[slug]` redirects to `/batch-logs/[slug]`.
A redirect in `next.config.ts` cannot read the database, so it cannot know
the recipe. The second hop does that.

### The other option

Make the top level `/batch-logs/[log]` the only detail address, and drop
the nested one. This is simpler. It disagrees with the design, which draws
the nested address on two screens.

### To change it

Delete `src/app/recipes/[slug]/batch-logs/[log]/page.tsx` and remove the
redirect in `src/app/batch-logs/[log]/page.tsx`.

---

## D-02 — The conditions on a mechanism block

**Status:** Parked. **This one needs your decision.**
**Date:** 2026-09-09
**Touches:** R-SCR-41, §10.9, K-04

### The problem

The design draws a mechanism block on `/science/[slug]`. Each block shows a
code, a name, an explanation and a row of conditions:

```
M1   Maillard browning of the bone surface
     Amino acids and reducing sugars recombine above roughly 140 °C …
     232 °C · 45 MIN · SINGLE LAYER ON A RACK
```

R-SCR-41 says the conditions **MUST** be separate values. It says not to
write them into a sentence.

The database cannot hold them. A mechanism is a science note. The `notes`
table holds `kind`, `title` and `body` and nothing else. There is no field
for a temperature, a time or a depth.

### What I built

The mechanism block reads `conditions: string[]` from the view. The row is
absent when the list is empty. The list is empty for every note today.

Everything else on `/science` works now: the note body, the citations
(R-SCR-42 is met by `note_sources`), the link back to the recipe, and the
empty state.

### Your two options

**Option A — add the field.** One migration adds `conditions text[]` to
`notes`. `src/lib/domain/schemas.ts` and the MCP tools then accept it. An
agent can write a mechanism with real conditions.

- Cost: a schema change, a migration, one MCP tool change, and a backfill
  of the notes that already exist.
- Gain: R-SCR-41 is met. The screen matches the design.

**Option B — leave it.** The block ships with no conditions row.

- Cost: R-SCR-41 is not met. The screen is thinner than the design.
- Gain: nothing changes outside the user interface.

**I would take Option A.** The field is small, the migration is additive,
and the design already draws the row. Option B ships a screen that the
design says is wrong.

I did not take it without you, because the specification says in §1.2 that
it does not cover the database schema. A schema change is your call.

---

## D-03 — The old stylesheet stays until M7

**Status:** Decided.
**Date:** 2026-09-09
**Touches:** R-CON-12

`src/app/globals.css` holds 1,892 lines. M1 added Tailwind beside it rather
than in place of it.

`src/app/theme.css` pulls `globals.css` into a cascade layer. A Tailwind
utility can then beat an old element rule, and a screen that is not yet
rebuilt keeps working.

This keeps the site usable and the tests green at each milestone. M7 removes
the old stylesheet and turns Tailwind preflight on.

The other option was to remove it in M1. The site would then look broken
until M6 finished, and the end-to-end tests would fail for the whole build.

---

## D-04 — The rename reaches the page copy in M2, not M6

**Status:** Decided. Change it if you disagree.
**Date:** 2026-09-09
**Touches:** §3, §8.2, R-NAV-07

### The problem

M2 is routes and data. It nonetheless had to write the nav, because §8.2
names the nine items and the design labels them Classes, List and Batch
logs. That left the site contradicting itself: the nav said "Classes" and
the page it opened was headed "Categories"; the nav said "Batch logs" and
the page was headed "Experiments".

### What I chose

Finish the rename on the pages the nav points at. Four one-word edits, no
styling:

| Screen             | Was         | Now            |
| ------------------ | ----------- | -------------- |
| `/classes`         | Categories  | Classification |
| `/classes/…` trail | Categories  | Classification |
| `/batch-logs`      | Experiments | Batch logs     |
| `/batch-logs/…`    | Experiments | Batch logs     |

The words are the design's own: `classes-cuisines-1280.html` is headed
"Classification" and its tag trail reads CLASSIFICATION;
`batch-logs-1280.html` is headed "Batch logs".

**`/list` keeps the heading "Shopping list".** That is not an oversight and
it is not the old name surviving. `list-search-archive-1280.html` draws that
screen with the kicker "SECTION VI · LIST" and the title "Shopping list".
The nav item and the button are named after the route; the hero says what
the page is. §3 agrees: "the code calls this the basket, the interface calls
it the list", and the list is a shopping list.

`category` stays the database's word — `listCategories`, `categoryType`,
`list_categories` — exactly as AGENTS.md says.

### The other option

Revert the nav and button copy and leave the whole rename to M6. Rejected:
§8.2 fixes the nine labels and M2 had to write that array, so the split
could not be closed from that end.

---

## D-05 — What "Applied in" means, and what counts as a study

**Status:** Decided. Change it if you disagree.
**Date:** 2026-09-09
**Touches:** §10.9, R-SCR-40, K-04

### A study is not only a research recipe

`/science/[slug]` answers for a recipe of the `research` kind **or** any
recipe carrying a science note — otherwise a mechanism would have nowhere
to be read. The index's STUDIES block first listed research recipes only,
so `/science/demi-glace` answered with no card anywhere that reached it,
and demi-glace is the study the design draws. The two now apply one rule.

### The direction of an edge

"Applied in" is the recipes that lean on this study, and which end of a
`recipe_links` row says so depends on its kind.

| Kind                                       | Which edge means "applies this" |
| ------------------------------------------ | ------------------------------- |
| `references`, `derived_from`, `variant_of` | incoming                        |
| `component_of`                             | outgoing                        |
| `pairs_with`                               | neither                         |

Reading every incoming edge printed the seeded link backwards: demi-glace
is `component_of` beef-wellington-technique, which means the Wellington
leans on demi-glace, and the study page claimed the reverse.

### The codes

`M1…` is a position **within its recipe** on both science screens. Numbering
the index across every recipe gave demi-glace's one mechanism the code M5 on
`/science` and M1 one click later. A code that means one thing everywhere is
a column on `notes` — that is D-02, and it is still yours.
