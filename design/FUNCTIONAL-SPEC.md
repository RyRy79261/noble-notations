# Noble Notations — User Interface Functional Specification

| Field           | Value                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Document        | NN-FS-001                                                                                                                               |
| Version         | 2.0                                                                                                                                     |
| Status          | Issued. The build is complete.                                                                                                          |
| Date            | 2026-09-09                                                                                                                              |
| Repository      | `RyRy79261/noble-notations`                                                                                                             |
| Baseline        | `build/design-system`, milestones M1 to M7                                                                                              |
| Language        | ASD-STE100 Simplified Technical English in §1 to §14, which are normative. §15 onward record what the build made and are plain English. |
| Target stack    | Tailwind CSS 4.3.3 and shadcn/ui. Both are installed.                                                                                   |
| Design baseline | `design/v1-design.pen`, DIRECTION F — DOSSIER                                                                                           |
| Build plan      | `design/BUILD-PLAN.md`                                                                                                                  |
| Token map       | `design/TOKEN-MAP.md`                                                                                                                   |
| Build decisions | `design/DECISIONS.md`                                                                                                                   |

---

## 1. Introduction

### 1.1 Purpose

This document tells you what each screen and each component must do.

Version 1 was the input to the design work. The design work is complete.
The build is complete. This issue records what the build made. Each
requirement stays normative. A future change must still meet it.

This document does not tell you how the screens must look. `design/v1-design.pen`
does that, and `design/BUILD-PLAN.md` §2 makes the design the source of
truth for colour, type and space.

### 1.2 Scope

This document covers the website user interface. It covers the 25 addresses
in §8.1 and all 20 components in §9.

This version adopts the design in `design/v1-design.pen`. The design renamed
6 routes and added a new section. §4.2 lists each change. The route names in
§8.1 are the design's names, and the code now uses them.

This document does not cover:

- The database schema.
- The MCP connector protocol.
- The write path and the OAuth flow, except for the two screens in §10.10.

### 1.3 Audience

The audience was the designer. The design is complete and the build is
complete, so the audience is now the person who changes the interface. That
person reads this document to learn what a screen must do, and the design
to learn how it must look.

### 1.4 Where the code is

This document lives in the repository at `design/FUNCTIONAL-SPEC.md`. Each
table in §8 and §9 gives the file for the thing it describes. Appendix B
holds the full file map.

Read these 6 files first. They answer most questions.

| Order | File                               | Why                                                                                          |
| ----- | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| 1     | `AGENTS.md`                        | The working guide. Stack, layout, data model and quality gates.                              |
| 2     | `src/app/theme.css`                | The design system now. Each token is here. Each block has a comment that says why it exists. |
| 3     | `design/TOKEN-MAP.md`              | What each token means, what it measures, and which old name ends where.                      |
| 4     | `src/lib/site.ts`                  | Each label the interface shows.                                                              |
| 5     | `src/components/recipe-detail.tsx` | The primary screen. It assembles the 4 panels.                                               |
| 6     | `src/lib/queries/read.ts`          | The shape of each view. It tells you which fields can be empty.                              |

`src/app/globals.css` was the design system until M7. M7 deleted it. Do not
look for it. `design/DECISIONS.md` D-03 records why it stayed until then.

Do not change these directories:

- `content/biltong`, `content/recipes`, `content/research` — a frozen
  archive.
- `content/generated` — a machine writes it.

---

## 2. Requirements Language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY** and **OPTIONAL** in this
document have the meanings in RFC 2119.

- **MUST** — the design is not correct without this.
- **SHOULD** — do this unless you have a good reason not to. Write the reason
  down.
- **MAY** — this is your choice.

Each requirement has an identifier. The format is `R-XXX-nn`. Refer to a
requirement by its identifier in review.

---

## 3. Terminology

| Term             | Meaning                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Recipe           | A dish with a name. The name does not change.                                                                              |
| Revision         | One version of a recipe. A revision holds the ingredients and the steps. You cannot change a revision after you make it.   |
| Backfill         | An older revision. You find it later and you add it to the history.                                                        |
| Rationale        | The text that tells you why a revision exists.                                                                             |
| Kind             | The type of an entry: recipe, preparation, process or research.                                                            |
| Term (tag)       | One label in the classification. Each term has one category type.                                                          |
| Category type    | A group of terms. There are 10 category types.                                                                             |
| Note             | A typed remark on a recipe, a step, an ingredient or a run. There are 8 note kinds.                                        |
| Experiment (run) | A record of a batch that a person cooked. It holds measurements.                                                           |
| List             | The set of recipes that a person collects in the browser. The code calls this the basket. The interface calls it the list. |
| Shop order       | The sequence of ingredient categories. It follows the walk through a shop.                                                 |
| Scale            | The batch multiplier. The range is 0.1 to 100.                                                                             |
| Servings         | The number of people a revision feeds. A revision can declare it. Many do not.                                             |
| Yield            | The quantity a revision makes, for example 4.5 kg dried.                                                                   |
| Aside            | The ingredient column. It stays on screen on a desktop.                                                                    |
| Class            | A tag in the classification. The route is `/classes`.                                                                      |
| Batch log        | A recorded run. The code calls this an experiment.                                                                         |
| Mechanism        | A block on a science note. It tells you what happens in the food and why.                                                  |

---

## 4. Repository Status

This is the status after M7. §4.1 and §4.2 are history. Read them to learn
why a screen is the shape it is.

| Item          | Status                                                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch        | `build/design-system`. M1 to M7 are built.                                                                                                            |
| Tailwind CSS  | **Installed.** `tailwindcss` 4.3.3 and `@tailwindcss/postcss` 4.3.3. The entry point is `src/app/theme.css`. There is no `tailwind.config`.           |
| shadcn/ui     | **Installed.** `components.json` holds the New York style, RSC on and CSS variables on. Two primitives are vendored: `Sheet` and `Tooltip`.           |
| Preflight     | **On.** M7 turned it on and deleted `src/app/globals.css` in the same commit. See §6.                                                                 |
| Design work   | **Complete.** `design/v1-design.pen` holds 23 screens at 1280, 9 of them again in the dark theme, 26 at 360, and 36 components. See §4.2.             |
| Design export | 18 HTML exports and one PNG for each screen, at `design/exports/`. `design/exports/png/INDEX.md` names each picture. Git ignores the whole directory. |

The stack is Next.js 16.3.3 on the App Router, React 19.2.8, TypeScript
5.9, Drizzle over Postgres, and Playwright for the end-to-end tests.

### 4.1 What pull request #6 changed — history

This is why the recipe screen has the shape it has. It changed 4 things.

1. **A step now names what it uses.** Each step shows chips. Each chip holds
   an amount and an ingredient name. The amounts follow the batch control.
2. **The dark ground is now neutral.** It was purple. See §7.1.
3. **The batch control counts servings.** It was a multiplier only. See
   §10.2.5.
4. **Science and Revisions are now their own tabs.** They were at the bottom
   of a long scroll.

The pull request also repaired 2 layout faults. See §10.2.2.

### 4.2 What the design changed — history

The design is in `design/v1-design.pen`. It covers each route at 1280px and
at 360px, and it covers 11 routes in the dark theme. It holds 36 components.

The design renamed 6 things. This document now uses the design's names.

| Old name                    | New name                            |
| --------------------------- | ----------------------------------- |
| `/categories`               | `/classes`                          |
| `/categories/[type]/[slug]` | `/classes/[type]/[slug]`            |
| `/shopping-list`            | `/list`                             |
| `/experiments`              | `/batch-logs`                       |
| `/experiments/[slug]`       | `/recipes/[slug]/batch-logs/[slug]` |
| `/auth`                     | `/sign-in`                          |
| `/oauth-return`             | `/connect/done`                     |
| The basket                  | The list                            |

The design added 3 things.

1. **A science section.** `/science` and `/science/[slug]` are new routes.
   Science is still a tab on a recipe. The new routes collect the science
   from every recipe in one place.
2. **A literature block** on the recipe page. It holds citations.
3. **A mass flow figure** on the recipe page. It shows the weight of the
   food at each stage.

The design also answered 4 open questions. The 360 navigation is a drawer
(R-NAV-03). The revision timeline is its own tab (Q-04). A card carries no
image (Q-03). Eight note kinds ride on three severities (Q-06). §16 records
each answer.

Seven items in this document were not in the first design. The design closed
all seven. §18 records each one.

---

## 5. Product Overview

### 5.1 What the product is

Noble Notations is a store of recipes, ingredients, techniques and batch
logs. It is a reference manual. It is not a food blog.

The main idea is the **revision**. A recipe has a name. The name does not
change. The ingredients and the steps belong to a revision. You cannot
change a revision after you make it. Each revision records why it exists.

To make a dish better, you add a revision. You do not edit the old one.

### 5.2 Users

| User     | Surface                                  | Task                                                                           |
| -------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| The cook | Website on a phone                       | Read a recipe in the kitchen. Change the batch size. Shop for the ingredients. |
| A reader | Website on a desktop                     | Look through the store. Search it. Read the history of a dish.                 |
| An agent | MCP connector, `/llms.txt`, `.md` routes | Search the store. Add revisions to it.                                         |

### 5.3 Tone

- R-TON-01: The design **MUST** be dense but easy to read. It is a manual.
- R-TON-02: All numbers **MUST** use a monospace face with tabular figures.
  Columns of grams must line up down the page.
- R-TON-03: Colour **MUST** classify. Colour **MUST NOT** only decorate.
- R-TON-04: The design **MUST** be dark first. A light theme **MUST** also
  work.
- R-TON-05: The dark ground **MUST** stay near neutral. The accent is the
  only strong colour on a recipe page.

> **Background.** The dark ground was purple. Each token passed AA, and the
> page still read badly. A strong ground competes with the text on it.
> Purple is a hard hue to hold for the length of a recipe. Purple is now the
> accent only.

---

## 6. Current Implementation

| Item       | Value                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | Next.js 16.3.3 App Router. React 19.2.8. TypeScript 5.9.                                                                                            |
| Styles     | `src/app/theme.css`. It is the Tailwind entry point and it holds the DOSSIER token set. There is no other stylesheet.                               |
| Preflight  | On. It arrives inside the single `@import 'tailwindcss'` in `src/app/theme.css`, which declares `@layer theme, base, components, utilities` itself. |
| Data       | Postgres through Drizzle. All reads go through `src/lib/queries/read.ts`. There are 7 migrations, `0000` to `0006`.                                 |
| Rendering  | Server Components by default. 11 client components live in `src/components/`. See §9.3.                                                             |
| Components | 25 files under `src/components/f/`. Each one draws a family of the design. See §9.5.                                                                |
| Tests      | 165 end-to-end tests in 14 files. `pnpm audit:ui` reports 0 blockers and 0 major faults across 176 page loads. See R-ACC-11.                        |
| Deployment | Vercel. CI runs format, lint, typecheck, build and end-to-end tests.                                                                                |

### 6.1 How the stylesheet changed

The build removed the old design system in three steps.

1. **M1** added Tailwind CSS beside `src/app/globals.css`. Preflight stayed
   off, because preflight and the old base rules fight each other.
   `src/app/theme.css` pulled the old file into a cascade layer named
   `legacy`, so a Tailwind utility beat an old element rule.
2. **M3** added a bridge block. The bridge gave each old custom property the
   value of the matching DOSSIER token. A screen that was not yet rebuilt
   then took the new palette. The bridge carried colour only. `design/DECISIONS.md`
   D-09 says why it did not carry the faces or the radius.
3. **M7** deleted `src/app/globals.css`, deleted the `legacy` layer, deleted
   the bridge and turned preflight on.

**Preflight is a near-complete replacement for the old base rules, not a
total one.** It owns the box sizing, the margin and padding reset, the
heading reset, the list reset, the form-control font, `border-collapse` and
the placeholder colour. It does not own everything the old file did. So 7
declarations are restored in an `@layer base` block in `src/app/theme.css`.
Each one is a declaration the old file made, that preflight does not make,
and that something on a page still needs. Two more sit in the same block:
`font-family` and `font-size` on `body`. Both are stated for clarity and not
out of need. The block holds 9 declarations in 4 rules. Nothing else from that file came
back. Read the comment above the block: it says what was left out, and it
says what each omission was measured to change.

`design/DECISIONS.md` D-03 records why the old file stayed until M7 and what
M7 measured before it went. `design/TOKEN-MAP.md` §10 records the bridge and
its removal.

---

## 7. Design Tokens

**Read `design/TOKEN-MAP.md`. It is the source of truth for every token.**
`design/BUILD-PLAN.md` §2 gives the design's own values, and
`src/app/theme.css` declares them.

The design replaced the palette. R-TKN-03 permits this. The direction is
**DOSSIER**: warm paper and ink in the light theme, cool graphite in the
dark theme, one red accent. The old purple palette is gone from the code.

| What you want                         | Where it is                                         |
| ------------------------------------- | --------------------------------------------------- |
| Each colour token, light and dark     | `design/BUILD-PLAN.md` §2.1 and `src/app/theme.css` |
| The map from an old name to a new one | `design/TOKEN-MAP.md` §3                            |
| The type scale and the 3 faces        | `design/TOKEN-MAP.md` §4.1 and §4.2                 |
| Line height and letter spacing        | `design/TOKEN-MAP.md` §4.3                          |
| The space scale                       | `design/TOKEN-MAP.md` §4.4                          |
| Radius, shadow and elevation          | `design/TOKEN-MAP.md` §4.5                          |
| The measured contrast of each pair    | `design/TOKEN-MAP.md` §6 for text, §7 for non-text  |
| The 2 breakpoints                     | §7.2 below, and `design/TOKEN-MAP.md` §8.2          |

### 7.1 Colour — HISTORY

**This table is history. It records the palette before the design replaced
it. No value here is in the code.** Read it only to understand a note that
names an old token. `design/TOKEN-MAP.md` §3.2 says where each old name
ends.

The dark palette changed in pull request #6. The light palette did not
change.

| Token               | Dark (default)          | Light                  |
| ------------------- | ----------------------- | ---------------------- |
| `--bg`              | `#131211`               | `#fbfaff`              |
| `--bg-elevated`     | `#1a1918`               | `#ffffff`              |
| `--surface`         | `#1c1b19`               | `#ffffff`              |
| `--surface-2`       | `#232120`               | `#f4f1fb`              |
| `--border`          | `#322f2d`               | `#e2dcf0`              |
| `--border-strong`   | `#464240`               | `#cdc3e6`              |
| `--text`            | `#f0eeea`               | `#1b1526`              |
| `--text-muted`      | `#b3aea6`               | `#5f5578`              |
| `--text-faint`      | `#9c968d`               | `#635a7d`              |
| `--accent`          | `#b794ff`               | `#6d28d9`              |
| `--accent-strong`   | `#9b6dff`               | `#5b21b6`              |
| `--accent-dim`      | `rgba(183,148,255,.16)` | `rgba(109,40,217,.10)` |
| `--accent-contrast` | `#141210`               | `#ffffff`              |
| `--warn`            | `#ffb4c8`               | `#9f1239`              |
| `--warn-bg`         | `rgba(255,180,200,.10)` | `rgba(159,18,57,.07)`  |
| `--warn-border`     | `rgba(255,180,200,.28)` | `rgba(159,18,57,.22)`  |

Measured contrast on the old dark palette:

| Token          | On `--bg` | On `--surface-2` |
| -------------- | --------- | ---------------- |
| `--text`       | 16.15:1   | 13.84:1          |
| `--text-muted` | 8.48:1    | 7.27:1           |
| `--text-faint` | 6.38:1    | 5.47:1           |

`design/TOKEN-MAP.md` §6 gives the same measurement for the DOSSIER
palette, in both themes.

### 7.2 Shape, type and layout

The design replaced these values too. The table below is history.

| Old token     | Old value                                 | What happened to it                                                                        |
| ------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `--radius`    | 12px                                      | Dropped. The system now holds one radius, 2px, on a chip corner. TOKEN-MAP §4.5.           |
| `--radius-sm` | 8px                                       | Dropped. There is no second radius.                                                        |
| `--font-sans` | System sans stack                         | Geist. TOKEN-MAP §4.1.                                                                     |
| `--font-mono` | System mono stack. All numbers use it.    | Geist Mono. All numbers still use it (R-CON-06).                                           |
| `--measure`   | 68ch. This is the width of a text block.  | Dropped. The design sets no text measure. TOKEN-MAP §4.4.                                  |
| `--page`      | 1180px. This is the width of the content. | Dropped. The frame is 1280px with a 60px gutter, so the content is 1160px. TOKEN-MAP §4.4. |
| —             | —                                         | Newsreader is new. It is the third face and it carries each title. TOKEN-MAP §4.1.         |

There are now **2 breakpoints**, and both are named tokens in
`src/app/theme.css`:

| Token                 | Width  | What it moves                                                                       |
| --------------------- | ------ | ----------------------------------------------------------------------------------- |
| `--breakpoint-shell`  | 1080px | The page gutter, the header row and the 360 drawer. Above it the 9 links are a row. |
| `--breakpoint-recipe` | 901px  | The recipe layout only. §10.2.2 fixes 901. Above it the ingredients are an aside.   |

At 768px the header is a drawer **and** the recipe is tabs. At 1024px the
header is a drawer **and** the recipe is an aside. One DOM draws both
states.

The audit tool tests at 360, 390, 768 and 1280.

### 7.3 Requirements

- R-TKN-01: The tokens **MUST** be Tailwind theme values. Put them in the
  `@theme` block, or in the shadcn/ui CSS variable set. **Met.**
  `src/app/theme.css` declares each raw value as a custom property under the
  design's `f-` prefix, then maps it into Tailwind with `@theme inline`.
  TOKEN-MAP §2 says why the two steps are separate.
- R-TKN-02: Both themes **MUST** work after the change. **Met.** The dark
  values are on plain `:root` and the light values come from
  `prefers-color-scheme: light`.
- R-TKN-03: The designer **MAY** change any value in §7.1 and §7.2. **Used.**
  The design replaced every one.
- R-TKN-04: A component **MUST** read a token. A component **MUST NOT** hold
  a raw colour value. **Met, and enforced.** `src/app/theme.css` clears
  Tailwind's own colour, radius, shadow, blur, type-size, line-height and
  letter-spacing namespaces, so a utility that names a raw value emits no
  rule.
- R-TKN-05: The token names **SHOULD** follow the shadcn/ui names:
  `background`, `foreground`, `card`, `popover`, `primary`, `secondary`,
  `muted`, `accent`, `destructive`, `border`, `input`, `ring`. Give a map
  from the old names to the new names. **Met.** Each token carries two
  names. `bg-paper` and `bg-background` give the same colour.
  `text-ink-3` and `text-muted-foreground` give the same colour. The
  design's name is the primary one, because a reviewer must be able to find
  it in the design file. `design/TOKEN-MAP.md` §3.1 is the map, and §3.2
  lists the 8 old names that end there and are not replaced.

---

## 8. Navigation and Routes

### 8.1 Route map

Each route is one file under `src/app/`. The shell for all of them is
`src/app/layout.tsx`.

The **Route** column is the design's name. The **File** column is the file
that serves it. M2 moved every file that had to move. See R-NAV-07.

Each screen also composes its own page foot. The foot is a parallel route
slot at `src/app/@foot/`, which mirrors the tree below. M6 added it. The design
writes a different effectivity line in the foot of each screen, and a layout
cannot read the `params` of the page below it.
`src/app/@foot/default.tsx` serves a route with no foot of its own. See D-07.

| Route                              | Screen                                                    | File today                                                                                                     |
| ---------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/`                                | Home                                                      | `src/app/page.tsx`                                                                                             |
| `/recipes`                         | All entries in groups by kind                             | `src/app/recipes/page.tsx`                                                                                     |
| `/recipes/[slug]`                  | Recipe, current revision. **This is the primary screen.** | `src/app/recipes/[slug]/page.tsx`, body in `src/components/recipe-detail.tsx`                                  |
| `/recipes/[slug]/revisions/[n]`    | An old revision                                           | `src/app/recipes/[slug]/revisions/[number]/page.tsx`                                                           |
| `/batch-logs`                      | Every run, including a run with no recipe                 | `src/app/batch-logs/page.tsx`                                                                                  |
| `/recipes/[slug]/batch-logs`       | The runs of one recipe                                    | `src/app/recipes/[slug]/batch-logs/page.tsx`                                                                   |
| `/recipes/[slug]/batch-logs/[log]` | One run with its measurements                             | `src/app/recipes/[slug]/batch-logs/[log]/page.tsx`. See D-01.                                                  |
| `/batch-logs/[log]`                | One run that names no recipe                              | `src/app/batch-logs/[log]/page.tsx`. It redirects to the nested address when the run names a recipe. See D-01. |
| `/recipes/[slug].md`               | Markdown copy for agents. There is no user interface.     | `src/app/recipes/[slug]/md/route.ts`                                                                           |
| `/science`                         | Every science note in one place                           | `src/app/science/page.tsx`                                                                                     |
| `/science/[slug]`                  | One study, keyed by recipe slug                           | `src/app/science/[slug]/page.tsx`. See D-05.                                                                   |
| `/cuisines`                        | Cuisine cards                                             | `src/app/cuisines/page.tsx`                                                                                    |
| `/cuisines/[slug]`                 | One cuisine                                               | `src/app/cuisines/[slug]/page.tsx`                                                                             |
| `/classes`                         | All classification in groups by category type             | `src/app/classes/page.tsx`                                                                                     |
| `/classes/[type]/[slug]`           | One term                                                  | `src/app/classes/[type]/[slug]/page.tsx`                                                                       |
| `/ingredients`                     | The ingredient table                                      | `src/app/ingredients/page.tsx`                                                                                 |
| `/ingredients/[slug]`              | One ingredient                                            | `src/app/ingredients/[slug]/page.tsx`                                                                          |
| `/list`                            | The combined shopping list. The URL gives the selection.  | `src/app/list/page.tsx`, plus `list-recipes.tsx` and `basket-redirect.tsx`                                     |
| `/archive`                         | The frozen Markdown archive                               | `src/app/archive/page.tsx`                                                                                     |
| `/archive/[...slug]`               | One archived note                                         | `src/app/archive/[...slug]/page.tsx`                                                                           |
| `/search`                          | Search with filters                                       | `src/app/search/page.tsx`                                                                                      |
| `/connect`                         | MCP connector help. Not indexed. Linked from the footer.  | `src/app/connect/page.tsx`                                                                                     |
| `/connect/done`                    | The agent is connected                                    | `src/app/connect/done/page.tsx`                                                                                |
| `/sign-in`                         | Administrator sign-in                                     | `src/app/sign-in/page.tsx`, form in `sign-in-form.tsx`                                                         |
| `404`                              | Not found                                                 | `src/app/not-found.tsx`                                                                                        |

Three files under `src/app/batch-logs/` are shared by the batch-log screens:
`batch-log-detail.tsx` is the body of both detail routes.
`batch-log-parts.tsx` holds the ledger, the rows and the address of a run.
`run-dates.ts` formats a run date.

### 8.2 Primary navigation

The primary navigation has 9 items in this order:

Recipes · Science · Cuisines · Classes · Ingredients · List · Batch logs ·
Archive · Search

The list control sits beside the navigation. It shows a count.

### 8.3 Requirements

- R-NAV-01: The design **MUST** show all 9 destinations and the list
  control on a screen 360px wide.
- R-NAV-02: Each navigation item **MUST** be reachable by touch and by
  keyboard at each width in §13.6.
- R-NAV-03: The 360 navigation **MUST** be a drawer. A `≡` control opens
  it. The design chose this.
- R-NAV-06: The list control **MUST** stay outside the drawer. It is visible
  at each width.
- R-NAV-07: A renamed route **MUST** redirect from its old address. The site
  is public and indexed. `/shopping-list`, `/categories`,
  `/categories/[type]/[slug]`, `/experiments`, `/experiments/[slug]`,
  `/auth` and `/oauth-return` each need a permanent redirect. M2 shipped all
  seven, and repointed the two older `/taxonomy` rules so no request takes
  two hops. `next.config.ts` holds all 9 rules. Each one is a 308.
  `e2e/redirects.spec.ts` asserts the status, the destination and that the
  destination does not redirect again.
- R-NAV-08: Every run **MUST** be reachable from `/batch-logs`. A run with
  no recipe has no nested address, so the top level index is its only
  address. See K-01.
- R-NAV-04: The header **MUST** stay at the top of the screen when the page
  scrolls.
- R-NAV-05: The height of the header changes with its content. Any element
  below the header **MUST** read that height and not a fixed value.

> **Background.** The build now scrolls the navigation sideways. A row with
> `justify-content: flex-end` and `overflow-x: auto` put 4 links off the
> start edge. No scroll could reach them. The browser reported no overflow.
> R-NAV-01 exists because of this fault.

---

## 9. Component Requirements

The **Suggested** column in each table was a suggestion to the designer. The
design made its own decision. §9.5 gives the design component that draws each
one, and the file it lives in. Only two shadcn/ui primitives are vendored:
`Sheet`, which carries the 360 drawer, and `Tooltip`, which carries the term
explanation. `design/TOKEN-MAP.md` §11 records every change made to both.

### 9.1 Shell components

| ID   | Component           | File                                                  | Function                                                          | States            | Design component                     |
| ---- | ------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- | ----------------- | ------------------------------------ |
| C-01 | Skip link           | `src/components/f/skip-link.tsx`                      | Moves the keyboard focus to `#main`.                              | hidden, focused   | `F/Skip link`                        |
| C-02 | Site header         | `src/components/f/site-header.tsx`                    | Holds the brand, the list control and the navigation.             | —                 | `F/Site header`, `F/Site header 360` |
| C-03 | List control        | `src/components/shopping-basket.tsx` → `BasketButton` | Shows the count of collected recipes. Links to the list.          | hidden, 1 or more | `List control`                       |
| C-04 | Site footer         | `src/components/f/page-foot.tsx`, `src/app/@foot/`    | Holds the document issue, the connector link and the source link. | —                 | `F/Page foot`                        |
| C-20 | Header height probe | `src/components/header-height.tsx`                    | Measures the header. Writes the value to `--header-h`.            | —                 | none. It has no user interface.      |

- R-CMP-01: The list control **MUST** be hidden when the list is empty.
- R-CMP-02: The list control **MUST NOT** be inside the navigation or the
  360 drawer.

> **The footer no longer holds a copyright.** The design draws an
> effectivity line in that slot, not a copyright, and it draws no `©`
> anywhere. The default is the document issue, `Issue 01 · 08 Sep 2026`, a
> constant in `src/lib/site.ts`. Each screen replaces it with its own
> effectivity. See `design/DECISIONS.md` D-07.

### 9.2 Content components

| ID   | Component       | File                                            | Function                                                                                                                                           | States                                                                         | Suggested          |
| ---- | --------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------ |
| C-05 | Recipe card     | `src/components/recipe-card.tsx` → `RecipeCard` | Shows a kind badge, a revision badge, a title link, a subtitle, a summary and up to 3 terms. **The summary is no longer cut. See §20.7 and D-11.** | with or without each optional field                                            | `Card`             |
| C-06 | Recipe grid     | `src/components/recipe-card.tsx` → `RecipeGrid` | Shows recipe cards in a grid.                                                                                                                      | full, empty                                                                    | —                  |
| C-07 | Term tag        | `src/components/tags.tsx` → `TermTag`           | Shows one term. It links to the term page. It shows the term explanation.                                                                          | primary, normal; with or without an explanation; with or without a type prefix | `Badge`, `Tooltip` |
| C-08 | Term list       | `src/components/tags.tsx` → `TermList`          | Shows a row of term tags with a `+n` overflow chip.                                                                                                | —                                                                              | —                  |
| C-09 | Term hierarchy  | `src/components/term-hierarchy.tsx`             | Shows the parent term and the more specific terms.                                                                                                 | —                                                                              | —                  |
| C-10 | Note block      | `src/components/notes.tsx`                      | Shows one note: a kind badge, a title, a Markdown body and the sources. There are **8 kinds**.                                                     | 8 kinds; with or without a title; with or without sources                      | `Alert`, `Card`    |
| C-11 | Markdown        | `src/components/markdown.tsx`                   | Renders Markdown with GFM.                                                                                                                         | —                                                                              | `Typography`       |
| C-12 | Database notice | `src/components/database-notice.tsx`            | Tells the reader that the database is not available. It tells the reader what to do.                                                               | not configured, read failed                                                    | `Alert`            |

- R-CMP-03: The term tag **MUST** show its explanation on hover **and** on
  keyboard focus.
- R-CMP-04: The term tag **MUST NOT** use the `title` attribute for the
  explanation. You cannot style it. It has a delay. It does not show on
  keyboard focus.
- R-CMP-05: The term hierarchy **MUST** show nothing when a term has no
  parent and no children. Most terms are flat.
- R-CMP-06: Each of the 8 note kinds **MUST** have a different visual
  treatment. The kinds are: observation, research, substitution, warning,
  result, idea, correction and science. **Met, and the design answered it a
  second way.** The 8 kinds carry 3 severities: note, caution and warning.
  The severity gives the colour, and the kind word gives the rest. A label
  reads `NOTE · OBSERVATION` or `CAUTION · SUBSTITUTION`. A warning drops
  the second half and reads `WARNING`. `SEVERITY_BY_KIND` in
  `src/components/f/mark.tsx` is the map, and `NOTE_KIND_LABELS` in
  `src/lib/site.ts` holds the 8 words. This is the answer to Q-06.
- R-CMP-07: The 4 recipe kinds **MUST** be easy to tell apart. The kinds are:
  recipe, preparation, process and research. **Met by the word, not by a
  colour.** The design draws all 4 as the same solid `f-accent` block
  (`F/Mark`). `KIND_LABELS` in `src/lib/site.ts` holds the 4 words. It also
  holds `science`, which labels a note kind and not a recipe kind.
- R-CMP-08: A badge, a term tag, a step chip and a shop chip **MUST** be easy
  to tell apart. **Met.** The 4 are now 4 different components: `F/Mark` is
  a solid block, `F/Tag` is a bare run of type, `F/Ingredient callout` is a
  boxed amount and `F/List mark` is a square.

### 9.3 Interactive components

These 8 components run in the browser. The build added 3 more to
`src/components/`, so there are 11. §9.3.1 names the 3 and says why each one
had to run in the browser.

| ID   | Component             | File                                                 | Function                                                                                                                             | States                        | Suggested                       |
| ---- | --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------- |
| C-13 | Recipe tabs           | `src/components/recipe-tabs.tsx`                     | Shows up to 4 panels. On a phone each panel is a tab. On a desktop the ingredients are an aside and the tabs switch the main column. | see §10.2.2                   | `Tabs`                          |
| C-14 | Ingredient checklist  | `src/components/ingredient-checklist.tsx`            | Shows the ingredients as a list with tick boxes. It has two orders, a batch control, a count and a clear control.                    | see §10.2.6                   | `Checkbox`, `ToggleGroup`       |
| C-15 | Scale provider        | `src/components/scale.tsx`                           | Holds the batch value for the full page.                                                                                             | scale 1, scale not 1          | none. It has no user interface. |
| C-16 | Shopping checklist    | `src/components/shopping-checklist.tsx`              | Shows the combined list in groups by shop area. It has a tick-all control.                                                           | none, some, all ticked        | `Checkbox`                      |
| C-17 | Filterable groups     | `src/components/filterable-groups.tsx`               | Filters any view that shows items inside groups. It has 3 layouts: row, list and table.                                              | no query, matches, no matches | `Input`, `Command`              |
| C-18 | Add to list           | `src/components/shopping-basket.tsx` → `AddToBasket` | Adds this recipe to the list. It also removes it.                                                                                    | not in list, in list          | `Button`                        |
| C-19 | Step ingredient chips | `src/components/step-ingredients.tsx`                | Shows what one step uses. Each chip holds an amount and a name.                                                                      | 0 chips (hidden), 1 or more   | `Badge`                         |
| C-20 | Header height probe   | `src/components/header-height.tsx`                   | See §9.1.                                                                                                                            | —                             | —                               |

- R-CMP-09: The recipe tabs **MUST** use one DOM at each width. The
  stylesheet decides what a reader sees.
- R-CMP-10: A panel that is not active **MUST** be hidden. It **MUST NOT**
  be unmounted. The ticks, the chosen order and the batch value must survive
  a tab change.
- R-CMP-11: The scale provider **MUST** supply one value to each part of the
  page that shows a quantity. The page **MUST NOT** show two batch sizes.
- R-CMP-12: The tick-all control **MUST** show an indeterminate state when
  some rows are ticked and some are not.
- R-CMP-13: The add-to-list control **MUST** be in the HTML from the
  server. It corrects its label after the page loads.
- R-CMP-14: A step chip **MUST** hold a real space between the amount and the
  name. A flex gap is not enough.

> **Background for R-CMP-14.** A flex gap is invisible to `textContent`. A
> screen reader read "1 kgJalapeño". A copied chip pasted the same way. The
> layout looked correct and the content was wrong.

> **The rule is wider than the chip, and M7 closed the last of it.** M4 put
> a real space in `F/Band`, `F/Note`, `F/Citation`, `F/Mechanism`,
> `F/Table row`, `F/List row`, `F/Revision` and `F/Section label`. Three
> label-and-value components were missed and were found in the M7 review:
> `F/Stat` and `F/Measure` in `src/components/f/stat.tsx`, and
> `BatchSource` in `src/components/f/batch-line.tsx`. Measured on the
> running build, `/` read `Recipes5 Revisions11 Ingredients42`,
> `/batch-logs` read `SourceBaumy Biltong` and a recipe's step meta read
> `WorkButchery` and `Time1 d–2 d`. All three now carry the same
> whitespace-only text run, which CSS Flexbox §4 does not render as a flex
> item, so no drawing moved.

- R-CMP-15: A step chip **MUST** show only an ingredient line that is in
  this revision. Do not invent a chip for a name that does not resolve.

#### 9.3.1 The 3 the build added

| Component     | File                              | Why it runs in the browser                                                                                                                                                |
| ------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Navigation`  | `src/components/f/nav-drawer.tsx` | The design marks the open destination in the header and the open section in the drawer. A layout cannot read the address of the page below it, so it reads `usePathname`. |
| `Contents360` | `src/components/f/nav-drawer.tsx` | The 360 drawer. It needs open state, a focus trap and an Escape key. R-NAV-03 requires the drawer.                                                                        |
| `Sheet`       | `src/components/ui/sheet.tsx`     | The vendored shadcn/ui overlay that carries the drawer.                                                                                                                   |
| `Tooltip`     | `src/components/ui/tooltip.tsx`   | The vendored shadcn/ui panel that carries the term explanation (R-CMP-03, R-ACC-02).                                                                                      |

`Navigation` and `Contents360` are in one file, so the client boundary is
one file. Both still render to HTML on the server.

`src/app/announcer.tsx` is a fourth client module. It is the document's one
polite live region (R-ACC-06). It is a direct child of `<body>` and not a
descendant of the shell. A live region inside the shell would hold the whole
shell in the accessibility tree while the drawer is open. It lives
in `src/app/`, so it is not one of the components this section counts.

> **The cost.** With JavaScript off, the header below 1080px shows no
> destination. The row of 9 links is `display: none` and the drawer cannot
> open. R-NAV-03 makes the drawer mandatory, so this is the cost of the
> rule. Every screen is still reachable from a link in the page body.

### 9.4 Layout patterns

These were CSS classes in `src/app/globals.css`. That file is gone. Each
pattern is now a Tailwind utility set inside the component that draws it,
and the components are the ones §9.5 names.

`.page` `.prose-page` `.hero` `.section` `.section-head` `.panel` `.grid`
`.card` `.row` `.stats` `.stat` `.breadcrumb` `.badge` `.tag` `.notice`
`.empty` `.faint` `.lede` `.numeric` `.timeline` `.steps` `.step-meta`
`.step-uses` `.method` `.recipe-layout` `.recipe-column` `.recipe-main`
`.recipe-aside` `.recipe-tabs` `.scale-bar` `.scale-stepper` `.scale-of`
`.table-scroll` `.filter-bar` `.search-bar` `.field` `.button-primary`
`.button-secondary`

**None of these names is in the markup.** A test or an audit that has to
find one box reads a `data-` attribute instead — `data-group`,
`data-recipe-column`, `data-step-uses`, `data-basket-control`. An attribute
cannot be mistaken for a style hook and it cannot pick up a rule by
accident. Each one carries a comment that says which test reads it. Do not
bring a class name back for this.

---

### 9.5 The design components

The design holds 36 components. Each name starts with `F/`. Each one is
built. They live in 25 files under `src/components/f/`.

Two rows below are not `F/` names. `Figure 1 — Mass flow` is a shape the
design draws once, on the recipe screen. `F/Band` is the build's own name
for the page spine. The design draws that spine on every screen. It names
each one after its content, such as `CONTENTS` or `MECHANISMS`, rather than
as a component.

**One file holds one family.** The exported symbol carries the design's
name; the file groups the family that shares its measurements. The design's
own families differ by one value. `F/Mark` and `F/Mark quiet` differ by a
ground. `F/Site header` and `F/Site header 360` differ by one step of every
value. Two files for one family copy a constant twice. The two copies can
then drift. `design/DECISIONS.md` D-06 records this and holds the full
map.

| Design component                                | File                                                             | Covers                                      |
| ----------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| `F/Skip link`                                   | `src/components/f/skip-link.tsx`                                 | C-01                                        |
| `F/Site header`, `F/Site header 360`            | `src/components/f/site-header.tsx`                               | C-02, C-03                                  |
| `F/Site header > Navigation`, `Contents — 360`  | `src/components/f/nav-drawer.tsx`                                | The 9 destinations and the 360 drawer       |
| `F/Page head`, `F/Page head 360`, `F/Page hero` | `src/components/f/page-head.tsx`                                 | The hero, §10.2.1                           |
| `F/Page foot`                                   | `src/components/f/page-foot.tsx`, and `src/app/@foot/` per route | C-04                                        |
| `F/Band`                                        | `src/components/f/band.tsx`                                      | The page spine: a label, a body and a meta  |
| `F/Breadcrumb`                                  | `src/components/f/breadcrumb.tsx`                                | The breadcrumb                              |
| `F/Section label`, `F/Section 360`              | `src/components/f/section-label.tsx`                             | The section heading                         |
| `F/Mark`, `F/Mark quiet`                        | `src/components/f/mark.tsx`                                      | The kind badge and the revision badge       |
| `F/Tag`, `F/Tag CTA`, `F/Tag hierarchy`         | `src/components/f/tag.tsx`                                       | C-07, C-08, C-09                            |
| `F/Recipe card`, `F/Index card`                 | `src/components/f/recipe-card.tsx`                               | C-05, C-06                                  |
| `F/Ingredient row`, `F/Ingredient callout`      | `src/components/f/ingredient-row.tsx`                            | C-14 rows, C-19 step chips                  |
| `F/List row`, `F/List mark`                     | `src/components/f/list-row.tsx`                                  | The shopping row and the source recipe chip |
| `F/Table row`                                   | `src/components/f/table-row.tsx`                                 | The ingredient table row                    |
| `F/Revision`                                    | `src/components/f/revision.tsx`                                  | The timeline entry                          |
| `F/Batch line`                                  | `src/components/f/batch-line.tsx`                                | The batch log row                           |
| `F/Provenance line`                             | `src/components/f/provenance.tsx`                                | The provenance row                          |
| `F/Footnote`, `F/Warning`, `F/Note reference`   | `src/components/f/note.tsx`                                      | C-10, the 8 note kinds                      |
| `F/Mechanism`                                   | `src/components/f/mechanism.tsx`                                 | §10.9, new                                  |
| `F/Citation`                                    | `src/components/f/citation.tsx`                                  | The literature block and §10.9, new         |
| `Figure 1 — Mass flow`                          | `src/components/f/mass-flow.tsx`                                 | R-SCR-39, new. See D-12 and §20.3.          |
| `F/Stat`, `F/Measure`                           | `src/components/f/stat.tsx`                                      | The statistic and the "At a glance" value   |
| `F/Button`                                      | `src/components/f/button.tsx`                                    | The controls                                |
| `F/Field`, `F/Filter`                           | `src/components/f/field.tsx`                                     | The form field, C-17                        |
| `F/Notice`, `F/Empty`                           | `src/components/f/notice.tsx`                                    | C-12, the empty state                       |

- R-CMP-16: A build **MUST** use the design's component names. Do not carry
  the class names in §9.4 forward. **Met.** Two exports were renamed to the
  design's own words: `PrimaryNav` became `Navigation` and `NavDrawer`
  became `Contents360`. The design's name is greppable from the code, and
  the code from the design. See D-06.

**Four treatments in the build are not in the design.** The design has no
case where each question arises, so each one is an invention and each one is
recorded where it lives.

| Treatment           | Where                         | Why it exists                                                                                                                                                                                                  |
| ------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FOCUS_RING`        | `src/components/f/button.tsx` | R-ACC-05. Each control must show a visible focus state.                                                                                                                                                        |
| `FOCUS_RING_WITHIN` | `src/components/f/button.tsx` | The same, for a control whose focus lands on a child.                                                                                                                                                          |
| `PROSE_LINK`        | `src/components/f/button.tsx` | C-11 and C-12 both need a link inside running prose. The design draws none. The accent alone measures 1.90:1 against the ink; WCAG 1.4.1 asks 3:1, so the treatment is the accent plus an underline. See D-10. |
| The `+n` chip       | `src/components/tags.tsx`     | C-08 asks for an overflow chip. The design draws 3 terms and never a fourth, so it draws no overflow. The chip is mono, 13px, `f-ink-3`, with no box — a box would read as a step chip (R-CMP-08).             |

## 10. Screen Requirements

### 10.1 Home — `/`

The screen has 5 blocks in this order:

1. **Hero.** The site name, two sentences about revisions, and one primary
   control to `/search`.
2. **Statistics.** Six counts: Recipes, Revisions, Ingredients, Tags, Notes
   and Experiments.
3. **Recently revised.** Six recipe cards and a link to all recipes.
4. **Browse by classification.** One block for each category type. Each
   block shows up to 14 terms.
5. **How this works.** Four cards.

- R-SCR-01: Block 3 and block 4 **MUST** be absent when they have no
  content.
- R-SCR-02: Block 2 **MUST** be replaced by the database notice when the
  database is not available.

### 10.2 Recipe — `/recipes/[slug]`

This is the primary screen. Pull request #6 changed it. Read §10.2.2 first.

#### 10.2.1 Hero

The hero shows these items in this order:

1. A kind badge.
2. A revision badge, `revision n`.
3. An OPTIONAL source badge, `via <source>`.
4. The title.
5. An OPTIONAL subtitle.
6. An OPTIONAL summary.
7. An OPTIONAL image with a caption.
8. The term list with category type prefixes.
9. An OPTIONAL notice for an old revision.
10. The **Add to shopping list** control.

- R-SCR-03: The add-to-list control **MUST** be above the tabs. It
  **MUST NOT** be inside a tab panel.
- R-SCR-04: The control **MUST** be visible on a phone without a scroll.

> **Background.** The control was inside the Ingredients panel. On a phone,
> the browser hides the panel that is not active. The control then measured
> 0 × 0 when a reader selected Method. It was also about 2.9 screens down
> the page.

#### 10.2.2 Panel layout

There are up to 4 panels. The recipe decides which panels exist.

| Panel       | Present when                                             |
| ----------- | -------------------------------------------------------- |
| Ingredients | The revision has ingredients or a yield.                 |
| Method      | Always.                                                  |
| Science     | The recipe has a science note, or it has a recorded run. |
| Revisions   | The recipe has more than one revision.                   |

**Phone — 900px wide and less.** Each panel is a tab. The reader sees one
panel.

**Desktop — 901px wide and more.** The Ingredients panel is an aside. It
stays on screen. The tab strip switches the main column between Method,
Science and Revisions. The Ingredients tab is not offered.

- R-SCR-27: A tab **MUST NOT** exist when its panel has no content. A tab
  that opens an empty panel reads as lost content.
- R-SCR-28: The tab strip and the panels it switches **MUST** be in one
  column. They **MUST NOT** be two rows of the page grid.
- R-SCR-29: A recipe with no aside **MUST** use the full width.
- R-SCR-30: On a desktop with only Ingredients and Method, the tab strip
  **MUST** be hidden. There is nothing left to switch.

> **Background — 2 faults that this repaired.**
>
> 1. The Revisions panel started 2185px down the page, under an empty
>    screen. `grid-row: 1 / -1` collapses to one row when no rows are
>    declared. An aside taller than the active panel grew the row that held
>    the tab strip. The panel was visible for the full time it was unusable.
> 2. A research write-up held a third of the desktop screen open. It has no
>    ingredients and no yield to put in the aside.

#### 10.2.3 Panel contents

| Panel       | Blocks, in order                                                       |
| ----------- | ---------------------------------------------------------------------- |
| Ingredients | At a glance · Ingredients                                              |
| Method      | Why this revision · Method · Notes · Provenance · Related · Literature |
| Science     | Batch logs · The science                                               |
| Revisions   | The revision timeline                                                  |

Each block is absent when it has no content.

**At a glance** holds Yield, Servings, Total time and Active time.

**Notes** holds all note kinds except science.

**Related** holds cards for links out and links in. The 5 link kinds are:
Derived from, Variant of, Component of, Pairs with and References.

**Literature** holds the citations of the recipe. Each citation gives the
work, the part of it, and the date a person read it. It is new in the
design.

- R-SCR-38: The literature block **MUST** be absent when the recipe cites
  nothing. Most recipes cite nothing.
- R-SCR-39: The recipe **MAY** show a mass flow figure below the hero. It
  gives the weight of the food at each stage, for example 10 kg raw to
  4.5 kg dried. Show it only for a recipe that loses or gains weight in a
  way the reader must plan for. **Built.** `recipe_mass_flows` holds one
  figure for each revision, not for each recipe, because two batches of one
  recipe weigh different amounts. `F/Mass flow` draws nothing at all when a
  revision has no figure. See D-12 and §20.3.

- R-SCR-05: The yield and the servings **MUST** show the scaled value.
- R-SCR-06: The times **MUST NOT** scale.
- R-SCR-07: Each timeline entry **MUST** show the revision number and the
  rationale. The current revision **MUST** be marked.
- R-SCR-08: A backfilled entry **MUST** also show the date and the words
  "recorded later". The number tells you when a person wrote the revision
  down. The date tells you when the revision existed.

#### 10.2.4 A step

Each step shows these items:

1. The instruction.
2. An OPTIONAL note.
3. An OPTIONAL image with a caption.
4. **The step chips.** Each chip holds an amount and an ingredient name.
5. A meta row: an OPTIONAL duration, an OPTIONAL temperature, an OPTIONAL
   technique term and OPTIONAL equipment.

- R-SCR-09: The steps **MUST** be in groups under a phase heading. The steps
  **MUST** be numbered.
- R-SCR-31: A step chip **MUST** show the scaled amount. A chip that says
  "10 g" beside a list that says "30 g" is worse than no chip.
- R-SCR-32: A step chip **MUST** link to the ingredient page when the
  ingredient is in the ingredient list.
- R-SCR-33: The step chips and the meta row **MUST** be easy to tell apart.
  One holds ingredients. The other holds conditions.
- R-SCR-11: The science block **MUST** have a visual treatment that is
  different from the notes block.

#### 10.2.5 The batch control

There are **two forms**. The revision decides which form the screen shows.

**Form A — the servings stepper.** Use this when the revision declares
servings. The label is "For". The control is a minus button, a text field
and a plus button. One step is one serving. A readout shows the word
"servings" and the multiplier when the multiplier is not 1.

**Form B — the batch multiplier.** Use this when the revision declares a
yield but no servings. The label is "Batch". The control is a text field and
4 preset buttons: ×0.5, ×1, ×2 and ×3. One step is ×0.5.

- R-SCR-34: The screen **MUST** show one form only. Two forms are two
  answers to one question.
- R-SCR-35: The text field **MUST** be `type="text"` with
  `inputMode="decimal"`. A number field empties itself in Chrome during a
  partial entry.
- R-SCR-36: The scale range **MUST** be 0.1 to 100.
- R-SCR-37: A step **MUST** move the box, not the multiplier. One more
  serving on a 4-serving recipe is 5 servings, which is ×1.25. It is not 5
  batches.

> **Background.** "For 50 −/+" is a question a cook can answer. "×1" asks
> the cook to know what one batch is first. A biltong recipe makes 4.5 kg
> dried and has no servings, so a stepper there would count something the
> recipe never claimed.

#### 10.2.6 The ingredient checklist

**Order control.** There are two orders.

- _Shop order._ The rows are in groups by ingredient category. The sequence
  follows a walk through a shop. Produce is first. Cupboard items are last.
  This is the default.
- _As written._ The rows keep the components of the recipe, for example
  "Wash", "Dredge" and "Duxelles".

**Row.** Each row shows: a tick box, the amount, the name, an OPTIONAL
preparation, an OPTIONAL "(optional)" mark and an OPTIONAL note.

- R-SCR-12: The amount **MUST** use the monospace face.
- R-SCR-13: The name **MUST** link to the ingredient page when the
  ingredient is in the ingredient list.
- R-SCR-14: The screen **MUST** show the count of ticked rows and the total.
- R-SCR-15: A clear control **MUST** be visible only when one or more rows
  are ticked.

### 10.3 Old revision — `/recipes/[slug]/revisions/[n]`

The screen is the same as §10.2.

- R-SCR-16: The screen **MUST** show a notice. The notice tells the reader
  that a newer revision exists. The notice **MUST** link to the current
  revision.

### 10.4 Recipes — `/recipes`

The screen shows a hero with a total count. It then shows one section for
each kind: Recipe, Preparation, Process and Research. Each section has a
heading, a count and a card grid.

### 10.5 Search — `/search`

The form has two rows.

- Row 1: Text, Must include, Must exclude. The two ingredient fields take a
  list. A comma separates each item.
- Row 2: Cuisine, Technique, Kind and the submit control. Each cuisine and
  technique option shows its recipe count.

- R-SCR-17: The form **MUST** be a plain GET form. It **MUST** work when the
  browser has no JavaScript. The query string holds all the state.
- R-SCR-18: The filters combine with AND. The results heading **MUST** state
  the active filters in words.

The screen has 4 result states:

| State       | Content                                        |
| ----------- | ---------------------------------------------- |
| No filters  | A prompt and a link to all recipes.            |
| No matches  | "Nothing matched. Try to remove a filter."     |
| Matches     | The count, the filter summary and a card grid. |
| No database | The database notice.                           |

### 10.6 Shopping list — `/list`

The URL holds the selection. This makes a list shareable. The collected
recipes in the browser are the working set. They make the URL.

**No selection in the URL.** The server cannot tell an empty list from a
plain link. A browser component decides. It sends the reader to the URL of
the collected recipes, or it shows an empty state.

**A selection in the URL.** The screen shows:

1. A hero with the count of items and the count of recipes.
2. An OPTIONAL notice for a slug with no recipe.
3. The source recipe chips. A reader can remove each one.
4. The checklist.

**Row.** Each row shows: a tick box, the combined amount, the name, an
OPTIONAL "optional" badge and the source recipes.

- R-SCR-19: Two amounts **MUST** add together only when one unit converts
  into the other. 800 g and 1 kg become 1.8 kg. Two cloves and ten heads
  stay apart.
- R-SCR-20: An amount with no quantity **MUST** show "some".
- R-SCR-21: Each source recipe **MUST** link to its recipe page. The row
  **MUST** also show the original text of the ingredient line.

### 10.7 Ingredients — `/ingredients`

The screen shows a table with a filter. The rows are in groups by category
in shop order. The columns are: Ingredient, Also known as, Recipes.

- R-SCR-22: The filter **MUST** match an alias. The word "cilantro" must
  find coriander.
- R-SCR-23: An alias **SHOULD** be less prominent than the name.

The detail page shows the name, the category, the aliases, the density, the
substitutes, the notes and the recipes that use it.

### 10.8 Classes, cuisines, batch logs and archive

`/classes` shows the terms in groups by category type. Each category type
has one line of plain English. The 10 types are: Cuisine, Course, Technique,
Diet, Season, Equipment, Occasion, Preservation, Texture and Ingredient
class.

- R-SCR-24: The filter **MUST** match the term explanation. The word
  "numbing" must find Sichuan.

`/cuisines` shows a card grid of label, explanation and recipe count.
Cuisine is the only category type with its own top level route.

`/batch-logs` shows a card grid of title, summary, start date and source
recipe. It lists every run. A run with no recipe shows an empty source and
is listed with the rest. `/recipes/[slug]/batch-logs` shows the same grid
filtered to one recipe.

The detail page shows the outcome, the measurements and the notes. The
measurements are a data table. It holds the weight of each piece, the drying
times and the costs.

- R-SCR-44: The batch log card **MUST** read correctly with no source
  recipe. The design **MUST** draw this state.

`/archive` shows a card grid in groups by section. Each card shows the
title, the summary and the original file path. The detail page shows frozen
Markdown.

- R-SCR-25: The archive **MUST** work when there is no database. The server
  reads these files from the repository.

### 10.9 Science — `/science` and `/science/[slug]`

These 2 routes are new in the design. Science is still a tab on a recipe.
These routes collect the science from every recipe in one place.

`/science` is an index. It shows one card for each science note. Each card
gives the note title, the recipe it belongs to and the first line of the
body.

`/science/[slug]` is one note. It shows the note body, its mechanisms and
its citations. A **mechanism** is a block that tells you what happens in the
food and why. It carries a name, an explanation and the conditions, for
example a temperature, a time and a layer depth.

- R-SCR-40: A science note **MUST** link back to its recipe.
- R-SCR-41: A mechanism **MUST** show its conditions as separate values. Do
  not write them into a sentence. **Met.** `notes.conditions` holds the
  values, `F/Mechanism` draws them as a mono run with a middle dot between
  each pair, and the seed fills 9 notes. Only the separator glyph is
  `aria-hidden`. `e2e/render.spec.ts` guards it. See D-02.
- R-SCR-42: A citation **MUST** show the work, the part and the date a
  person read it.
- R-SCR-43: `/science` **MUST** show an empty state when no recipe has a
  science note.

### 10.10 Connect, sign-in, connect done and 404

`/connect` is a text page. It shows the endpoint in a code block, numbered
steps, the tool lists and a safety section. `/connect/done` tells the reader
that the agent is connected.

- R-SCR-26: The sign-in screen, the connect done screen and the 404 screen
  have low traffic. They **MUST NOT** look unfinished.

---

## 11. State Requirements

Each screen **MUST** cover these states.

| ID       | State             | Behaviour                                                                          |
| -------- | ----------------- | ---------------------------------------------------------------------------------- |
| R-STA-01 | No database       | Show a notice. Tell the reader about `DATABASE_URL`. Link to the archive.          |
| R-STA-02 | Read failed       | Show a notice. Tell the reader the problem is temporary. Link to the archive.      |
| R-STA-03 | Empty collection  | Show one sentence with a style.                                                    |
| R-STA-04 | No filter matches | Show `Nothing matches "<query>".`                                                  |
| R-STA-05 | Partial data      | Almost all fields can be empty. The design **MUST NOT** assume a field is present. |
| R-STA-06 | Old revision      | Show a notice with a link to the current revision.                                 |
| R-STA-07 | Long content      | The store can hold 800 recipes. A list can hold 40 rows. A table can be wide.      |

- R-STA-08: A wide table **MUST** scroll inside its own container.
- R-STA-09: The page body **MUST NOT** scroll sideways.

These fields can be empty: subtitle, summary, image, yield, servings, total
time, active time, phase, note, source, alias, term explanation, rationale,
step chips, science and second revision.

---

## 12. Data Storage Requirements

The browser keeps 3 items.

| Key                            | Scope                  | Meaning                                                                                  |
| ------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------- |
| `nn:checked:{slug}:{revision}` | One recipe revision    | "I have this in the cupboard."                                                           |
| `nn:shopping:{sorted slugs}`   | One shopping selection | "This is in the trolley."                                                                |
| `nn:basket`                    | The browser            | The recipes that a person collects. The key keeps its name. It is not shown to a reader. |

- R-STO-01: Each read and each write **MUST** be inside a `try/catch` block.
  A private window must degrade. It must not fail.
- R-STO-02: The code **MUST** read the storage after the page mounts. It
  **MUST NOT** read the storage during the render.
- R-STO-03: Two browser tabs **MUST** stay in step. Use the `storage` event.
- R-STO-04: Two components in one tab **MUST** stay in step. Use the
  `nn:basket-changed` event.
- R-STO-05: A remove operation **MUST** change the stored list in place. It
  **MUST NOT** write a full new array. A full write destroys a recipe that
  is in the basket but not in the URL.
- R-STO-06: The ticks **MUST** be stored for each revision. A new ingredient
  in a new revision must not be ticked at the start.
- R-STO-07: The scale **MUST NOT** be stored.

---

## 13. Accessibility Requirements

The build meets these rules today. Treat them as acceptance criteria.

### 13.1 Contrast

- R-ACC-01: Each text colour **MUST** meet WCAG AA against `--bg`,
  `--surface` and `--surface-2`, in both themes. See the measured values in
  §7.1.

`--text-faint` carries the step duration, the oven temperature, the word
"optional", the source recipe of a shopping row and the only sentence in
each empty state. It is not decorative text.

### 13.2 Tooltips

- R-ACC-02: The term explanation **MUST** show on hover and on keyboard
  focus.
- R-ACC-03: The explanation **MUST** use `aria-describedby`.

### 13.3 Focus

- R-ACC-04: The skip link **MUST** move the focus. Put `tabIndex={-1}` on
  `<main>`. Safari does not move the focus without it.
- R-ACC-05: Each control **MUST** show a visible focus state.

### 13.4 Announcements

- R-ACC-06: Each count that changes **MUST** be in a polite live region.
- R-ACC-07: The tabs **MUST** use `tablist`, `tab` and `tabpanel` roles.
- R-ACC-08: Each toggle group **MUST** use `aria-pressed`.
- R-ACC-12: The stepper buttons **MUST** have a label. Use "One more
  serving" and "One fewer serving". A minus sign and a plus sign alone are
  not enough.

### 13.5 Motion and input

- R-ACC-09: The design **MUST** obey `prefers-reduced-motion: reduce`.
- R-ACC-10: No function **MUST** depend on hover only. Obey
  `@media (hover: none)`.

### 13.6 Geometry

- R-ACC-11: The design **MUST** pass `pnpm audit:ui`. The tool drives each
  route at 360, 390, 768 and 1280 pixels, in 2 states. It reports geometric
  faults. **Met.** The result is 0 blockers and 0 major faults across 176
  page loads — 22 routes × 4 widths × 2 states. `scripts/audit-ui.ts` holds
  the route list. The audit also reports 52 minor faults. Each one
  is a control under 24 × 24 pixels. `design/BUILD-PLAN.md` §6.1 holds the
  shape they share. It also says why a naive fix makes it worse. §6.5 of the same
  document records the 2 screens the route list does not reach.
- R-ACC-13: A panel **MUST** start where its tab strip ends. Measure the box
  of each panel against the strip that opened it. "It is visible" is not the
  test.

> **Background.** The `UNREACHABLE` check exists because of a real fault. A
> flex row with `justify-content: flex-end` and `overflow-x: auto` put its
> overflow off the start edge. `scrollWidth` was equal to `clientWidth`. The
> browser reported no overflow. Four navigation links were gone.

---

## 14. Implementation Constraints

### 14.1 The stack

- R-CON-10: The build **MUST** use Tailwind CSS.
- R-CON-11: The build **MUST** use shadcn/ui.
- R-CON-12: Tailwind and shadcn/ui replace `src/app/globals.css`. Both
  themes **MUST** work after the change. **Met in M7.** The file, the
  `legacy` cascade layer and the palette bridge are all gone, and Tailwind's
  preflight is on. See §6.1.
- R-CON-13: The design **MUST** name one shadcn/ui component for each
  component in §9, or it **MUST** say that the component is custom.

### 14.2 The rendering model

- R-CON-01: The pages **MUST** stay Server Components by default. Only the 8
  components in §9.3 run in the browser. A shadcn/ui component that makes
  the recipe body, the ingredient table or the archive a client component is
  a fault. **Met for every page. 3 more components run in the browser than
  this rule allows, and each one is recorded in §9.3.1 and §20.7.** The
  recipe body, the ingredient table and the archive are all still Server
  Components.
- R-CON-02: A Server Component can pass JSX across the boundary. It cannot
  pass a function. A render callback **MUST NOT** be used at this boundary.
  The `FilterableGroups` component exists for this reason.
- R-CON-03: The search form **MUST** stay a plain GET form.
- R-CON-04: The add-to-list control **MUST** be in the HTML from the
  server.

### 14.3 The visual model

- R-CON-05: On a phone each recipe panel is a tab. On a desktop the
  ingredients are an aside and the tabs switch the main column.
- R-CON-06: All numbers **MUST** use the monospace face.
- R-CON-07: The design **MUST** be dark first. The light theme comes from
  `prefers-color-scheme`.
- R-CON-08: There is no theme control today. To add one is a product
  decision. Do not assume it.
- R-CON-09: The dark ground **MUST** stay near neutral. See R-TON-05.

---

## 15. Design Deliverables

The designer supplied these items. Each row says what was delivered and
where. **Do not read the deliverable IDs here as the decision IDs in
`design/DECISIONS.md`. The two sets share their numbers and mean different
things.**

| ID   | Deliverable                                                                                                                                 | Delivered | Where                                                                                                                                                                                                                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | Foundations: colour for both themes, the type scale, spacing, radii, elevation, focus rings and motion. Give them as Tailwind theme tokens. | Yes       | `design/BUILD-PLAN.md` §2 and `design/TOKEN-MAP.md` §3 and §4. Built in `src/app/theme.css`. The focus ring is `FOCUS_RING` in `f/button.tsx`. The design draws **no motion and no elevation**: the 18 exports hold no transition, no animation, no keyframe and no shadow. The one moving part is the drawer overlay, and `src/app/theme.css` stops it under `prefers-reduced-motion: reduce`. |
| D-02 | A distinct treatment for each component in §9. This is the main task.                                                                       | Yes       | 36 components on Plate II. Built in the 25 files in §9.5.                                                                                                                                                                                                                                                                                                                                       |
| D-03 | A navigation design for a screen 360px wide. It holds 9 destinations and the list control.                                                  | Yes       | The drawer, `oP097.png`. Built as `Contents360` in `f/nav-drawer.tsx`.                                                                                                                                                                                                                                                                                                                          |
| D-04 | The recipe screen at 360, 768 and 1280 pixels. Show the change from tabs to aside plus tabs.                                                | In part   | 1280 (`zMdv1.png`) and 360 (`wM3LG.png`) are drawn. **768 is not drawn.** The build reads it as the tab state, because 768 is below the 901px breakpoint.                                                                                                                                                                                                                                       |
| D-05 | The full ingredient checklist: both orders, ticked rows, unticked rows and the count.                                                       | Yes       | `zMdv1.png` and `design/exports/recipe-1280.html`. Built in `ingredient-checklist.tsx` on `F/Ingredient row`.                                                                                                                                                                                                                                                                                   |
| D-06 | **Both** batch controls: the servings stepper and the batch multiplier.                                                                     | Yes       | Plate F.6, "Batch control — two forms". G-01 closed it. Built in `scale.tsx`.                                                                                                                                                                                                                                                                                                                   |
| D-07 | A step with chips, a note, an image and a full meta row.                                                                                    | In part   | The chips, the note and the meta row are drawn on `zMdv1.png`. **No step image is drawn.** There is no `<img>` in any of the 18 exports. The build draws one when a step has one.                                                                                                                                                                                                               |
| D-08 | The full shopping list: the indeterminate tick-all, the combined amounts and the source recipes.                                            | Yes       | `N8MQ9.png` and Plate F.8. G-02 closed it. Built in `shopping-checklist.tsx` on `F/List row`.                                                                                                                                                                                                                                                                                                   |
| D-09 | The empty state, the error state, the loading state and the partial data state for §11.                                                     | In part   | `F/Empty` and `F/Notice` carry the empty state, the error state and the partial data state. **No loading state is drawn**, and the build declares no `loading.tsx`.                                                                                                                                                                                                                             |
| D-10 | A component map. It names the shadcn/ui component for each of our components. It also names the components that need custom work.           | Yes       | §9.5 above. `design/TOKEN-MAP.md` §11 lists the 2 shadcn/ui primitives that are vendored and every change made to them. Everything else is custom.                                                                                                                                                                                                                                              |
| D-11 | A token map. It maps each name in §7.1 onto a shadcn/ui token name.                                                                         | Yes       | `design/TOKEN-MAP.md` §3.1. It gives 3 names for each colour: the old one, the design's own, and the shadcn/ui one.                                                                                                                                                                                                                                                                             |

D-02 covers these sets:

- The 8 note kinds. 3 severities carry them. See R-CMP-06.
- The 4 recipe kinds. One `F/Mark`, 4 words. See R-CMP-07.
- The 10 category types. `F/Tag` shows the type as a 9px prefix.
- The badge, the term tag, the step chip and the shop chip. 4 components.
  See R-CMP-08.

---

## 16. Open Questions

The design and the build answered 5 of these 7 questions. 2 stay open. An
answered question is struck through and says what answered it.

| ID       | Question                                                                | Answer                                                                                                                                                                                                                                                                                                          |
| -------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Q-01~~ | ~~Is there a theme control?~~                                           | **Answered by the build. No.** The theme comes from `prefers-color-scheme` and nothing else. shadcn/ui's `@custom-variant dark (&:is(.dark *))` is deliberately absent from `src/app/theme.css`, because nothing ever adds that class. See R-CON-08 and R-BLD-07. To add a control is still a product decision. |
| ~~Q-02~~ | ~~Is the mobile navigation a drawer or a bottom bar?~~                  | **Answered by the design. A drawer.** See R-NAV-03 and `oP097.png`.                                                                                                                                                                                                                                             |
| ~~Q-03~~ | ~~Does a recipe card show an image?~~                                   | **Answered by the design. No.** There is no image slot anywhere in the system. `<img>`, `<svg>` and `background-image` each occur 0 times across the 18 exports. `src/components/f/recipe-card.tsx` records the count.                                                                                          |
| ~~Q-04~~ | ~~Is the revision timeline more prominent?~~                            | **Answered by the design.** It is its own tab, and the design gives it a full section on `F/Revision`.                                                                                                                                                                                                          |
| Q-05     | Is there a cooking mode?                                                | **Open.** One step at a time. The screen stays awake. The type is large. It is not designed and it is not built. `durationMinutes` is stored for each step, so a timer would read real data.                                                                                                                    |
| ~~Q-06~~ | ~~How do 8 note kinds differ?~~                                         | **Answered by the design.** 8 kinds ride on 3 severities: note, caution and warning. The severity gives the colour and the word gives the kind. The page does not become a colour chart. See R-CMP-06.                                                                                                          |
| Q-07     | Do the step chips repeat the ingredient list, or replace it on a phone? | **Open. Both are still on screen.** The design draws 12 step chips at 1280. At 360 it draws the Ingredients panel open, and `METHOD` as a tab label only. It draws no step at that width. It does not answer the question. The build repeats them, as the build before it did.                                  |

---

## 17. References

### 17.1 Normative

| Reference                   | Content                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| RFC 2119                    | The key words in §2.                                                                                              |
| `src/lib/site.ts`           | Each label the interface shows. Category types, ingredient categories in shop order, recipe kinds and note kinds. |
| `src/lib/queries/read.ts`   | The shape of each view the interface receives.                                                                    |
| `scripts/audit-ui.ts`       | The geometric audit in R-ACC-11. It holds the route list.                                                         |
| `e2e/`                      | 165 Playwright tests in 14 files. They lock the behaviour in this document. `pnpm test:e2e` runs them.            |
| `e2e/recipe-layout.spec.ts` | The panel geometry tests for §10.2.2.                                                                             |
| `design/BUILD-PLAN.md`      | The milestones, the design's own token values, and the numbers each milestone measured.                           |
| `design/TOKEN-MAP.md`       | Each token, each measured contrast, and every change made to a vendored shadcn/ui primitive.                      |
| `design/DECISIONS.md`       | D-01 to D-12. Each decision the build made that this document did not answer.                                     |

### 17.2 Informative

| Reference                     | Content                                                                     |
| ----------------------------- | --------------------------------------------------------------------------- |
| `AGENTS.md`                   | Conventions, the data model and the quality gates.                          |
| `docs/mcp-connector.md`       | The connector design.                                                       |
| `design/exports/`             | 18 HTML exports and one PNG for each screen. Git ignores it; regenerate it. |
| `design/exports/png/INDEX.md` | The name of the picture for each screen.                                    |
| Pull request #6               | The recipe screen changes in §4.1.                                          |

---

## 18. Gaps in the Design

The design covered all 7 items. Each row records what was drawn and where.
No gap is open.

| ID       | Gap                                                                                                                                                                                                                                                                                                    | Requirement               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| ~~G-01~~ | ~~Form A, the servings stepper, is missing.~~ **Closed.** Plate F.6 now holds "Batch control — two forms". Form A reads `FOR − 6 +` with the readout `6 SERVINGS · ×1.5`. Form B sits under it. A caption on each says which revision gets which form.                                                 | §10.2.5, D-06             |
| ~~G-02~~ | ~~The tick-all control is missing.~~ **Closed.** `/list` now has a tick-all bar above the aisles: an indeterminate box, `TICK EVERYTHING`, and the readout `9 OF 24 IN THE TROLLEY`. Plate F.8 draws all 3 box states.                                                                                 | R-CMP-12, D-08            |
| ~~G-03~~ | ~~The clear ticks control is missing.~~ **Not a gap.** The control was already drawn. The ingredient checklist on the 1280 recipe reads `CLEAR THREE TICKS` under the groups, beside the count `3 / 16`. The first audit missed it.                                                                    | R-SCR-15                  |
| ~~G-04~~ | ~~The skip link is missing.~~ **Closed.** `F/Skip link` is a component and sits first on plate F.1, drawn in its focused state with a focus ring. Its caption states that it is off screen until it takes keyboard focus.                                                                              | C-01, R-ACC-04            |
| ~~G-05~~ | ~~The 360 recipe drops the Science tab.~~ **Closed.** Both 360 rails, light and dark, now read `INGREDIENTS · METHOD · SCIENCE · REVISIONS`.                                                                                                                                                           | R-SCR-27, R-CMP-09        |
| ~~G-06~~ | ~~The batch log card with no source recipe is not drawn.~~ **Closed.** The screen `/batch-logs — Every batch log, 1280` is drawn. Every row carries a `SOURCE` column. The sixth row, "Chilli wash trial", reads `SOURCE / Not yet linked` in muted ink.                                               | R-SCR-44, R-NAV-08        |
| ~~G-07~~ | ~~The new route `/batch-logs` is drawn at 1280 only.~~ **Closed.** The screen `/batch-logs — Every batch log, 360` is drawn. Each run carries a source chip below its text. The chip reads `SOURCE · Baumy Biltong`, or `SOURCE · Not yet linked` with a muted square on the run that names no recipe. | R-NAV-08, R-SCR-44, §13.6 |

---

## 19. Open Risks

All 4 risks are closed. Each row says what closed it.

| ID       | Risk                                                                                                                                                              | What closed it                                                                                                                                                                                                                                                                                                                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~K-01~~ | ~~**A batch log can have no recipe.**~~ `ExperimentView.recipe` is `null` when a run names no recipe, and the query is a left join.                               | **Decided 2026-09-08, built in M2.** A top level `/batch-logs` index lists every run, with or without a recipe. The nested `/recipes/[slug]/batch-logs` is the same grid filtered to one recipe. D-01 then settled the detail address: a run with no recipe answers at `/batch-logs/[log]`, and a run with a recipe redirects from there to its nested address. See R-NAV-08 and R-SCR-44.         |
| ~~K-02~~ | ~~**A rename breaks a public address.** The site is indexed. 7 routes change.~~                                                                                   | **Closed by M2.** `next.config.ts` holds 9 permanent redirects: the 7 renames, and the 2 older `/taxonomy` rules repointed at the final address so no request takes two hops. `e2e/redirects.spec.ts` asserts the status code, the destination, and that the destination does not redirect again. See R-NAV-07.                                                                                    |
| ~~K-03~~ | ~~**The navigation grew from 8 items to 9.** Science was added. R-NAV-01 still applies at 360px.~~                                                                | **Closed by M3.** The 9 items are a row above 1080px and a drawer below it. `Contents360` in `src/components/f/nav-drawer.tsx` draws the drawer on the vendored `Sheet`. The list control stays outside it (R-CMP-02). `e2e/site.spec.ts` asserts the 9 destinations, their order, and that the drawer hides the rest of the page from a screen reader. `pnpm audit:ui` drives every route at 360. |
| ~~K-04~~ | ~~**`/science` needs a query that does not exist.** `src/lib/queries/read.ts` reads notes for one recipe. It has no read for every science note across recipes.~~ | **Closed by M2.** `listScienceIndex` reads every science note across every recipe. `getScienceStudy` reads one study. Both are in `src/lib/queries/read.ts`. D-05 records the 2 rules they obey: a study is any recipe of the `research` kind **or** any recipe that carries a science note, and which end of a `recipe_links` row means "applies this" depends on the kind of the link.           |

---

## 20. What the Build Did Not Deliver

The design draws things this build does not draw. Each one is here. Read
this section beside §18. §18 lists what the DESIGN did not draw and then
drew. This section lists what the BUILD did not draw, and why.

Nothing here is a defect that nobody saw. Each item was measured or read,
and most of them have a decision behind them in `design/DECISIONS.md`.
§20.5 does not: the intro to that file lists it as belonging to the designer
and to the data rather than to any milestone.

### 20.1 The 3 things on the recipe screen — D-12

The design's recipe screen, `design/exports/png/zMdv1.png`, draws 3 things
the repository holds no data for.

| Thing                | State              | Why                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The mass flow figure | **Built in M5.5.** | Migration `0005` added `recipe_mass_flows` and `recipe_mass_flow_stages`, one figure for each revision. `F/Mass flow` draws it. See R-SCR-39 and D-12.                                                                                                                           |
| The change apparatus | **Left out.**      | The design draws a toggle, `SHOWING CHANGES SINCE THE FIFTH REVISION`, an `S6` marker on each changed step, and a reserved gutter on each step that did not change. This is a revision-diff feature. It has no requirement, no component and no query. Raise it as its own work. |
| The chapter kicker   | **Left out.**      | The hero's right slot reads `CHAPTER 04 · CURED AND DRIED`. There is no chapter in the data model and no requirement asks for one. It is a label from the design's own mock data.                                                                                                |

### 20.2 Two stage figures that do not match the design

The design draws `24 pieces` and `490.3 g` in the mass flow. The build seeds
`25–30 pieces` and `459.8 g`.

**The archive wins.** `content/biltong/batch-06-prep.md` says 25–30 twice,
and the design's own prose on the same screen says "25–30 pieces". `24`
appears in no archive file. `459.8` is the sum of this revision's own
seasoning lines; nothing in the archive sums to `490.3`.

The design governs how a screen **looks**. A number is not a look. Either
design figure records a measurement that nobody took. Baumy Biltong is the
one recipe in the repository that exists because it was measured. Do not
write a figure into it. See D-12.

### 20.3 The mass flow at 360

The design draws no mass flow strip at 360. It carries the same fact in the
control bar instead, as `MAKES 4.5 KG DRIED FROM 10 KG RAW`, at both widths.

The build draws a strip that scrolls sideways at 360, and a readout that
says `Makes 4.5 kg`. Neither form matches the design at that width. Nothing
is unreachable: R-STA-08 and R-STA-09 both hold, and the first cell of the
scroller sits at offset 0. The emphasised `DRIED` cell sits behind a scroll.

This is not the one-line change it looks like. The readout scales.
`MassFlowStageView.value` is a formatted string. It holds no number to
multiply. An unscaled raw mass beside a scaled yield puts two batch sizes on
one page. R-CMP-11 forbids that. A fix needs the first stage as a number and
a unit. It must not be the figure's caption. See D-12.

### 20.4 `describe_mechanism` has never been called by an agent

R-SCR-41 is **met** and this entry is not about the screen. Migration `0005`
added `notes.conditions`, `F/Mechanism` draws the row, `scripts/seed-data.ts`
carries 9 sets of conditions and `scripts/ingest-archive.ts` writes them, so
the row draws on both science screens and `e2e/render.spec.ts` guards it.

What has not happened is the tool. `describe_mechanism` fills the field on a
note that is already stored, and nothing has called it: every filled note
was filled by the seed's own write path. A mechanism somebody adds through
the connector still has to be described by hand. That is a use of the build,
not a hole in it, and there is nothing to fix in `src/`.

### 20.5 The batch-log ledger's 3 weight figures

The design fills the band on both batch-log indexes with `RAW, TOTAL`,
`DRIED, TOTAL`, `MEAN YIELD` and `SPENT`. The build draws `SPENT` and the
per-row `RAW / DRIED / YIELD` panel. It does not draw the 3 page-level
weight figures.

3 of the 4 seeded runs never weighed anything out. A total and a mean cover
only the runs that did weigh. The label claims all of them. Do not print a
figure under a label that is wrong. The figures become drawable when a run
records a final weight.

### 20.6 What is absent and correct

Three things look missing on the seeded site and are not.

- **Total time and Active time** in "At a glance" on Baumy Biltong. That
  revision states neither. Two of the eleven seeded revisions state a total
  time and one states an active time, and each one draws it. Pickled
  Jalapeños draws all three values. Demi-Glace draws a total time and no
  yield. R-STA-05 governs the block: it draws the fields that are there.
- **The literature block** on Baumy Biltong. That recipe cites nothing.
  R-SCR-38 says the block is absent then. Demi-Glace cites 4 works and draws
  it.
- **A step image.** The design draws no image anywhere. The build draws one
  when a step has one, because the data model holds it.

### 20.7 The 3 rules the build bent

Each of these is a deviation from a rule in this document. Each one is
recorded where the code is.

| Rule     | What the build did                                                                                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-CON-01 | §9.3 names 8 client components. There are 11. `Navigation` and `Contents360` read the address of the open page, which a Server Component in a layout cannot do, and the drawer needs open state. `Sheet` and `Tooltip` are the 2 vendored primitives that carry them. See §9.3.1.        |
| C-05     | C-05 says a card summary "is cut at 160 characters". The card draws what it is given, and the cut is gone. The design draws the same card with summaries of 181 and 245 characters, set whole and wrapping freely, and there is no `line-clamp` and no ellipsis in any export. See D-11. |
| C-04     | C-04 says the footer holds a copyright. The design draws no `©` anywhere. The slot holds a document issue or an effectivity statement in mono capitals. See D-07.                                                                                                                        |

### 20.8 One rule the design cannot answer

`F/Tag` shows its explanation in a tooltip, and a tooltip never opens for a
coarse pointer. R-ACC-10 asks for a path that is not hover. The answer is to
tap through to the term page, which shows the same text as body text. So an
explanation on a tag now **requires** a link: the type of `F/Tag` makes the
unreachable shape impossible to write. See D-08.

---

## Appendix A — Change History

| Version | Date       | Change                                                                                                                                                                                                                                                                   |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.0     | 2026-09-08 | First issue. Baseline `main` at `f72fbb6`.                                                                                                                                                                                                                               |
| 1.1     | 2026-09-08 | Baseline `main` at `466fd76`. Added pull request #6: step chips, the neutral dark ground, the servings stepper and the 4 panel tabs. Made Tailwind and shadcn/ui mandatory.                                                                                              |
| 1.2     | 2026-09-08 | Added the file for each route and each component. Added §1.4 and Appendix B, the file map.                                                                                                                                                                               |
| 2.0     | 2026-09-09 | **The build.** M1 to M7. Recorded the built state in §4, §6, §7, §8.1, §9.1, §9.3, §9.4, §9.5, §15, §16, §17 and §19. Pointed §7 at `design/TOKEN-MAP.md` and marked §7.1 and §7.2 as history. Added §6.1, §9.3.1, §20 and Appendix A.2. Status is now Issued.           |
| 1.6     | 2026-09-09 | The design closed G-07. Added the screen `/batch-logs — Every batch log, 360` with a source chip on each run.                                                                                                                                                            |
| 1.5     | 2026-09-08 | The design closed G-01 to G-06. Added the screen `/batch-logs — Every batch log, 1280`, the `F/Skip link` component, the two batch forms, the tick-all control and the Science tab on both 360 rails. G-03 was not a gap. Opened G-07: the new route has no 360 drawing. |
| 1.4     | 2026-09-08 | Decided K-01. Added the top level `/batch-logs` index, R-NAV-08 and R-SCR-44.                                                                                                                                                                                            |
| 1.3     | 2026-09-08 | Adopted the design in `design/v1-design.pen`. Renamed 6 routes and the basket. Added `/science`, the literature block and the mass flow figure. Navigation grew to 9 items. Answered Q-02 and Q-04. Added §9.5, §18 gaps and §19 risks.                                  |

### A.2 The build

Each milestone ended with one commit on `build/design-system`. Each one left
`pnpm format`, `pnpm lint`, `pnpm typecheck` and `pnpm build` green.
`design/BUILD-PLAN.md` §3 holds the plan. `design/DECISIONS.md` holds each
decision a milestone made that this document did not answer.

| ID   | What it did                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1   | **Foundation.** Added Tailwind CSS 4.3.3 and shadcn/ui beside `src/app/globals.css`. Wrote the DOSSIER token set into `src/app/theme.css` and cleared 7 of Tailwind's own namespaces so a raw value cannot be written. Loaded Newsreader, Geist and Geist Mono through `next/font/google`. Preflight stayed off. See D-03.                                                                                                       |
| M2   | **Routes, redirects and queries.** Renamed 6 routes to the design's names, added `/science`, `/science/[slug]` and `/batch-logs/[log]`, and added 9 permanent redirects. Added `listScienceIndex` and `getScienceStudy`, which closed K-04. Finished the rename in the page copy the navigation points at. See D-01, D-04 and D-05.                                                                                              |
| M3   | **Shell and primitives.** Rebuilt the header, the 360 drawer, the footer and the skip link. Added the first design primitives under `src/components/f/`. Vendored 6 shadcn/ui primitives, rewrote each one onto the tokens, and deleted 4 that claimed a design name an `f/` component already owned. Added the palette bridge, which gave each old custom property the value of a DOSSIER token. See D-06, D-07, D-08 and D-09. |
| M4   | **Content components.** Built 15 more components: the cards, the tags, the notes, the rows, the tables and the marks. Rebuilt the shared components onto them. `src/components/f/button.tsx` records the 3 treatments this build invented because the design draws no case for them: the focus ring, the focus ring within, and the body link. See D-10 and D-11.                                                                |
| M5   | **The recipe screen.** Rebuilt the hero, the mass flow band, the control bar, the 4 panels, the steps, the batch control and the ingredient checklist. Moved the add-to-list control out of the Ingredients panel and above the tab strip (R-SCR-03, R-SCR-04).                                                                                                                                                                  |
| M5.5 | **The data the design draws.** Migration `0005` added `recipe_mass_flows`, `recipe_mass_flow_stages` and `notes.conditions`. Added `add_mass_flow` and `describe_mechanism` to the connector. Built `F/Mass flow` and the conditions row on `F/Mechanism`. See D-02 and D-12.                                                                                                                                                    |
| M6   | **The other screens.** Rebuilt the remaining 20 screens, light and dark, at 1280 and 360. Added the per-route page foot under `src/app/@foot/`. Migration `0006` gave `notes` a stable ordering key, which made `pnpm export` reproducible and let `/science/demi-glace` carry more than one mechanism.                                                                                                                          |
| M7   | **Tests, audit and clean up.** Deleted `src/app/globals.css`, the `legacy` cascade layer and the palette bridge, and turned Tailwind's preflight on. Added the render tests that §4.1 of the build plan carried forward. Closed this document.                                                                                                                                                                                   |

---

## Appendix B — File Map

Where to find each thing named in this document.

### B.1 The design system

| Thing                             | Where                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| Every token                       | `src/app/theme.css`, the `:root` block. `design/TOKEN-MAP.md` says what each one means. |
| The light theme                   | `src/app/theme.css`, the `@media (prefers-color-scheme: light)` block                   |
| The Tailwind colour names         | `src/app/theme.css`, the `@theme inline` block                                          |
| The 2 breakpoints                 | `src/app/theme.css`, `--breakpoint-shell` and `--breakpoint-recipe`                     |
| The 3 faces                       | `src/app/layout.tsx`, through `next/font/google`. The variables are in `theme.css`.     |
| The `prefers-reduced-motion` rule | `src/app/theme.css`, near the end of the token blocks                                   |
| Each pattern in §9.4              | The component in §9.5 that draws it. There is no stylesheet to search.                  |
| The recipe layout in §10.2.2      | `src/components/recipe-tabs.tsx`, on the `recipe:` breakpoint                           |
| The reason for a rule             | The comment above it. Each rule that looks odd has one.                                 |
| What the design draws             | `design/exports/`. One PNG for the shape, one HTML export for the numbers.              |

### B.2 The shell

| Thing                               | Where                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| The page shell and the `@foot` slot | `src/app/layout.tsx`                                                         |
| The skip link                       | `src/components/f/skip-link.tsx`                                             |
| The header                          | `src/components/f/site-header.tsx`                                           |
| The 9 navigation items              | `src/components/f/nav-drawer.tsx`, the `NAV` array                           |
| The 360 drawer                      | `src/components/f/nav-drawer.tsx`, `Contents360`                             |
| The footer                          | `src/components/f/page-foot.tsx`, and one file per route in `src/app/@foot/` |
| The default footer                  | `src/app/@foot/default.tsx`                                                  |
| The document issue                  | `src/lib/site.ts`, `site.issue`. See D-07.                                   |
| The live region                     | `src/app/announcer.tsx` and `src/lib/announce.ts`                            |
| The header height probe             | `src/components/header-height.tsx`                                           |

### B.3 The screens

Each route maps to one file. See the table in §8.1. Each screen's own page
foot maps to one file under `src/app/@foot/`, which mirrors that tree.

### B.4 The components

Each component maps to one file. See the tables in §9.1, §9.2, §9.3 and
§9.3.1. §9.5 maps each design component onto its file.

The primary screen is assembled in `src/components/recipe-detail.tsx`. Read
it to see which block goes in which panel. Every mark on that screen is a
component from §9.5 or a client component from §9.3. The file declares only
the 4 shapes the design draws there and nowhere else: the hero, the control
bar, the page-level band and the step.

### B.5 The labels and the data

| Thing                                       | Where                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| The 10 category types                       | `src/lib/site.ts`, `CATEGORY_TYPE_LABELS`                                                                                             |
| The 16 ingredient categories, in shop order | `src/lib/site.ts`, `CATEGORY_ORDER` and `CATEGORY_LABELS`                                                                             |
| The 4 recipe kinds                          | `src/lib/site.ts`, `KIND_LABELS`                                                                                                      |
| The 8 note kinds                            | `src/lib/site.ts`, `NOTE_KIND_LABELS`                                                                                                 |
| The severity of each note kind              | `src/components/f/mark.tsx`, `SEVERITY_BY_KIND`                                                                                       |
| The document issue                          | `src/lib/site.ts`, `site.issue`                                                                                                       |
| The mass flow of a revision                 | `src/lib/queries/read.ts`, `MassFlowStageView`. The tables are in `drizzle/0005_mass_flow_and_conditions.sql`.                        |
| The conditions on a note                    | `src/lib/queries/read.ts`, `NoteView.conditions`. The column is in the same migration.                                                |
| The site name, the tagline, the URL         | `src/lib/site.ts`, `site`                                                                                                             |
| The shape of each view                      | `src/lib/queries/read.ts`. Search for `RecipeView`, `RecipeSummaryView`, `TermView`, `NoteView`, `IngredientLineView` and `StepView`. |
| Which fields can be empty                   | The same types. A `\| null` in a type means the field can be empty.                                                                   |
| The units and the number format             | `src/lib/domain/units.ts`                                                                                                             |

### B.6 The tests

| Thing                                                          | Where                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| The geometric audit in R-ACC-11                                | `scripts/audit-ui.ts`. Run `pnpm audit:ui`.                |
| The panel geometry tests for §10.2.2                           | `e2e/recipe-layout.spec.ts`                                |
| The checklist tests                                            | `e2e/recipe-checklist.spec.ts`                             |
| The shopping tests                                             | `e2e/list.spec.ts` and `e2e/shopping-journey.spec.ts`      |
| The filter tests                                               | `e2e/filtering.spec.ts`                                    |
| The redirect tests for R-NAV-07                                | `e2e/redirects.spec.ts`                                    |
| The science tests for §10.9                                    | `e2e/science.spec.ts`                                      |
| The class and cuisine tests                                    | `e2e/classes.spec.ts`                                      |
| The render tests for R-SCR-38, R-SCR-39, R-SCR-41 and R-SCR-44 | `e2e/render.spec.ts`                                       |
| The route smoke tests and the drawer                           | `e2e/site.spec.ts`                                         |
| The connector tests                                            | `e2e/mcp-contract.spec.ts` and `e2e/mcp-lifecycle.spec.ts` |
| The agent access tests                                         | `e2e/agent-access.spec.ts`                                 |
| The backfill tests for `backfillRevision`                      | `e2e/backfill.spec.ts`                                     |
| The scratch database it all runs on                            | `e2e/global-setup.ts`. It drops 2 schemas on every run.    |
| All tests                                                      | `e2e/`. 165 tests in 14 files. Run `pnpm test:e2e`.        |

### B.7 The commands

```bash
pnpm install
pnpm dev                # start the dev server

pnpm format             # Prettier
pnpm lint               # ESLint
pnpm typecheck          # tsc --noEmit
pnpm build              # production build
pnpm test:e2e           # the end-to-end tests
pnpm audit:ui           # the geometric audit
pnpm export             # rewrite content/generated/ from the database
```

CI runs format, lint, typecheck and build. All 4 must pass.

`pnpm test:e2e` and `pnpm audit:ui` each need a database.
`design/BUILD-PLAN.md` §5 gives the full procedure, and it names 3 traps: an
audit reads whatever answers on port 3000; `e2e/global-setup.ts` drops
schemas, so it must point at a scratch database only; and the end-to-end
suite writes to the database it runs on, so an audit taken straight after it
measures a site the suite has added rows to. **Run the audit before the
suite, or reset the database between them.**
