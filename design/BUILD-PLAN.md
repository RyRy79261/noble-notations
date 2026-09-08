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
- R-BLD-08: Do not change `content/biltong`, `content/recipes`,
  `content/research` or `content/generated`.
