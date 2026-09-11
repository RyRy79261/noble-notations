# Build Decisions

This file holds each decision the build made that the specification did not
answer. Read it before you review the branch.

Each entry says what I chose, why, and what to do to change it.

The build is complete. This table is the state of each decision after M7.
An entry that a later milestone settled says so in place.

| ID   | Decision                                                | State after M7                                                                       |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| D-01 | The address of a batch log with no recipe               | Built in M2. Two routes, one canonical address for each run.                         |
| D-02 | The conditions on a mechanism block                     | Option A built in M5.5. M6 fixed the drawing and seeded 9 notes. **Met, and drawn.** |
| D-03 | The old stylesheet stays until M7                       | **Done. M7 deleted the file, the layer and the bridge, and turned preflight on.**    |
| D-04 | The rename reaches the page copy in M2                  | Built in M2.                                                                         |
| D-05 | What "Applied in" means, and what counts as a study     | Built in M2. M6 seeded the 4 missing demi-glace mechanisms.                          |
| D-06 | One file per design component, or one file per family   | Held for the whole build. 25 files carry 36 design names.                            |
| D-07 | The page foot's left slot is a document issue           | Built in M3. M6 gave each screen its own effectivity through `src/app/@foot/`.       |
| D-08 | An explanation on a tag requires a term page            | Built in M3. The unreachable shape is not representable.                             |
| D-09 | The bridge carries colour, not the faces or the radius  | **Done. The bridge is gone. M7 deleted it with the stylesheet it fed.**              |
| D-10 | The body link is an underline                           | Built in M4.                                                                         |
| D-11 | A card summary is not cut at 160 characters             | Built in M4. C-05 of the specification is corrected in §20.7.                        |
| D-12 | Three things the design draws that the data cannot fill | The figure is built. The other two stay out. **The 360 readout is still open.**      |

Two things are still open at the end of the build, and
`design/BUILD-PLAN.md` §6 carries both:

1. The mass flow readout at 360 — D-12.
2. The batch-log ledger's 3 page-level weight figures — it belongs to the
   designer and to the data, not to a milestone.

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

**Status:** Decided. **Option A, approved and built in M5.5.**
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

### What was decided, and what M5.5 built

**Option A.** Approved, and built in M5.5 alongside D-12 — one migration
carries both, which is what the recommendation asked for.

- `drizzle/0005_mass_flow_and_conditions.sql` adds
  `notes.conditions text[] DEFAULT ARRAY[]::text[] NOT NULL`. Purely
  additive: no `DROP`, no `ALTER COLUMN`, and on PG 11+ the `NOT NULL`
  default needs no table rewrite. A note that existed before it reads back
  `{}`, never `NULL`.
- `conditions` is accepted on any note in `create_recipe`, `revise_recipe`,
  `backfill_revision` and `add_note`. Accepted on all eight kinds, not only
  `science`: an empty list on the other seven costs nothing, and refusing
  them there would have to be undone the first time a `warning` wants to
  say at what temperature it applies.
- `describe_mechanism` is the new tool for a note that is **already
  stored** — every science note in the archive was written before the
  column existed. It fills the field once and then refuses. It is not an
  edit path: it can only turn absent into present, and the answer to a
  wrong value is a note of kind `correction`, exactly as it is for a wrong
  note body.
- The row is drawn wherever a science note is drawn: `F/Mechanism` on the
  recipe screen, `NoteBlock` on `/ingredients/[slug]` and
  `/batch-logs/[log]`, and both science screens.

**"Written once" is enforced with a row lock, not by a constraint.** An
array column has no unique index to stand behind it the way
`uq_mass_flow_revision` stands behind the mass flow, and a bare
read-then-write is advisory only under READ COMMITTED — two connectors
describing the same note both read `{}`, both pass the guard, and the
second silently replaces the first. The connector is multi-client by
design, so `describeMechanism` reads `FOR UPDATE` and repeats the emptiness
test in the `UPDATE`'s own `WHERE` clause.

### What M6 did — closed

M6 closed both halves of this.

**The look.** Both science screens moved onto `F/Mechanism`. The conditions
now draw as a 9px mono run in `f-ink-3` with a middle dot between the
values, which is what the design draws, and not as the bordered 11.52px pill
badges M2 left behind.

**The data.** Migration `0006` gave `notes` a stable ordering key, so the
`M1…Mn` codes no longer fall to a random uuid. `notes.created_at` defaults
to `now()`, which Postgres holds fixed for a whole transaction, so every note
ingested with one recipe used to share a timestamp and the order fell to
`asc(notes.id)`. With the key in place M6 seeded the 4 missing demi-glace
mechanisms from `content/research/demi-glace.md`, so that study now carries 5. The same key made `pnpm export` reproducible: two runs over one seed no
longer order the notes differently.

**The field is filled on 9 notes and the row draws.** `scripts/seed-data.ts`
carries 9 `conditions` arrays and `scripts/ingest-archive.ts` writes them
through the same path `describe_mechanism` uses, so a fresh
`pnpm db:migrate && pnpm ingest` gives
`select count(*) from notes where array_length(conditions,1) > 0` the answer 9. Both science screens draw the row, and `e2e/render.spec.ts` guards it:
its six `a mechanism draws its conditions` tests fail on deleting
`f/mechanism.tsx:122-170`. R-SCR-41 is **met**.

The one residue is that no agent has called `describe_mechanism` — the tool
exists, it is exercised only by the seed's own write path, and a mechanism
somebody adds through the connector still has to be described by hand. That
is a use, not a gap in the build.

---

## D-03 — The old stylesheet stays until M7

**Status:** Decided, and **done. M7 deleted the file.**
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

### What M7 did

M7 deleted `src/app/globals.css`, deleted the `legacy` cascade layer that
held it, deleted the M3 palette bridge that fed it, and turned Tailwind's
preflight on. All four in one commit: the bridge exists only to serve the
old file, and the layer exists only to hold it, so removing one without the
others leaves dead code.

**Preflight is the risk of that change and it was measured, not assumed.**
Preflight resets margins, list styles, heading sizes, form control fonts and
image display on every element of every screen at once. M6 had already
measured the deletion of the 223 legacy CLASS rules — 19 of 20 screens
changed 0 elements — but deleting a class rule and turning a reset on are
two different changes, so M7 measured the second one on its own.

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

**Status:** Decided, and **done. The bridge is gone. M7 deleted it with the
stylesheet it fed.**
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

Nothing to change. The bridge was deleted in M7 together with
`src/app/globals.css`, and every screen it served was rebuilt before then.
The mixed state it caused — two faces and two radii on one page — ended when
M6 rebuilt the last screen.

`design/TOKEN-MAP.md` §10 keeps the full record of what the bridge did and
what it deliberately did not do. Read it if a rebuilt screen ever needs the
same trick again.

---

## D-10 — The body link is an underline

**Status:** Decided. This is M4's third invented treatment.
**Date:** 2026-09-09
**Touches:** C-11, C-12, R-ACC-01, R-BLD-02, §9.2

### The problem

The design draws no in-body link. There are zero underlines and zero links
inside running prose across the eighteen exports; `grep -E
'underline|text-decoration'` over all of them returns nothing. C-11 renders
Markdown and C-12 writes two sentences that both have to name the archive,
so both need a link treatment and there is none to copy.

Colour alone cannot carry it. `f-accent` measures **1.90:1 against `f-ink`**
— 8.06 and 15.31 on the paper — well under the 3:1 WCAG 1.4.1 asks of a link
distinguished from its surrounding text by colour only.

### What I chose

`PROSE_LINK` in `src/components/f/button.tsx`: the accent, plus a 1px
underline at a 2px offset, plus `FOCUS_RING`. An underline is the only cue
left that the design has not already spent on something else — the 3px left
rule is F/Notice and F/Warning, the ground is F/Mark, the box is
F/Ingredient callout, the square is F/List mark.

`text-cta-line` must never be used for it. TOKEN-MAP §7 measures it at
3.11:1 at best, against the 4.5:1 R-ACC-01 asks of text.

It lives beside `FOCUS_RING` because it composes it, because both are
treatments this build invented rather than read, and because a leaf module is
what a Server Component graph wants: it was in `markdown.tsx`, and importing
it from there pulled `react-markdown` and `remark-gfm` into the module graph
of all eighteen routes that can draw C-12's notice.

### The other option

Set a body link in the accent with no underline and accept 1.90:1. That
fails WCAG 1.4.1 and the design does not ask for it — the design simply has
no case where the question arises.

### To change it

Change `PROSE_LINK` in `src/components/f/button.tsx`. Both callers —
`markdown.tsx` and `database-notice.tsx` — read it from there.

---

## D-11 — A card summary is not cut at 160 characters

**Status:** Decided. **Worth your eye.**
**Date:** 2026-09-09
**Touches:** C-05, §9.2, R-BLD-03

### The problem

C-05 in §9.2 says the recipe card's summary "is cut at 160 characters". The
pre-M4 build did that with a `truncate()` helper and an ellipsis.

The design draws the same card with summaries of **181 characters** on
`/cuisines/[slug]` (`classes-cuisines-1280.html`) and **245** on the same
card in `dark-screens.html` and `m360-batch-search-list.html`, both set whole
and wrapping freely. There is no `line-clamp`, no `text-overflow` and no
ellipsis anywhere in the eighteen exports.

### What I chose

The card draws what it is given. The cut is gone.

BUILD-PLAN's preamble splits the two documents this way: "The functional
specification says **what** each screen must do. The design file says **how**
it must look." A cut length is arguably a _what_, which is why this is a
decision and not a reading — but a 160-character cut would visibly cut two of
the design's own cards, and the design is the later document.

If the cut is wanted, it belongs on the DATA and not on the card: a summary
that has to be short should be written short, or trimmed in
`RecipeSummaryView`, so one length applies wherever the field is shown.

### To change it

Restore `truncate(text, 160)` in `src/components/recipe-card.tsx` and pass
`summary={truncate(recipe.summary, 160)}`. Do not put it in
`src/components/f/recipe-card.tsx`: that file is the drawing and holds no
data rule.

---

## D-12 — Three things the design draws that the data cannot fill

**Status:** Decided. **The figure is Option A, approved and built in M5.5.
The other two stay out.**
**Date:** 2026-09-09
**Touches:** R-SCR-39, §4.2, §10.2

The recipe screen in `design/exports/png/zMdv1.png` draws three things that
the build leaves out. Each one is missing because the repository holds no
data for it, not because the build skipped it.

### 1. The mass flow figure

The design draws `FIG. 1 — MASS FLOW`: seven stages across the page.

```
RAW 10 kg · CUT 24 pieces · WASH 321.7 g · DREDGE 490.3 g ·
CURE 24–48 h · HANG 13–15 d · DRIED 4.5 kg
NET WEIGHT LOSS ~55%   RATE 4.21% PER DAY
```

(This entry first transcribed the dredge as `498.3 g`. The export draws
`490.3 g` — `design/exports/recipe-1280.html:593`, and the string `498`
appears nowhere in that file. Corrected here so the next reader is not
chasing a third number.)

R-SCR-39 makes it a **MAY**, so the build is correct without it. But it is
the largest visible difference on the primary screen, and §4.2 lists it as
one of the three things the design added.

The schema holds one finished mass, `yield_quantity`. It holds no raw mass
and no per-stage mass. Adding the ingredient lines is a different figure and
would need cross-unit conversion, which this build refuses everywhere else.

**Option A — add the data.** A `mass_flow` table, or a JSON column on the
revision, holding an ordered list of stages with a label and a value. One
migration, one MCP tool change, and a backfill for Baumy Biltong.

**Option B — leave it out.** R-SCR-39 permits this.

**I would take Option A**, together with D-02. Both are the same shape: the
design draws structured data the schema does not hold. One migration can
carry both. The figure is the clearest thing on the screen and a cook
planning a batch reads it first.

#### What was decided, and what M5.5 built

**Option A**, as two tables rather than a JSON column, so a stage is
queryable and the four rules the figure has to obey are database checks
rather than prose.

- `recipe_mass_flows` (one per revision, `uq_mass_flow_revision`) and
  `recipe_mass_flow_stages`, both in migration `0005`. On the **revision**
  and not on the recipe: batch five was 8.2 kg and batch six is 10 kg, so a
  recipe-level figure would draw the current numbers on
  `/recipes/[slug]/revisions/3`, which renders through the same component.
- `massFlow` rides along on `create_recipe`, `revise_recipe` and
  `backfill_revision`. It is deliberately **not** carried forward by
  `revise_recipe`: ingredients and steps say what a cook intends, so an
  unchanged intent stays true, but a mass flow says what one batch weighed
  and copying it into a version nobody weighed would invent a measurement.
- `add_mass_flow` gives a figure to a version that is already stored. One
  per revision, refused after that, in the write path and in
  `uq_mass_flow_revision`.
- `F/Mass flow` draws it below the hero on the recipe screen, for the one
  revision that has one.

#### The two stage figures that do not match the design — ruled

The design draws `24 pieces` and `490.3 g`. The build seeds `25–30 pieces`
and `459.8 g`, and **that is the ruling: the archive wins.**

| Stage  | Design    | Built        | Why                                                                                                                                                                      |
| ------ | --------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cut    | 24 pieces | 25–30 pieces | `content/biltong/batch-06-prep.md:135` and `:159` both say 25–30, and the design's own prose at `recipe-1280.html:3297` says "25–30 pieces". `24` is in no archive file. |
| Dredge | 490.3 g   | 459.8 g      | The sum of this revision's own seasoning lines in the column it took: 138.5 + 24.4 + 83 + 188.4 + 8 + 17.5. The +40% column sums to 515.2. Nothing sums to 490.3.        |

AGENTS.md says an unquantified line is flagged and never guessed at, and
the specification says in §1.2 that the design governs how a screen **looks**.
A number is not a look. Writing either design figure would record a
measurement nobody took, on the one recipe in the repository whose whole
point is that it is a measured batch. The provenance for every stage is in
`scripts/seed-data.ts` above the `massFlow` object, and `massFlow.note`
records that batch six is planned rather than cooked.

To change it: two properties in one object in `scripts/seed-data.ts`.

#### STILL OPEN — the readout at 360

**M6 did not close this and M7 did not close it. It is the one open item on
the recipe screen.** `design/BUILD-PLAN.md` §6 carries it forward.

The design draws no mass flow strip at 360 (`grep 'MASS FLOW'
design/exports/recipe-360.html` returns nothing). It carries the fact in
the control bar instead, as `MAKES 4.5 KG DRIED FROM 10 KG RAW` — at 1280
as well as at 360 (`recipe-1280.html:855`, `recipe-360.html:298`). The
build draws a horizontally scrolling strip at 360 and a readout that says
`Makes 4.5 kg`, so neither form matches the design at that width. Nothing
is unreachable — R-STA-08 and R-STA-09 both hold, the scroller's first cell
sits at offset 0 and `document.scrollWidth` equals `window.innerWidth` —
but the emphasised DRIED cell sits off-screen behind a scroll.

It is **not** the one-line change it looks like. The readout scales:
`e2e/shopping-journey.spec.ts` asserts `13.5 kg` at ×3.
`MassFlowStageView.value` is a formatted string, `"10 kg"`, with no number
behind it to multiply, so drawing the raw mass unscaled beside a scaled
yield would put two batch sizes on one page — exactly what R-CMP-11 forbids.

**What a fix needs.** The first stage as a number and a unit, not as the
figure's caption. Then a decision on whether to hide the strip below
`shell:` as the design does.

### 2. The change apparatus

The design draws a toggle, `SHOWING CHANGES SINCE THE FIFTH REVISION`, an
`S6` marker beside each changed step, and a reserved gutter on every step
that did not change.

This is a revision-diff feature. It has no requirement number, no component
in §9.3 and no query. It is a new feature, not a style.

**I left it out and I recommend leaving it out of this build.** Raise it as
its own piece of work if you want it.

### 3. The chapter kicker

The hero's right slot reads `CHAPTER 04 · CURED AND DRIED`. There is no
chapter in the data model and no requirement asks for one.

**I left it out.** It is a label from the design's own mock data.

### What is NOT missing

Two things look absent on the seeded site and are correct:

- **Total time and Active time** in "At a glance". Both columns are null for
  every seeded revision. R-STA-05 says the design must not assume a field is
  present, so the block draws only Yield.
- **The literature block** on Baumy Biltong. That recipe cites nothing.
  R-SCR-38 says the block is absent then. Demi-Glace cites four works and
  draws it.

---

## D-13 — A note's location is not covered by the immutability rule

**Status:** Decided. **Built.**
**Date:** 2026-09-11
**Touches:** issue #23, `notes.previous_subjects`, `reattach_note`

### The problem

A note is bound to exactly one record — a recipe, one of its revisions, a
step, an ingredient or a run — and that binding is chosen at write time and
was permanent. There was no tool to move a note, and none to edit or delete
one.

An agent filed #23 after hitting the consequence. It wrote five notes about
stock — diagnosing and fixing bitter stock, holding stock below the boil,
oven versus hob control, small-batch scorching, roasting sequence — and
attached them to the batch `mixed-bone-demi-glace-batch-1`, because no
demi-glace recipe existed yet and it had no way to create one. Those notes
belong on the recipe. When the recipe is written, they cannot follow it.

The only repair available was to write fresh notes on the recipe pointing at
the batch. That duplicates the content and splits one piece of knowledge
across two records that will drift apart.

### The argument against fixing it

Append-only is the core value of this repository, and the instinct is that a
note is append-only too: the answer to a wrong note is a `correction`, never
a rewrite. A tool that reaches into a stored note looks like the beginning of
the end of that rule.

### Why it is decided the other way

**A note's CONTENT being fixed and a note's LOCATION being fixed are two
decisions, and only the first follows from the revision rule.** Moving a note
changes nothing about what it says or when it was written. The rule
`src/lib/queries/write.ts` actually states at the top of the file is that a
recipe's ingredients and steps are never edited in place, and `/connect`
already records that the wider claim — "nothing is ever deleted or edited in
place" — was removed from the screen because it was never true of the
connector: `upsert_ingredient` and `upsert_category` write over a stored
label, and `describe_mechanism` fills a field on a stored note.

**There is already a precedent for exactly this move.** `log_experiment`
accepts a different `recipeSlug` on a later call and re-homes a stored run;
the contract suite unlinks a run and relinks it. Notes were the only record
type that could not be re-homed.

**The choice of parent is usually forced, not chosen.** An agent attaches a
note to whatever exists at the time. Punishing it permanently for the order
in which records happened to be created is not immutability, it is an
accident.

### What is refused

A note pinned to one revision cannot be moved, and neither can a note on a
step. Such a note is a statement about that version. Moving it would make a
stored version say something it never said, which is the revision rule
itself. The caller is told to write the note again where it belongs.

### Why the move is recorded

`notes.previous_subjects` keeps every record the note has hung off, oldest
first, as `recipe:<slug>` / `ingredient:<slug>` / `experiment:<slug>`.

The audit log cannot hold this. `runTool` builds its audit row from the
arguments the tool was CALLED with, so a row for a move names where the note
went and never where it came from. Without the column, the fact that a note
was written against a batch and later moved to a recipe exists nowhere — and
losing that is the kind of quiet erasure this whole repository is built to
refuse. The slug is stored rather than a foreign key on purpose: a record
that is later deleted takes its row with it, and this column's job is to
survive that.

### Where a moved note sorts

A move reassigns `notes.position`, because that column is an ordinal within
one subject and the old value means nothing at the destination. That alone is
not enough, and the first implementation of this decision got it wrong.

`position` is only the TIEBREAK. The primary sort key for a subject's notes
was `created_at`, and that worked because until this tool every note was read
where it was written — its write time and its arrival at its subject were the
same instant, so one column carried both meanings. A move separates them. The
note keeps the date it was written, deliberately, since rewriting that would
falsify when the claim was made; but it arrives at its new subject today.

Sorting on `created_at`, a note written against a batch in 2024 and moved onto
a recipe in 2026 therefore lands FIRST among that recipe's notes rather than
last — the canonical case for this tool, inverted. Worse, `listScienceIndex`
and `getScienceStudy` number a study's mechanisms `M1…Mn` by position in that
list, so one moved science note renumbers every mechanism below it, including
codes already published. That is the fault D-02 records, arriving by a new
route. Measured against the seeded archive before the fix: the moved note came
back at index 0 of 7.

So `notes.sort_at` splits the two meanings. `created_at` says when the note
was written and never changes; `sort_at` says where it sits and only a move
changes it. It is backfilled to `created_at` in migration 0008, so no stored
note reordered, no mechanism was renumbered, and `pnpm export` writes the same
bytes for an unchanged database.
