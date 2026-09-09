# Noble Notations — Build Plan

| Field    | Value                                                       |
| -------- | ----------------------------------------------------------- |
| Document | NN-BP-001                                                   |
| Version  | 2.0                                                         |
| Status   | Complete. M1 to M7 are built.                               |
| Date     | 2026-09-09                                                  |
| Input    | `design/FUNCTIONAL-SPEC.md` v2.0, `design/v1-design.pen` v1 |
| Branch   | `build/design-system`                                       |
| Baseline | `main` at `2b007fa` (pull request #7)                       |

This document tells a builder what to build and in what order. The
functional specification says **what** each screen must do. The design file
says **how** it must look. This document says **when** each part is built.

**The build is finished.** §3 marks each milestone done. §4.1 holds nothing
open. §6 holds what a future reader must still act on.

---

## 1. The design reference

The design is `design/v1-design.pen`. It is encrypted. Read it only through
the pencil MCP server.

The design is also exported to HTML with Tailwind classes. The exports hold
the exact colour, type and spacing of each screen. Read them with ordinary
file tools.

The exports are at `design/exports/`. Git ignores them. To make them again,
call the pencil `execute` tool:

```js
Export(['<node id>'], 'html-tailwind', './exports/<name>.html');
```

| Export file                     | Screens                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| `foundations.html`              | Plate I synthesis, Plate V type and spacing, Plate II components |
| `plates-3-4.html`               | Plate III revisions, Plate IV dark counterpart                   |
| `recipe-1280.html`              | `/recipes/baumy-biltong`                                         |
| `recipe-revision-1280.html`     | `/recipes/baumy-biltong/revisions/3`                             |
| `recipe-1280-dark.html`         | The recipe in the dark theme                                     |
| `recipe-360.html`               | The recipe at 360, light and dark, and the drawer                |
| `home-recipes-1280.html`        | `/` and `/recipes`                                               |
| `classes-cuisines-1280.html`    | `/classes`, one tag, `/cuisines`, one cuisine                    |
| `ingredients-1280.html`         | `/ingredients` and one ingredient                                |
| `batch-logs-1280.html`          | `/batch-logs`, one recipe's batch logs, one batch log            |
| `list-search-archive-1280.html` | `/list`, `/search`, `/archive`, one note                         |
| `access-1280.html`              | `/connect`, `404`, `/connect/done`, `/sign-in`                   |
| `science-1280.html`             | `/science` and one science note                                  |
| `m360-core.html`                | `/`, `/recipes`, one revision, at 360                            |
| `m360-classes-ingredients.html` | Classification and ingredients at 360                            |
| `m360-batch-search-list.html`   | Batch logs, search, list and archive at 360                      |
| `m360-access-science.html`      | Access and science at 360                                        |
| `dark-screens.html`             | Nine screens in the dark theme                                   |

Each element in an export carries a `data-pencil-name` attribute. The name
is the name of the layer in the design. Use it to find a part.

---

## 2. The design tokens

The design changed the palette. R-TKN-03 permits this. The design is now the
source of truth for colour, type and space. §7.1 of the specification is
history.

The direction is **DOSSIER**: warm paper and ink in the light theme, cool
graphite in the dark theme, one red accent.

### 2.1 Colour

| Design name     | Light     | Dark        | Role                              |
| --------------- | --------- | ----------- | --------------------------------- |
| `f-paper`       | `#FCFAF6` | `#17191B`   | The page ground                   |
| `f-desk`        | `#F3EDE5` | `#101214`   | The recessed fill                 |
| `f-ink`         | `#2B1F1C` | `#EDEFF1`   | The primary text                  |
| `f-ink-2`       | `#574843` | `#B7BCC0`   | The secondary text                |
| `f-ink-3`       | `#79655F` | `#8C9297`   | The quiet text                    |
| `f-hair`        | `#E4D8D0` | `#2C3033`   | The rule and the border           |
| `f-hair-2`      | `#F0E7DE` | `#222629`   | The quiet rule, on a table row    |
| `f-accent`      | `#8E2A1E` | `#FF7A6B`   | The accent                        |
| `f-accent-wash` | `#F7E8E3` | `#FF7A6B1F` | The accent ground                 |
| `f-on-accent`   | `#FCFAF6` | `#17191B`   | The text on the accent            |
| `f-warn`        | `#C42B1C` | `#FF6F5E`   | The warning                       |
| `f-warn-wash`   | `#FBEDE9` | `#FF6F5E1F` | The warning ground                |
| `f-caution`     | `#8A5A12` | `#E8B24E`   | The caution                       |
| `f-cta-line`    | `#B0857A` | `#666F73`   | The underline on a call to action |

The dark values carry the `fd-` prefix in the design file. They are the same
tokens in the dark theme.

### 2.2 Type

| Design name | Value      | Use                         |
| ----------- | ---------- | --------------------------- |
| `f-serif`   | Newsreader | The titles                  |
| `f-sans`    | Geist      | The body text               |
| `f-mono`    | Geist Mono | Every number and each label |

The size scale is 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 21, 24, 26, 40,
48 and 72 pixels.

The line heights are 1, 1.05, 1.15, 1.3, 1.5, 1.7 and 1.8.

The letter spacing values are −1, −0.5, 0, 0.5, 1.2 and 1.5.

### 2.3 Space

The gap scale is 4, 8, 12, 16, 20, 24, 28, 32, 40, 44, 60, 90 and 115
pixels.

---

## 3. The milestones

Each milestone ended with a commit. Each milestone left the four gates
green: `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.

**All 8 are done.** The **Delivered** column says what each one actually
shipped, where that is not what the plan said.

| ID   | Milestone                     | Planned                                                           | Done | Delivered                                                                                                                                                                                 |
| ---- | ----------------------------- | ----------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1   | Foundation                    | Tailwind CSS, shadcn/ui, the tokens, the fonts                    | Yes  | `f550829`. Tailwind 4.3.3, `components.json`, `src/app/theme.css`, and Newsreader, Geist and Geist Mono through `next/font/google`. 7 Tailwind namespaces cleared.                        |
| M2   | Routes, redirects and queries | 6 renames, 3 new routes, 5 redirects, the science query           | Yes  | `3fad737`. 6 renames, 4 new routes and **9** redirects, not 5: the 7 renames plus the 2 older `/taxonomy` rules, repointed so no request takes two hops.                                  |
| M3   | Shell and primitives          | The header, the drawer, the footer, and 14 design primitives      | Yes  | `1d9f398`. The shell, and 13 files under `src/components/f/` holding 25 design names. 6 shadcn/ui primitives were vendored and 4 of them were then deleted. See D-06 and TOKEN-MAP §11.0. |
| M4   | Content components            | The cards, the tags, the notes, the rows and the tables           | Yes  | `f51663c`. 15 components in 10 files, and every shared component rebuilt onto them.                                                                                                       |
| M5   | The recipe screen             | The hero, the panels, the steps, the batch control, the checklist | Yes  | `de7b752`.                                                                                                                                                                                |
| M5.5 | The data the design draws     | Not planned. It came out of D-02 and D-12.                        | Yes  | `65d93a6`. Migration `0005`, the mass flow tables, `notes.conditions`, `F/Mass flow`, and the 2 new connector tools `add_mass_flow` and `describe_mechanism`.                             |
| M6   | The other screens             | The remaining 19 screens, light and dark, 1280 and 360            | Yes  | `96de7be`. **20** screens, `F/Band`, the per-route page foot under `src/app/@foot/`, and migration `0006`, a stable ordering key on `notes`.                                              |
| M7   | Tests, audit and clean up     | The end-to-end tests, `pnpm audit:ui`, and `globals.css` removed  | Yes  | The render tests, the audit, and `globals.css`, the `legacy` layer and the palette bridge all deleted with preflight turned on.                                                           |

### 3.1 The old stylesheet — done

`src/app/globals.css` held 1,892 lines. It is deleted.

M1 added Tailwind beside it. Tailwind's preflight was **off** from M1 to M6,
because preflight and the old base rules fight each other. A screen that M3
to M6 rebuilt used Tailwind only. A screen that was not yet rebuilt kept the
old rules and kept working.

M7 removed the old stylesheet, removed the `legacy` cascade layer that
carried it, removed the M3 palette bridge, and turned preflight on. All four
happened in one commit, because the bridge exists only to feed the old file
and the layer exists only to hold it.

This kept the site usable and the tests green at each step. See
`design/DECISIONS.md` D-03 and D-09.

---

## 4. Rules for every milestone

Every rule below held for every milestone, with one recorded exception:
R-BLD-04. §9.3.1 of the specification names the 3 extra client components
and says why each one had to run in the browser, and §20.7 records the
deviation.

- R-BLD-01: A milestone **MUST** leave the four gates green.
- R-BLD-02: A component **MUST** read a token. A component **MUST NOT** hold
  a raw colour value.
- R-BLD-03: A build **MUST** use the design's component names. See §9.5 of
  the specification.
- R-BLD-04: A page **MUST** stay a Server Component. Only the 8 components in
  §9.3 of the specification run in the browser.
- R-BLD-05: All database access **MUST** go through `src/lib/queries/`.
- R-BLD-06: A renamed route **MUST** keep a permanent redirect from its old
  address.
- R-BLD-07: The dark theme comes from `prefers-color-scheme`. There is no
  theme control.
- R-BLD-08: Do not hand-edit `content/biltong`, `content/recipes` or
  `content/research`. They are a frozen archive. `content/generated` is
  machine-written: change it only by running `pnpm export`.

---

## 4.1 Carried forward — the ledger

A milestone could leave a named item to a later one. Each item had an owner
and a test. **This ledger is closed.** Each row says which milestone closed
the item and how.

Anything a future reader must still act on is in §6, not here.

| Item                                                          | Closed by | How                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The `/classes` tag pill                                       | M6        | M4 rebuilt `F/Tag` with no padding, which is what the design draws almost everywhere. `/classes` is the exception: the design draws a pill there with `p-[4px_9px_4px_10px]` on `f-desk` and an 8px accent square. Without it a term on that screen is 17px tall, which the audit reports as 4 small tap targets. M6 built the pill and that route now reports nothing.                                                                               |
| The note kind wrap                                            | M4        | `src/components/f/note.tsx` set `w-full` on the title at every width, which squeezed `NOTE · OBSERVATION` onto two lines above the breakpoint. It is now `w-full shell:w-auto`.                                                                                                                                                                                                                                                                       |
| The screen reader run-together                                | M4        | Four row components put two values next to each other with a flex gap and no character between them, so `textContent` read `29 NOV 2024Biltong Batch 4`. Each now holds a real space. It is the same fault R-CMP-14 records for the step chip.                                                                                                                                                                                                        |
| `.badge num` names two things                                 | M6        | On the two science pages the class marked both the mechanism code and a condition chip, and `e2e/science.spec.ts` read `.first()` and passed by DOM order. M6 rebuilt both screens onto `F/Mechanism`, which removed the clash.                                                                                                                                                                                                                       |
| `pnpm export` is not reproducible                             | M6        | Two runs over one seed ordered the notes differently in four files, because `notes.created_at` shares one transaction timestamp and the tiebreak fell to a random uuid. Migration `0006` added a stable ordering key on `notes`, which fixed the export and let `/science/demi-glace` carry its five mechanisms. The fault predated M5.5.                                                                                                             |
| A render test for the mass flow figure and the conditions row | M7        | M5.5 added 4 tests and all of them covered the write layer and the read layer. Nothing asserted that `F/Mass flow` appears on a recipe or that a conditions row appears on a science screen, so deleting the block left every test green. `e2e/render.spec.ts` is the answer. It covers 4 blocks and it asserts each one's ABSENCE as well, because a component that draws itself unconditionally passes every "it is on the page" test ever written. |

## 5. How to run the full tests

This machine has no Postgres, but it has Docker. M2 proved that a scratch
database works. Use it. A milestone that changes a screen **MUST** run the
end-to-end tests and the geometric audit before it reports done.

```bash
docker run -d --rm --name nn-test \
  -e POSTGRES_PASSWORD=nn -e POSTGRES_DB=noble_test \
  -p 55432:5432 postgres:16

export DATABASE_URL=postgresql://postgres:nn@localhost:55432/noble_test
pnpm db:migrate && pnpm ingest

# THE AUDIT GOES FIRST. The end-to-end suite writes to this database; see
# the third trap below. audit:ui drives a browser against a server that is
# already running and does not start one — without this step it reports 176
# blockers, all of them a refused connection.
pnpm build && pnpm start &
pnpm audit:ui     # 22 routes × 4 widths × 2 states = 176 page loads
kill %1

pnpm test:e2e     # Playwright starts its own server.

docker rm -f nn-test
```

`e2e/global-setup.ts` drops the `public` and `drizzle` schemas on every run.
Point it at a scratch database only.

**Three traps, and the third is the one that is easy to miss.**

**1. The port.** See below.

**2. The dropped schemas.** `e2e/global-setup.ts` drops two of them. Point
it at a scratch database only.

**3. The end-to-end suite writes to the database, so an audit taken after it
does not reproduce §5.1.** `e2e/render.spec.ts`, `e2e/mcp-lifecycle.spec.ts`
and their siblings create recipes, revisions and runs through the connector,
and `pnpm ingest` does not clear them — only `global-setup` does, and it
runs at the start of the suite rather than the end. Measured on M7, same
server, same routes: a clean database gives 52 findings over 412 controls
under 24 × 24; immediately after `pnpm test:e2e` it gives the same 52
findings over **464** controls. The route, viewport, state, check and
severity of every finding are identical — the headline `0 / 0 / 52` does not
move — but the detail counts do, and §6.1 quotes one of them. Run the audit
first, as the block above does, or reset the database between the two:

```bash
docker exec nn-test psql -U postgres -d noble_test \
  -c 'DROP SCHEMA public CASCADE; DROP SCHEMA drizzle CASCADE; CREATE SCHEMA public'
pnpm db:migrate && pnpm ingest
```

**Check the port before you believe an audit number.** `pnpm audit:ui` drives
whatever answers on `:3000`. A `next start` another agent left running answers
too, and it serves the chunk hashes of the build it was started from — which
made one M4 audit report 180 major faults that were all
`Refused to apply style … MIME type ('text/plain')` against a build that no
longer existed. `pnpm start` fails with `EADDRINUSE` in that state and a
`curl` still succeeds, so the failure is silent unless it is looked for:

```bash
ss -ltnp | grep ':3000'      # must be empty before `pnpm start`
pnpm build && pnpm start & SERVER=$!
pnpm audit:ui
kill "$SERVER"               # by PID, not `pkill next-server`
```

Stop the server by PID. `pkill -f next-server` takes a sibling agent's server
down with it.

**If the port refuses to bind.** This machine sometimes reports
`address already in use` for a published port that nothing holds. Start the
container with no `-p` and read its address instead:

```bash
docker run -d --name nn-test -e POSTGRES_PASSWORD=nn \
  -e POSTGRES_DB=noble_test postgres:16
IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' nn-test)
export DATABASE_URL=postgresql://postgres:nn@$IP:5432/noble_test
```

### 5.1 The numbers

| Measured after | End-to-end tests | Blockers | Major | Minor | Page loads |
| -------------- | ---------------- | -------- | ----- | ----- | ---------- |
| M5.5           | 144              | 0        | 0     | 52    | 176        |
| M6             | 145              | 0        | 0     | 52    | 176        |
| M7             | 165              | 0        | 0     | 52    | 176        |

M7 added 20 tests: `e2e/render.spec.ts`, which asserts that 4 conditional
blocks are drawn on the page and, for 3 of them, that they are absent where
the requirement says they must be.

Every minor fault is a control under 24 × 24 pixels. §6.1 carries the one
shape they share.

The audit's page-load figure is 22 routes × 4 widths × 2 states.
`scripts/audit-ui.ts` holds the route list, and R-ACC-11 of the
specification quotes the same figure. Change one and change the other.

---

## 6. Still carried forward

**The build is finished. These items are not.** Each one was measured, not
guessed at, and each one has a reason it was not closed. A reader who wants
to take one on should start here.

Nothing below stops the site working. Each row says what a reader sees today
and what a fix costs.

### 6.1 The 52 small tap targets

`pnpm audit:ui` reports 52 minor faults and every one is a control under
24 × 24 pixels.

They are one shape: a bare title link in a ruled row, 17 to 18px tall, on
`F/Table row`, `F/Ingredient row`, `F/Batch line` and the archive row.
`/ingredients` alone is 168 of the 412 controls the audit counts as small —
42 row links at each of 4 page loads.

**The fix is `py-*` with a compensating `-my-*` on the anchor in
`src/components/f/`, once, and not per page.** M6 did not attempt it and M7
did not either, for one measured reason: growing an inline anchor's box by
4px each way brings it inside the audit's own 4px overlap tolerance of the
row beneath. Turning 12 minor faults into a major one is worse than the
debt.

A real fix changes the row's own height, not the anchor's padding. That is a
change to the design, so it belongs to the designer first.

### 6.2 The 404 has no `contentinfo` landmark

`src/app/not-found.tsx` renders its own `PageFoot` inside `<main>`, because
the `@foot` parallel slot does not resolve for a root `not-found.tsx` — no
route matches, so nothing matches the slot either.

A `<footer>` inside `<main>` is not `contentinfo` under HTML-AAM, so the 404
is the one screen on the site with no such landmark. This is measured, not
predicted. It is the smaller of the two losses: a footerless 404 is worse.

**Next 16's `global-not-found.tsx` is the answer.** It lets the 404 compose
its own shell and put the foot back outside the landmark.

### 6.3 A `notFound()` from a matched route serves a blank page

`/nope` draws the designed 404. `/archive/nope`, `/archive/a/b/c` and
`/classes/x/y` answer 404 with one character of visible text and no shell at
all.

Every `notFound()` in the codebase lands there, which is every 404 a reader
can reach by following a stale link. This predates M6 and it reproduces
against a `git archive HEAD` build.

Two things to try: a `default.tsx` for the implicit `children` slot at the
app root, and the same `global-not-found.tsx` as §6.2. Whichever lands,
assert an `<h1>` and not only a status code — `e2e/science.spec.ts` asserts
the status code alone, which is why nothing caught this.

### 6.4 Two rules for spelling a count

`cardinal` in `src/lib/site.ts` spells to ninety-nine and then prints the
numeral. `numberWord` in `src/components/f/band.tsx` spells to twenty.
`cardinal(34)` is `thirty-four`; `numberWord(34)` is `34`.

Both are right about the design, which writes `NINE GROUPS · 34 TAGS` on
home and `TEN TYPES · FIFTY TAGS` on `/classes` — so shipping both leaves no
rule at all.

This is latent, not live: every band meta today counts under twenty.
`Cardinal` in sentence case is a third and deliberate one, for the 4 ledes
that open with a count.

**Either delete one, or keep both under names that say when each applies and
record the design rule beside them.**

### 6.5 `pnpm audit:ui` does not cover two screens

Its route list has no `/archive/[...slug]`, and it audits `/list` bare —
which renders the basket bridge and never the checklist. So neither the
archive note's verbatim panel nor a populated shopping list is under any
geometric gate. The archive note's 168px overflow at 360 was found by hand,
not by the audit.

Adding a route changes the `176 page loads` figure that R-ACC-11 and §6 of
the specification both quote. Change the audit and change both documents in
the same commit.

### 6.6 The mass flow readout at 360

The design draws no mass flow strip at 360. It carries the same fact in the
control bar, as `MAKES 4.5 KG DRIED FROM 10 KG RAW`, at both widths. The
build draws a strip that scrolls sideways and a readout that says
`Makes 4.5 kg`, so neither form matches the design at that width.

Nothing is unreachable. The emphasised `DRIED` cell sits behind a scroll.

It is not a one-line change. `MassFlowStageView.value` is a formatted
string with no number behind it, so drawing the raw mass unscaled beside a
scaled yield would put two batch sizes on one page, which R-CMP-11 forbids.
A fix needs the first stage as a number and a unit. See `design/DECISIONS.md`
D-12.

### 6.7 The batch-log ledger's 3 weight figures — the designer's

The design fills the `f-desk` band on both batch-log indexes with
`RAW, TOTAL`, `DRIED, TOTAL`, `MEAN YIELD` and `SPENT`. M6 draws `SPENT` and
the per-row `RAW / DRIED / YIELD` panel the design draws beside every row.

The 3 page-level weight figures are not drawn. **This one belongs to no
decision** — D-12's three items are the mass flow figure, the change
apparatus and the chapter kicker, and the intro to `design/DECISIONS.md`
lists these figures separately as belonging to the designer and to the data.
The reason they are absent is the data: 3 of the 4 seeded runs never weighed
anything out, so a total and a mean across them would be a figure about the
runs that did, printed under a label claiming all of them.

**It becomes drawable the moment a run records a final weight.** It needs
data, not a build.
