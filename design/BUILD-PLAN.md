# Noble Notations — Build Plan

| Field    | Value                                                       |
| -------- | ----------------------------------------------------------- |
| Document | NN-BP-001                                                   |
| Version  | 1.0                                                         |
| Date     | 2026-09-09                                                  |
| Input    | `design/FUNCTIONAL-SPEC.md` v1.6, `design/v1-design.pen` v1 |
| Branch   | `build/design-system`                                       |
| Baseline | `main` at `2b007fa` (pull request #7)                       |

This document tells a builder what to build and in what order. The
functional specification says **what** each screen must do. The design file
says **how** it must look. This document says **when** each part is built.

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

Each milestone ends with a commit. Each milestone keeps the four gates
green: `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.

| ID  | Milestone                     | Delivers                                                          |
| --- | ----------------------------- | ----------------------------------------------------------------- |
| M1  | Foundation                    | Tailwind CSS, shadcn/ui, the tokens, the fonts                    |
| M2  | Routes, redirects and queries | 6 renames, 3 new routes, 5 redirects, the science query           |
| M3  | Shell and primitives          | The header, the drawer, the footer, and 14 design primitives      |
| M4  | Content components            | The cards, the tags, the notes, the rows and the tables           |
| M5  | The recipe screen             | The hero, the panels, the steps, the batch control, the checklist |
| M6  | The other screens             | The remaining 19 screens, light and dark, 1280 and 360            |
| M7  | Tests, audit and clean up     | The end-to-end tests, `pnpm audit:ui`, and `globals.css` removed  |

### 3.1 The old stylesheet

`src/app/globals.css` holds about 1,900 lines. It stays until M7.

M1 adds Tailwind beside it. Tailwind's preflight is **off** until M7,
because preflight and the old base rules fight each other. A screen that M3
to M6 rebuilds uses Tailwind only. A screen that is not yet rebuilt keeps
the old rules and keeps working.

M7 removes the old stylesheet and turns preflight on.

This keeps the site usable and the tests green at each step.

---

## 4. Rules for every milestone

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

## 4.1 Carried forward

A milestone can leave a named item to a later one. Each item here has an
owner and a test.

| Item                                                          | Owner        | Why it waits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The `/classes` tag pill                                       | Closed in M6 | M4 rebuilt `F/Tag` with no padding, which is what the design draws almost everywhere. `/classes` is the exception: the design draws a pill there with `p-[4px_9px_4px_10px]` on `f-desk` and an 8px accent square. Without it a term on that screen is 17px tall, which `pnpm audit:ui` reports as 4 small tap targets. See `design/exports/classes-cuisines-1280.html`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| The note kind wrap                                            | Closed in M4 | `src/components/f/note.tsx` set `w-full` on the title at every width, which squeezed `NOTE · OBSERVATION` onto two lines above the breakpoint. Now `w-full shell:w-auto`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| A render test for the mass flow figure and the conditions row | M7           | M5.5 added 4 tests, and all of them cover the write layer and the read layer. Nothing asserts that `F/Mass flow` appears on `/recipes/baumy-biltong`, or that a conditions row appears on `/science`. Delete the block in `src/components/recipe-detail.tsx` and all 144 tests still pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `.badge num` names two things                                 | Closed in M6 | On the two science pages the class marks both the mechanism code and a condition chip. `e2e/science.spec.ts` reads `.first()` and passes by DOM order. M6 rebuilds both screens onto `F/Mechanism`, which removes the clash.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pnpm export` is not reproducible                             | Closed in M6 | Two runs over one seed order the notes differently in four files, because `notes.created_at` shares one transaction timestamp and the tiebreak falls to a random uuid. Every export also rewrites eleven `created:` lines. A stable ordering key on `notes` fixes both. The fault predates M5.5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| The screen reader run-together                                | Closed in M4 | Four row components put two values next to each other with a flex gap and no character between them, so `textContent` read `29 NOV 2024Biltong Batch 4`. Each now holds a real space. This is the same fault R-CMP-14 records for the step chip.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| The 52 small tap targets                                      | M7           | M6 closed `/classes` — the pill landed and that route reports nothing — and `/science/beef-wellington-technique` with it, but the total did not fall to the 48 §4.1 predicted. The rebuilt `/archive`, `/ingredients` and the two batch-log indexes took the four slots back, so it is 52 by coincidence. The count of CONTROLS under 24×24 is the number that moved, from 352 at M5.5 to 412 measured on this tree, and `/ingredients` is 168 of the 412 — 42 row links at each of four page loads. They are one shape — a bare title link in a ruled row, 17 to 18px tall, on `F/Table row`, `F/Ingredient row`, `F/Batch line` and the archive row. The fix is `py-*` with a compensating `-my-*` on the anchor in `src/components/f/`, once, not per page. M6 did NOT attempt it: growing an inline anchor's box by 4px each way brings it within the audit's own 4px overlap tolerance of the row beneath, and turning twelve minors into a major is worse than the debt. M7 owns the audit and can measure both numbers in one pass. |
| The 404 has no `contentinfo`                                  | M7           | `not-found.tsx` renders its own `PageFoot` inside `<main>`, because the `@foot` parallel slot does not resolve for a root `not-found.tsx` — no route matches, so nothing matches the slot either. A `<footer>` inside `<main>` is not `contentinfo` (HTML-AAM), so the 404 is the one screen in the site with no such landmark. Measured, not predicted. It is the smaller of the two losses — a footerless 404 is worse — and Next 16's `global-not-found.tsx` is the answer: it lets the 404 compose its own shell and put the foot back outside the landmark.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| A `notFound()` from a matched route serves a blank page       | M7           | PREDATES M6 and reproduced against a `git archive HEAD` build. `/nope` draws the designed 404; `/archive/nope`, `/archive/a/b/c` and `/classes/x/y` answer 404 with one character of visible text and no shell at all. Every `notFound()` in the codebase lands there, which is every 404 a reader can reach by following a stale link. `e2e/science.spec.ts:220` asserts only the status code, so nothing catches it. Two things to try: a `default.tsx` for the implicit `children` slot at the app root, and the same `global-not-found.tsx`. Whichever lands, assert an `<h1>` and not only a 404.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Two rules for spelling a count                                | M7           | `cardinal` (`src/lib/site.ts`) spells to ninety-nine then prints the numeral; `numberWord` (`src/components/f/band.tsx`) spells to twenty. `cardinal(34)` is `thirty-four`, `numberWord(34)` is `34`. Both are right about the design, which writes `NINE GROUPS · 34 TAGS` on home and `TEN TYPES · FIFTY TAGS` on `/classes` — so shipping both leaves no rule at all. Latent, not live: every band meta today counts under twenty. Either delete one, or keep both under names that say when each applies and record the design rule beside them. `Cardinal` (M6) is a third and deliberate one: `cardinal` in sentence case, for the four ledes that open with a count.                                                                                                                                                                                                                                                                                                                                                                |
| `pnpm audit:ui` does not cover two screens                    | M7           | Its route list has no `/archive/[...slug]`, and it audits `/list` bare — which renders the basket bridge and never the checklist. So neither the archive note's verbatim panel nor a populated shopping list is under any geometric gate; the archive note's 168px overflow at 360 was found by hand, not by the audit. Adding routes changes the `176 page loads` figure that R-ACC-11 and §6 of the specification both quote, which is why M6 left the list at 22 and fixed the overflow instead. M7 owns the audit and the figure together.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| The batch-log ledger's three weight figures                   | Designer     | The design fills the `f-desk` band on both batch-log indexes with `RAW, TOTAL`, `DRIED, TOTAL`, `MEAN YIELD` and `SPENT`. M6 draws `SPENT` and the per-row `RAW / DRIED / YIELD` panel the design draws beside every row. The three page-level weight figures are NOT drawn and this is a recorded D-12 omission: three of the four seeded runs never weighed anything out, so a total and a mean across them would be a figure about the runs that did, printed under a label claiming all of them. It becomes drawable the moment a run records a final weight.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

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
pnpm test:e2e     # 140 tests. Playwright starts its own server.

# audit:ui drives a browser against a server that is already running. It
# does not start one. Without this step it reports 176 blockers, all of
# them a refused connection.
pnpm build && pnpm start &
pnpm audit:ui     # 22 routes × 4 widths × 2 states = 176 page loads
kill %1

docker rm -f nn-test
```

`e2e/global-setup.ts` drops the `public` and `drizzle` schemas on every run.
Point it at a scratch database only.

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

The baseline after M5.5 is 144 tests passed, and 0 blockers and 0 major
faults across 176 page loads. The audit also reports 52 minor faults, all of
them a small tap target. Section 4.1 gives 4 of those to M6.
