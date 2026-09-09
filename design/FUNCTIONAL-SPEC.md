# Noble Notations — User Interface Functional Specification

| Field           | Value                                           |
| --------------- | ----------------------------------------------- |
| Document        | NN-FS-001                                       |
| Version         | 1.6                                             |
| Status          | Draft                                           |
| Date            | 2026-09-08                                      |
| Repository      | `RyRy79261/noble-notations`                     |
| Baseline        | `main` at `466fd76` (pull request #6)           |
| Language        | ASD-STE100 Simplified Technical English         |
| Target stack    | Tailwind CSS and shadcn/ui. Both are mandatory. |
| Design baseline | `design/v1-design.pen`, DIRECTION F — DOSSIER   |

---

## 1. Introduction

### 1.1 Purpose

This document tells you what each screen and each component must do. It is
the input to the design work. The design work makes the visual design.

This document does not tell you how the screens must look. That is the
decision of the designer.

### 1.2 Scope

This document covers the website user interface. It covers all 23 routes and
all 20 components.

This version adopts the design in `design/v1-design.pen`. The design renamed
6 routes and added a new section. §4.2 lists each change. The route names in
§8.1 are now the design's names, not the names in the code today.

This document does not cover:

- The database schema.
- The MCP connector protocol.
- The write path and the OAuth flow, except for the two screens in §10.10.

### 1.3 Audience

The audience is the designer. The designer makes a component design system.
A developer then builds that design system with Tailwind CSS and shadcn/ui.

### 1.4 Where the code is

This document lives in the repository at `design/FUNCTIONAL-SPEC.md`. Each
table in §8 and §9 gives the file for the thing it describes. Appendix B
holds the full file map.

Read these 5 files first. They answer most questions.

| Order | File                               | Why                                                                                                |
| ----- | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1     | `AGENTS.md`                        | The working guide. Stack, layout, data model and quality gates.                                    |
| 2     | `src/app/globals.css`              | The design system now. The tokens are at the top. Each rule has a comment that says why it exists. |
| 3     | `src/lib/site.ts`                  | Each label the interface shows.                                                                    |
| 4     | `src/components/recipe-detail.tsx` | The primary screen. It assembles the 4 panels.                                                     |
| 5     | `src/lib/queries/read.ts`          | The shape of each view. It tells you which fields can be empty.                                    |

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

This is the status at the baseline commit.

| Item               | Status                                                       |
| ------------------ | ------------------------------------------------------------ |
| Open pull requests | **0.** Pull request #6 merged on 8 September 2026.           |
| Branch             | `main` at `466fd76`                                          |
| Tailwind CSS       | Not installed. It is **REQUIRED**. See §14.                  |
| shadcn/ui          | Not installed. It is **REQUIRED**. See §14.                  |
| Prior design work  | None. `design/v1-design.pen` holds an empty 800 × 600 frame. |

### 4.1 What pull request #6 changed

Read this section before you design the recipe screen. It changed 4 things.

1. **A step now names what it uses.** Each step shows chips. Each chip holds
   an amount and an ingredient name. The amounts follow the batch control.
2. **The dark ground is now neutral.** It was purple. See §7.1.
3. **The batch control counts servings.** It was a multiplier only. See
   §10.2.5.
4. **Science and Revisions are now their own tabs.** They were at the bottom
   of a long scroll.

The pull request also repaired 2 layout faults. See §10.2.2.

### 4.2 What the design changed

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

The design also answered 1 open question. The 360 navigation is a drawer.
See R-NAV-06.

Five items in this document are not yet in the design. §18 lists them.

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

| Item       | Value                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Framework  | Next.js 16 App Router. React 19. TypeScript 5.9.                                                                          |
| Styles now | One stylesheet, `src/app/globals.css`. About 1,900 lines. CSS custom properties. **Tailwind and shadcn/ui replace this.** |
| Data       | Postgres through Drizzle. All reads go through `src/lib/queries/read.ts`.                                                 |
| Rendering  | Server Components by default. There are 8 shared client components. See §9.3.                                             |
| Tests      | 138 end-to-end tests. `pnpm audit:ui` reports 0 blockers across 176 page loads.                                           |
| Deployment | Vercel. CI runs format, lint, typecheck, build and end-to-end tests.                                                      |

---

## 7. Design Tokens

These are the tokens now in use. They are the start point. They are not
fixed. Read §13 before you make any muted colour darker.

### 7.1 Colour

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

Measured contrast on the dark palette:

| Token          | On `--bg` | On `--surface-2` |
| -------------- | --------- | ---------------- |
| `--text`       | 16.15:1   | 13.84:1          |
| `--text-muted` | 8.48:1    | 7.27:1           |
| `--text-faint` | 6.38:1    | 5.47:1           |

### 7.2 Shape, type and layout

| Token         | Value                                     |
| ------------- | ----------------------------------------- |
| `--radius`    | 12px                                      |
| `--radius-sm` | 8px                                       |
| `--font-sans` | System sans stack                         |
| `--font-mono` | System mono stack. All numbers use it.    |
| `--measure`   | 68ch. This is the width of a text block.  |
| `--page`      | 1180px. This is the width of the content. |

Type scale now: h1 `clamp(1.75rem, 1.2rem + 2vw, 2.5rem)`, h2 1.35rem,
h3 1.05rem, body 16px with a line height of 1.6.

Breakpoints now: 34rem (544px), 700px and **900px**. The 900px breakpoint
holds the recipe layout. See §10.2.2. The audit tool tests at 360, 390, 768
and 1280.

### 7.3 Requirements

- R-TKN-01: The tokens **MUST** be Tailwind theme values. Put them in the
  `@theme` block, or in the shadcn/ui CSS variable set.
- R-TKN-02: Both themes **MUST** work after the change.
- R-TKN-03: The designer **MAY** change any value in §7.1 and §7.2.
- R-TKN-04: A component **MUST** read a token. A component **MUST NOT** hold
  a raw colour value.
- R-TKN-05: The token names **SHOULD** follow the shadcn/ui names:
  `background`, `foreground`, `card`, `popover`, `primary`, `secondary`,
  `muted`, `accent`, `destructive`, `border`, `input`, `ring`. Give a map
  from the old names to the new names.

---

## 8. Navigation and Routes

### 8.1 Route map

Each route is one file under `src/app/`. The shell for all of them is
`src/app/layout.tsx`.

The **Route** column is the design's name. The **File** column is the file
that serves it. M2 moved every file that had to move. See R-NAV-07.

| Route                              | Screen                                                    | File today                                                                    |
| ---------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/`                                | Home                                                      | `src/app/page.tsx`                                                            |
| `/recipes`                         | All entries in groups by kind                             | `src/app/recipes/page.tsx`                                                    |
| `/recipes/[slug]`                  | Recipe, current revision. **This is the primary screen.** | `src/app/recipes/[slug]/page.tsx`, body in `src/components/recipe-detail.tsx` |
| `/recipes/[slug]/revisions/[n]`    | An old revision                                           | `src/app/recipes/[slug]/revisions/[number]/page.tsx`                          |
| `/batch-logs`                      | Every run, including a run with no recipe                 | `src/app/batch-logs/page.tsx`                                                 |
| `/recipes/[slug]/batch-logs`       | The runs of one recipe                                    | `src/app/recipes/[slug]/batch-logs/page.tsx`                                  |
| `/recipes/[slug]/batch-logs/[log]` | One run with its measurements                             | `src/app/recipes/[slug]/batch-logs/[log]/page.tsx`. See D-01.                 |
| `/recipes/[slug].md`               | Markdown copy for agents. There is no user interface.     | `src/app/recipes/[slug]/md/route.ts`                                          |
| `/science`                         | Every science note in one place                           | `src/app/science/page.tsx`                                                    |
| `/science/[slug]`                  | One study, keyed by recipe slug                           | `src/app/science/[slug]/page.tsx`. See D-05.                                  |
| `/cuisines`                        | Cuisine cards                                             | `src/app/cuisines/page.tsx`                                                   |
| `/cuisines/[slug]`                 | One cuisine                                               | `src/app/cuisines/[slug]/page.tsx`                                            |
| `/classes`                         | All classification in groups by category type             | `src/app/classes/page.tsx`                                                    |
| `/classes/[type]/[slug]`           | One term                                                  | `src/app/classes/[type]/[slug]/page.tsx`                                      |
| `/ingredients`                     | The ingredient table                                      | `src/app/ingredients/page.tsx`                                                |
| `/ingredients/[slug]`              | One ingredient                                            | `src/app/ingredients/[slug]/page.tsx`                                         |
| `/list`                            | The combined shopping list. The URL gives the selection.  | `src/app/list/page.tsx`, plus `list-recipes.tsx` and `basket-redirect.tsx`    |
| `/archive`                         | The frozen Markdown archive                               | `src/app/archive/page.tsx`                                                    |
| `/archive/[...slug]`               | One archived note                                         | `src/app/archive/[...slug]/page.tsx`                                          |
| `/search`                          | Search with filters                                       | `src/app/search/page.tsx`                                                     |
| `/connect`                         | MCP connector help. Not indexed. Linked from the footer.  | `src/app/connect/page.tsx`                                                    |
| `/connect/done`                    | The agent is connected                                    | `src/app/connect/done/page.tsx`                                               |
| `/sign-in`                         | Administrator sign-in                                     | `src/app/sign-in/page.tsx`, form in `sign-in-form.tsx`                        |
| `404`                              | Not found                                                 | `src/app/not-found.tsx`                                                       |

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
  two hops.
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

The shadcn/ui component in each table is a suggestion. The designer makes
the decision.

### 9.1 Shell components

| ID   | Component           | File                                                  | Function                                                     | States            | Suggested                       |
| ---- | ------------------- | ----------------------------------------------------- | ------------------------------------------------------------ | ----------------- | ------------------------------- |
| C-01 | Skip link           | `src/app/layout.tsx`                                  | Moves the keyboard focus to `#main`.                         | hidden, focused   | —                               |
| C-02 | Site header         | `src/app/layout.tsx`                                  | Holds the brand, the list control and the navigation.        | —                 | `NavigationMenu`, `Sheet`       |
| C-03 | List control        | `src/components/shopping-basket.tsx` → `BasketButton` | Shows the count of collected recipes. Links to the list.     | hidden, 1 or more | `Button`, `Badge`               |
| C-04 | Site footer         | `src/app/layout.tsx`                                  | Holds the copyright, the connector link and the source link. | —                 | —                               |
| C-20 | Header height probe | `src/components/header-height.tsx`                    | Measures the header. Writes the value to `--header-h`.       | —                 | none. It has no user interface. |

- R-CMP-01: The list control **MUST** be hidden when the list is empty.
- R-CMP-02: The list control **MUST NOT** be inside the navigation or the
  360 drawer.

### 9.2 Content components

| ID   | Component       | File                                            | Function                                                                                                                           | States                                                                         | Suggested          |
| ---- | --------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------ |
| C-05 | Recipe card     | `src/components/recipe-card.tsx` → `RecipeCard` | Shows a kind badge, a revision badge, a title link, a subtitle, a summary and up to 4 terms. The summary is cut at 160 characters. | with or without each optional field                                            | `Card`             |
| C-06 | Recipe grid     | `src/components/recipe-card.tsx` → `RecipeGrid` | Shows recipe cards in a grid.                                                                                                      | full, empty                                                                    | —                  |
| C-07 | Term tag        | `src/components/tags.tsx` → `TermTag`           | Shows one term. It links to the term page. It shows the term explanation.                                                          | primary, normal; with or without an explanation; with or without a type prefix | `Badge`, `Tooltip` |
| C-08 | Term list       | `src/components/tags.tsx` → `TermList`          | Shows a row of term tags with a `+n` overflow chip.                                                                                | —                                                                              | —                  |
| C-09 | Term hierarchy  | `src/components/term-hierarchy.tsx`             | Shows the parent term and the more specific terms.                                                                                 | —                                                                              | —                  |
| C-10 | Note block      | `src/components/notes.tsx`                      | Shows one note: a kind badge, a title, a Markdown body and the sources. There are **8 kinds**.                                     | 8 kinds; with or without a title; with or without sources                      | `Alert`, `Card`    |
| C-11 | Markdown        | `src/components/markdown.tsx`                   | Renders Markdown with GFM.                                                                                                         | —                                                                              | `Typography`       |
| C-12 | Database notice | `src/components/database-notice.tsx`            | Tells the reader that the database is not available. It tells the reader what to do.                                               | not configured, read failed                                                    | `Alert`            |

- R-CMP-03: The term tag **MUST** show its explanation on hover **and** on
  keyboard focus.
- R-CMP-04: The term tag **MUST NOT** use the `title` attribute for the
  explanation. You cannot style it. It has a delay. It does not show on
  keyboard focus.
- R-CMP-05: The term hierarchy **MUST** show nothing when a term has no
  parent and no children. Most terms are flat.
- R-CMP-06: Each of the 8 note kinds **MUST** have a different visual
  treatment. The kinds are: observation, research, substitution, warning,
  result, idea, correction and science.
- R-CMP-07: The 4 recipe kinds **MUST** be easy to tell apart. The kinds are:
  recipe, preparation, process and research.
- R-CMP-08: A badge, a term tag, a step chip and a shop chip **MUST** be easy
  to tell apart. These 4 look the same today.

### 9.3 Interactive components

These 8 components run in the browser. There are no others in
`src/components/`.

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

- R-CMP-15: A step chip **MUST** show only an ingredient line that is in
  this revision. Do not invent a chip for a name that does not resolve.

### 9.4 Layout patterns

These are CSS classes today. They have no component. Map each one to a
Tailwind utility set or a shadcn/ui component.

`.page` `.prose-page` `.hero` `.section` `.section-head` `.panel` `.grid`
`.card` `.row` `.stats` `.stat` `.breadcrumb` `.badge` `.tag` `.notice`
`.empty` `.faint` `.lede` `.numeric` `.timeline` `.steps` `.step-meta`
`.step-uses` `.method` `.recipe-layout` `.recipe-column` `.recipe-main`
`.recipe-aside` `.recipe-tabs` `.scale-bar` `.scale-stepper` `.scale-of`
`.table-scroll` `.filter-bar` `.search-bar` `.field` `.button-primary`
`.button-secondary`

---

### 9.5 The design components

The design holds 36 components. Each name starts with `F/`. This table maps
them onto §9. A build takes its names from the design.

| Design component                                | Covers                                      |
| ----------------------------------------------- | ------------------------------------------- |
| `F/Site header`, `F/Site header 360`            | C-02, C-03                                  |
| `F/Page head`, `F/Page head 360`, `F/Page hero` | The hero, §10.2.1                           |
| `F/Page foot`                                   | C-04                                        |
| `F/Breadcrumb`                                  | The breadcrumb                              |
| `F/Section label`, `F/Section 360`              | The section heading                         |
| `F/Mark`, `F/Mark quiet`                        | The kind badge and the revision badge       |
| `F/Tag`, `F/Tag CTA`, `F/Tag hierarchy`         | C-07, C-08, C-09                            |
| `F/Recipe card`, `F/Index card`                 | C-05                                        |
| `F/Ingredient row`, `F/Ingredient callout`      | C-14 rows, C-19 step chips                  |
| `F/List row`, `F/List mark`                     | The shopping row and the source recipe chip |
| `F/Table row`                                   | The ingredient table row                    |
| `F/Revision`                                    | The timeline entry                          |
| `F/Batch line`                                  | The batch log row                           |
| `F/Provenance line`                             | The provenance row                          |
| `F/Footnote`, `F/Warning`, `F/Note reference`   | C-10, the 8 note kinds                      |
| `F/Mechanism`, `F/Citation`                     | §10.9, new                                  |
| `F/Stat`, `F/Measure`                           | The statistic and the "At a glance" value   |
| `F/Button`, `F/Field`, `F/Filter`               | The controls, C-17                          |
| `F/Notice`, `F/Empty`                           | C-12, the empty state                       |

- R-CMP-16: A build **MUST** use the design's component names. Do not carry
  the class names in §9.4 forward.

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
  way the reader must plan for.

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
  not write them into a sentence.
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
  route at 360, 390, 768 and 1280 pixels. It reports geometric faults. The
  baseline is 0 blockers and 0 major faults across 176 page loads — 22
  routes, after M2 renamed five and added four.
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
  themes **MUST** work after the change.
- R-CON-13: The design **MUST** name one shadcn/ui component for each
  component in §9, or it **MUST** say that the component is custom.

### 14.2 The rendering model

- R-CON-01: The pages **MUST** stay Server Components by default. Only the 8
  components in §9.3 run in the browser. A shadcn/ui component that makes
  the recipe body, the ingredient table or the archive a client component is
  a fault.
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

The designer supplies these items.

| ID   | Deliverable                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | Foundations: colour for both themes, the type scale, spacing, radii, elevation, focus rings and motion. Give them as Tailwind theme tokens. |
| D-02 | A distinct treatment for each component in §9. This is the main task.                                                                       |
| D-03 | A navigation design for a screen 360px wide. It holds 9 destinations and the list control.                                                  |
| D-04 | The recipe screen at 360, 768 and 1280 pixels. Show the change from tabs to aside plus tabs.                                                |
| D-05 | The full ingredient checklist: both orders, ticked rows, unticked rows and the count.                                                       |
| D-06 | **Both** batch controls: the servings stepper and the batch multiplier. **Open — see G-01.**                                                |
| D-07 | A step with chips, a note, an image and a full meta row.                                                                                    |
| D-08 | The full shopping list: the indeterminate tick-all, the combined amounts and the source recipes. **Open — see G-02.**                       |
| D-09 | The empty state, the error state, the loading state and the partial data state for §11.                                                     |
| D-10 | A component map. It names the shadcn/ui component for each of our components. It also names the components that need custom work.           |
| D-11 | A token map. It maps each name in §7.1 onto a shadcn/ui token name.                                                                         |

D-02 must cover these sets:

- The 8 note kinds.
- The 4 recipe kinds.
- The 10 category types.
- The badge, the term tag, the step chip and the shop chip.

---

## 16. Open Questions

The designer answers these questions. Each answer changes the design.

| ID       | Question                                                                | Context                                                                                                                                                     |
| -------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-01     | Is there a theme control?                                               | The site follows the system setting today.                                                                                                                  |
| ~~Q-02~~ | ~~Is the mobile navigation a drawer or a bottom bar?~~                  | **Answered.** The design chose a drawer. See R-NAV-03.                                                                                                      |
| Q-03     | Does a recipe card show an image?                                       | Images are optional. They come from any host through the MCP. Text first is the choice today.                                                               |
| ~~Q-04~~ | ~~Is the revision timeline more prominent?~~                            | **Answered.** It is its own tab, and the design gives it a full section.                                                                                    |
| Q-05     | Is there a cooking mode?                                                | One step at a time. The screen stays awake. The type is large. It is not built. `durationMinutes` is stored for each step, so a timer would read real data. |
| Q-06     | How do 8 note kinds differ?                                             | The recipe page must not become a colour chart.                                                                                                             |
| Q-07     | Do the step chips repeat the ingredient list, or replace it on a phone? | Both are on screen today. A phone shows them in two different tabs.                                                                                         |

---

## 17. References

### 17.1 Normative

| Reference                   | Content                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| RFC 2119                    | The key words in §2.                                                                                              |
| `src/lib/site.ts`           | Each label the interface shows. Category types, ingredient categories in shop order, recipe kinds and note kinds. |
| `src/lib/queries/read.ts`   | The shape of each view the interface receives.                                                                    |
| `scripts/audit-ui.ts`       | The geometric audit in R-ACC-11.                                                                                  |
| `e2e/`                      | 108 Playwright tests. They lock the behaviour in this document.                                                   |
| `e2e/recipe-layout.spec.ts` | The panel geometry tests for §10.2.2.                                                                             |

### 17.2 Informative

| Reference               | Content                                            |
| ----------------------- | -------------------------------------------------- |
| `AGENTS.md`             | Conventions, the data model and the quality gates. |
| `docs/mcp-connector.md` | The connector design.                              |
| `src/app/globals.css`   | The current design system with its reasons.        |
| Pull request #6         | The recipe screen changes in §4.1.                 |

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

| ID       | Risk                                                                                                                                                          | What to decide                                                                                                                                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~K-01~~ | ~~**A batch log can have no recipe.**~~ `ExperimentView.recipe` is `null` when a run names no recipe, and the query is a left join.                           | **Decided 2026-09-08.** Keep a top level `/batch-logs` index. It lists every run, with or without a recipe. The nested `/recipes/[slug]/batch-logs` is the same grid filtered to one recipe. The recipe link stays optional, because a run is often logged before its recipe exists. See R-NAV-08 and R-SCR-44. |
| K-02     | **A rename breaks a public address.** The site is indexed. 7 routes change.                                                                                   | R-NAV-07 requires a permanent redirect for each one.                                                                                                                                                                                                                                                            |
| K-03     | **The navigation grew from 8 items to 9.** Science was added. R-NAV-01 still applies at 360px.                                                                | The drawer answers it. Check it at 360 with `pnpm audit:ui`.                                                                                                                                                                                                                                                    |
| K-04     | **`/science` needs a query that does not exist.** `src/lib/queries/read.ts` reads notes for one recipe. It has no read for every science note across recipes. | Add the query, or build the index from the recipe list.                                                                                                                                                                                                                                                         |

---

## Appendix A — Change History

| Version | Date       | Change                                                                                                                                                                                                                                                                   |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.0     | 2026-09-08 | First issue. Baseline `main` at `f72fbb6`.                                                                                                                                                                                                                               |
| 1.1     | 2026-09-08 | Baseline `main` at `466fd76`. Added pull request #6: step chips, the neutral dark ground, the servings stepper and the 4 panel tabs. Made Tailwind and shadcn/ui mandatory.                                                                                              |
| 1.2     | 2026-09-08 | Added the file for each route and each component. Added §1.4 and Appendix B, the file map.                                                                                                                                                                               |
| 1.6     | 2026-09-09 | The design closed G-07. Added the screen `/batch-logs — Every batch log, 360` with a source chip on each run.                                                                                                                                                            |
| 1.5     | 2026-09-08 | The design closed G-01 to G-06. Added the screen `/batch-logs — Every batch log, 1280`, the `F/Skip link` component, the two batch forms, the tick-all control and the Science tab on both 360 rails. G-03 was not a gap. Opened G-07: the new route has no 360 drawing. |
| 1.4     | 2026-09-08 | Decided K-01. Added the top level `/batch-logs` index, R-NAV-08 and R-SCR-44.                                                                                                                                                                                            |
| 1.3     | 2026-09-08 | Adopted the design in `design/v1-design.pen`. Renamed 6 routes and the basket. Added `/science`, the literature block and the mass flow figure. Navigation grew to 9 items. Answered Q-02 and Q-04. Added §9.5, §18 gaps and §19 risks.                                  |

---

## Appendix B — File Map

Where to find each thing named in this document.

### B.1 The design system now

| Thing                        | Where                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| All tokens in §7.1 and §7.2  | `src/app/globals.css`, the `:root` block at the top                                           |
| The light theme              | `src/app/globals.css`, the `@media (prefers-color-scheme: light)` block                       |
| Each layout class in §9.4    | `src/app/globals.css`. Search for the class name.                                             |
| The recipe layout in §10.2.2 | `src/app/globals.css`, the `@media (min-width: 901px)` and `@media (max-width: 900px)` blocks |
| The reason for a rule        | The comment above it. Each rule that looks odd has one.                                       |

### B.2 The shell

| Thing                                                                 | Where                                 |
| --------------------------------------------------------------------- | ------------------------------------- |
| The page shell, the header, the navigation, the footer, the skip link | `src/app/layout.tsx`                  |
| The 8 navigation items                                                | `src/app/layout.tsx`, the `NAV` array |
| The header height probe                                               | `src/components/header-height.tsx`    |

### B.3 The screens

Each route maps to one file. See the table in §8.1.

### B.4 The components

Each component maps to one file. See the tables in §9.1, §9.2 and §9.3.

The primary screen is assembled in `src/components/recipe-detail.tsx`. Read
it to see which block goes in which panel.

### B.5 The labels and the data

| Thing                                       | Where                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| The 10 category types                       | `src/lib/site.ts`, `CATEGORY_TYPE_LABELS`                                                                                             |
| The 16 ingredient categories, in shop order | `src/lib/site.ts`, `CATEGORY_ORDER` and `CATEGORY_LABELS`                                                                             |
| The 4 recipe kinds                          | `src/lib/site.ts`, `KIND_LABELS`                                                                                                      |
| The 7 note kinds, plus science              | `src/lib/site.ts`, `NOTE_KIND_LABELS`                                                                                                 |
| The site name, the tagline, the URL         | `src/lib/site.ts`, `site`                                                                                                             |
| The shape of each view                      | `src/lib/queries/read.ts`. Search for `RecipeView`, `RecipeSummaryView`, `TermView`, `NoteView`, `IngredientLineView` and `StepView`. |
| Which fields can be empty                   | The same types. A `\| null` in a type means the field can be empty.                                                                   |
| The units and the number format             | `src/lib/domain/units.ts`                                                                                                             |

### B.6 The tests

| Thing                                | Where                                                 |
| ------------------------------------ | ----------------------------------------------------- |
| The geometric audit in R-ACC-11      | `scripts/audit-ui.ts`. Run `pnpm audit:ui`.           |
| The panel geometry tests for §10.2.2 | `e2e/recipe-layout.spec.ts`                           |
| The checklist tests                  | `e2e/recipe-checklist.spec.ts`                        |
| The shopping tests                   | `e2e/list.spec.ts` and `e2e/shopping-journey.spec.ts` |
| The filter tests                     | `e2e/filtering.spec.ts`                               |
| All tests                            | `e2e/`. Run `pnpm test:e2e`.                          |

### B.7 The commands

```bash
pnpm install
pnpm dev                # start the dev server

pnpm format             # Prettier
pnpm lint               # ESLint
pnpm typecheck          # tsc --noEmit
pnpm build              # production build
pnpm test:e2e           # the 138 end-to-end tests
pnpm audit:ui           # the geometric audit
```

CI runs format, lint, typecheck and build. All 4 must pass.
