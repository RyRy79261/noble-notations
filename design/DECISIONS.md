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
