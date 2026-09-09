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

---

## D-06 — One file per design component, or one file per family

**Status:** Decided. Change it if you disagree.
**Date:** 2026-09-09
**Touches:** R-CMP-16, R-BLD-03, §9.5

### The problem

The M3 brief says "Each F/Name becomes `src/components/f/<name>.tsx`" and
names 22 components. There are 13 files. R-CMP-16 says a build **MUST** use
the design's component names, and two exports carried names the design
never uses — `PrimaryNav` and `NavDrawer`.

### What I chose

**The exported symbol carries the design's name. The file groups a family.**

A name a reader greps for is a symbol, not a path, and the design's own
families share their measurements: `F/Mark` and `F/Mark quiet` differ by a
ground, `F/Site header` and `F/Site header 360` by one step of every value.
Splitting those apart duplicates a constant into two files, where the two
can drift and no reviewer sees both at once.

Two exports were renamed to the design's words, so the design is greppable
from the code and back:

| Was          | Now           | The design's name            |
| ------------ | ------------- | ---------------------------- |
| `PrimaryNav` | `Navigation`  | `F/Site header > Navigation` |
| `NavDrawer`  | `Contents360` | the frame `Contents — 360`   |

`Contents360` drops the em dash, which is not an identifier. Nothing else
about either changed.

### The map from F/ name to file

| F/ name                    | File                  | Export         |
| -------------------------- | --------------------- | -------------- |
| F/Skip link                | `f/skip-link.tsx`     | `SkipLink`     |
| F/Site header              | `f/site-header.tsx`   | `SiteHeader`   |
| F/Site header 360          | `f/site-header.tsx`   | `SiteHeader`   |
| F/Site header > Brand      | `f/site-header.tsx`   | `Brand`        |
| F/Site header > Navigation | `f/nav-drawer.tsx`    | `Navigation`   |
| Contents — 360             | `f/nav-drawer.tsx`    | `Contents360`  |
| F/Page head                | `f/page-head.tsx`     | `PageHead`     |
| F/Page head 360            | `f/page-head.tsx`     | `PageHead`     |
| F/Page hero                | `f/page-head.tsx`     | `PageHero`     |
| F/Page foot                | `f/page-foot.tsx`     | `PageFoot`     |
| F/Breadcrumb               | `f/breadcrumb.tsx`    | `Breadcrumb`   |
| F/Section label            | `f/section-label.tsx` | `SectionLabel` |
| F/Section 360              | `f/section-label.tsx` | `Section360`   |
| F/Mark                     | `f/mark.tsx`          | `Mark`         |
| F/Mark quiet               | `f/mark.tsx`          | `MarkQuiet`    |
| F/Tag                      | `f/tag.tsx`           | `Tag`          |
| F/Tag CTA                  | `f/tag.tsx`           | `TagCTA`       |
| F/Tag hierarchy            | `f/tag.tsx`           | `TagHierarchy` |
| F/Button                   | `f/button.tsx`        | `Button`       |
| F/Field                    | `f/field.tsx`         | `Field`        |
| F/Filter                   | `f/field.tsx`         | `Filter`       |
| F/Notice                   | `f/notice.tsx`        | `Notice`       |
| F/Empty                    | `f/notice.tsx`        | `Empty`        |
| F/Stat                     | `f/stat.tsx`          | `Stat`         |
| F/Measure                  | `f/stat.tsx`          | `Measure`      |

M4 adds its fifteen under the same rule.

### To change it

Split each family into its own file and re-export from the family file so
no caller changes. It is a mechanical move; the constants each family shares
have to move to a fourth file rather than be copied.

---

## D-07 — The page foot's left slot is a document issue, not a copyright

**Status:** Decided. **Worth your eye.**
**Date:** 2026-09-09
**Touches:** C-04, §9.1, R-CMP-16

### The problem

C-04 in §9.1 says the site footer "holds the copyright, the connector link
and the source link". The design draws no copyright. `grep -o '©'` over all
eighteen exports returns nothing. What the design draws in that slot is an
effectivity or provenance statement in mono capitals —
`EFFECTIVITY: SIXTH REVISION AND ON`, `EVERY RUN, LINKED OR NOT`,
`COMPILED 08 SEP 2026 · TWENTY-SEVEN INGREDIENTS` — and, on every screen
with no effectivity of its own (`/connect`, `/connect/done`, `/sign-in`,
404), the document issue `ISSUE 01 · 08 SEP 2026`.

The build was carrying `© 2026 NOBLE NOTATIONS` into that slot, uppercased,
on all 22 routes, because the pre-M3 layout said it.

### What I chose

The default is the design's own generic left slot: `site.issue`, which is
`Issue 01 · 08 Sep 2026`. It is a constant in `src/lib/site.ts` and not a
computed date, because a document issue changes when the document is
reissued and not when the clock does. Each screen overrides it with its own
effectivity as M4 to M6 rebuild it.

The copyright is gone from the user interface. BUILD-PLAN §2 makes the
design the source of truth for how a screen reads, no R-numbered rule asks
for a copyright, and no test asserted one.

### To change it

Restore it as a fourth slot, or pass it as `left` from the layout. Do not
put a © inside the drawn slot: it is set in mono capitals, which is not how
a copyright notice is written.

---

## D-08 — An explanation on a tag requires a term page

**Status:** Decided.
**Date:** 2026-09-09
**Touches:** R-ACC-10, R-CMP-03, C-07

### The problem

`F/Tag` shows its explanation in a Radix tooltip, and Radix never opens a
tooltip for a coarse pointer: `onPointerMove` returns early for
`pointerType === 'touch'`, `onPointerDown` closes it and raises a flag, and
the `onFocus` that follows the tap is suppressed by that flag. R-ACC-10 asks
for a path that is not hover.

The old build's answer is at `globals.css` line 752, in its own words:
"Coarse pointers have no hover … Tapping the tag navigates to the term page,
which shows the same blurb as body text." That answer needs somewhere to
tap through to. The M3 primitive allowed an explanation on a tag with no
`href`, which rendered a focusable `<span>` with no role, no destination and
no route to its own text on a phone.

### What I chose

`TagProps` and `HierarchyTerm` are unions: an `explanation` requires an
`href`. The unreachable shape is not representable rather than documented.
C-07 describes the same pairing — "It links to the term page. It shows the
term explanation" — so nothing the design draws is lost, and the tap-through
fallback the old build relied on always exists.

### The other option

Render the explanation as visible text under `@media (hover: none)`, or make
the trigger a toggle button that opens the panel on click. Both add a second
drawing the design does not have, at a width the design does draw.

### To change it

Relax the union in `src/components/f/tag.tsx` and add a coarse-pointer path
in the same commit. Do not relax it alone.

---

## D-09 — The bridge carries colour, not the faces or the radius

**Status:** Decided. This is the orchestrator's ruling on M3.
**Date:** 2026-09-09
**Touches:** R-CON-12, D-03

### The problem

M3 asked the palette bridge to carry colour, the faces and the radius, so
that every screen not yet rebuilt would adopt all three at once.

The bridge carries colour only. `design/TOKEN-MAP.md` §10.4 gives three
reasons. Each one is real:

1. The Tailwind font stacks end in no generic family, so a face that fails
   to load has nothing to fall back to.
2. `--measure: 68ch` is the width of a text block. Geist is wider than the
   system stack, so the measure grows by about 8 per cent. Every old screen
   would reflow.
3. Both gates run in the light theme. A reflow in the dark theme would not
   be caught.

### What I decided

**Accept it.** The bridge carries colour.

A reader now sees two faces on an old screen: Newsreader and Geist in the
shell, the system stack in the body. A reader also sees two radii: 2px in
the shell, 12px on an old card.

This is a temporary state and it is cheap to hold. M4 to M6 rebuild every
one of those screens, and each rebuild takes the design's faces and the
design's radius with it. Bridging the faces now would reflow 20 screens
that we are about to delete, and it would risk the audit baseline for no
lasting gain.

### The cost

The site looks mixed until M6 ends. That is the cost of the whole
coexistence strategy in D-03, not a new cost.

### To change it

Add the three properties to the bridge block in `src/app/theme.css`, then
re-run `pnpm audit:ui` at all four widths in both themes and fix what
reflows.
