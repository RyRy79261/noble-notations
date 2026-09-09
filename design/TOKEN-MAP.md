# Noble Notations — Token Map

| Field       | Value                                                     |
| ----------- | --------------------------------------------------------- |
| Document    | NN-TM-001                                                 |
| Version     | 1.1                                                       |
| Date        | 2026-09-09                                                |
| Deliverable | D-11                                                      |
| Input       | `design/BUILD-PLAN.md` §2, `design/FUNCTIONAL-SPEC.md` §7 |
| Implements  | R-TKN-01, R-TKN-05, R-ACC-01                              |
| Built by    | M1 (Foundation), in `src/app/theme.css`                   |

**Change note — 1.0 → 1.1, at M7.** §10 was the palette bridge. M7 deleted
the bridge, and §10 is now the tombstone that records what it was, why it
went, and the seven declarations that had to be kept when `globals.css`
went with it. §2, §9 and §11 are corrected to the past tense where they described
the old stylesheet as live. No token changed value.

---

## 1. Purpose

This document maps three sets of names onto each other.

The first set is the old set. §7.1 of the functional specification declares
it. It is history.

The second set is the design set. `design/BUILD-PLAN.md` §2 declares it.
The design file `design/v1-design.pen` is its source. The design calls it
DIRECTION F, or DOSSIER.

The third set is the shadcn/ui set. R-TKN-05 asks the build to use these
names.

`src/app/theme.css` holds all three sets. Each colour has one value and two
names: the design name and the shadcn/ui name. Both names work.

---

## 2. How the tokens are built

The raw value is a plain CSS custom property. Its name carries the design's
`f-` prefix. An example is `--f-ink-2`.

The prefix does two jobs. It keeps the design's own name. It also kept the
name clear of `src/app/globals.css`, which declared `--accent`, `--warn`,
`--border` and `--text` for the old palette. M7 deleted that file (D-03).
The prefix stays: it is the design's own name, not a collision guard.

A `@theme inline` block then maps each raw value into Tailwind's colour
namespace. The block gives each value both names.

The word `inline` is necessary. Tailwind puts the value into each utility.
The utility therefore reads `var(--f-ink-2)`, and it follows the media
query. Without `inline` each utility would hold one theme's value for ever.

`inline` has one cost. Tailwind usually does not emit the `--color-*` names
as runtime custom properties, so `var(--color-border)` in hand-written CSS,
or inside a shadcn/ui arbitrary value, resolves to nothing. Read the raw
name, `var(--f-hair)`, or write the utility.

Tailwind does emit a name that it believes a utility needs. The M1 build
emits `--color-border: var(--f-hair)` in the `theme` layer, because a
utility asked for it. Do not depend on this. A later build that drops the
utility also drops the name.

The design is dark first. R-CON-07 says so, and `src/app/globals.css` did
the same. The dark values are on plain `:root`. The light values are in one
`@media (prefers-color-scheme: light)` block. Only the raw values change. No
name changes, and no utility changes. Media Queries Level 5 makes the light
query match when the reader has expressed no preference, so a reader with no
preference gets the light theme.

`src/app/theme.css` also sets `color-scheme` in both blocks. That makes the
scrollbar and the native form widgets follow the theme. `globals.css` set it
too; stating it here is what kept it after M7 deleted that file.

This meets R-BLD-07 and R-CON-08: the theme comes from the media query, and
there is no theme control.

---

## 3. Colour

### 3.1 The map

| Old name (§7.1)     | Design name     | shadcn/ui name       | Light     | Dark        |
| ------------------- | --------------- | -------------------- | --------- | ----------- |
| `--bg`              | `f-paper`       | `background`         | `#FCFAF6` | `#17191B`   |
| `--surface`         | `f-paper`       | `card`, `popover`    | `#FCFAF6` | `#17191B`   |
| `--surface-2`       | `f-desk`        | `muted`, `secondary` | `#F3EDE5` | `#101214`   |
| `--text`            | `f-ink`         | `foreground`         | `#2B1F1C` | `#EDEFF1`   |
| `--text-muted`      | `f-ink-2`       | `foreground-muted`   | `#574843` | `#B7BCC0`   |
| `--text-faint`      | `f-ink-3`       | `muted-foreground`   | `#79655F` | `#8C9297`   |
| `--border`          | `f-hair`        | `border`             | `#E4D8D0` | `#2C3033`   |
| (none)              | `f-hair-2`      | `border-muted`       | `#F0E7DE` | `#222629`   |
| `--accent`          | `f-accent`      | `primary`            | `#8E2A1E` | `#FF7A6B`   |
| `--accent-dim`      | `f-accent-wash` | `primary-muted`      | `#F7E8E3` | `#FF7A6B1F` |
| `--accent-contrast` | `f-on-accent`   | `primary-foreground` | `#FCFAF6` | `#17191B`   |
| `--warn`            | `f-warn`        | `destructive`        | `#C42B1C` | `#FF6F5E`   |
| `--warn-bg`         | `f-warn-wash`   | `destructive-muted`  | `#FBEDE9` | `#FF6F5E1F` |
| (none)              | `f-caution`     | `caution`            | `#8A5A12` | `#E8B24E`   |
| (none)              | `f-cta-line`    | `cta-line`           | `#B0857A` | `#666F73`   |
| (none)              | `f-ink-3`       | `input`              | `#79655F` | `#8C9297`   |
| (none)              | `f-accent`      | `ring`               | `#8E2A1E` | `#FF7A6B`   |

The Tailwind utility uses the shadcn/ui name or the design name. Write
`bg-paper` or `bg-background`. Both give the same colour. Write `text-ink-3`
or `text-muted-foreground`. Both give the same colour.

Four foreground names complete the shadcn/ui set. They carry no new value.

| shadcn/ui name         | Value         |
| ---------------------- | ------------- |
| `card-foreground`      | `f-ink`       |
| `popover-foreground`   | `f-ink`       |
| `secondary-foreground` | `f-ink`       |
| `accent-foreground`    | `f-on-accent` |

`accent-foreground` is the one of the four that does not take `f-ink`.
shadcn/ui writes `focus:bg-accent focus:text-accent-foreground` on every
menu, select and command item, so the two are a pair and R-ACC-01 applies.
`f-ink` on `f-accent` is 1.90:1 light and 2.21:1 dark, which fails.
`f-on-accent` is 8.06:1 and 6.92:1, and it invents no colour. See §5,
item 3, and §6.1.

### 3.2 Old names that end here

| Old name          | What happens to it                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `--bg-elevated`   | Dropped. The design has no raised ground. A card is a rule, not a fill.                    |
| `--border-strong` | Dropped. The design draws one rule colour. Use `f-ink-3` if a build needs a stronger line. |
| `--accent-strong` | Dropped. The design draws no hover colour. Derive one when a hover needs it.               |
| `--warn-border`   | Dropped. The design draws a solid 3px `f-warn` rule, not a soft border.                    |
| `--radius`        | Dropped. See §4.5.                                                                         |
| `--radius-sm`     | Dropped. See §4.5.                                                                         |
| `--measure`       | Dropped. The design sets no text measure. The 1280 frame fixes it. See §4.4.               |
| `--page`          | Dropped. The frame is 1280px with a 60px gutter. See §4.4.                                 |

---

## 4. Type, space and shape

### 4.1 The faces

| Design name | Family     | Weights used | Italic | CSS variable     | Utility      |
| ----------- | ---------- | ------------ | ------ | ---------------- | ------------ |
| `f-serif`   | Newsreader | 400, 500     | Yes    | `--font-serif`   | `font-serif` |
| `f-sans`    | Geist      | 400          | No     | `--font-sans-ui` | `font-sans`  |
| `f-mono`    | Geist Mono | 400          | No     | `--font-mono-ui` | `font-mono`  |

`next/font/google` loads all three in `src/app/layout.tsx`. It downloads each
WOFF2 file at build time. It then serves the file from the same origin. The
CSP allows this. A `<link>` to `fonts.googleapis.com` is blocked, because
`style-src` does not list that host.

The sans and mono variables carry a `-ui` suffix. `globals.css` declared its
own `--font-sans` and `--font-mono` for the system stacks, and the suffix
prevented a collision. M7 removed that file, and the suffix stayed: the two
names are now what Tailwind's `--default-font-family` and
`--default-mono-font-family` resolve to, which is how the preflight's `html`
and `code, kbd, samp, pre` rules end up in Geist and Geist Mono. Renaming
them would touch `layout.tsx`, `utils.ts` and the base block for nothing.

Newsreader asks for the `opsz` axis by name. The titles run from 24px to
72px, and the face is an optical-size design.

### 4.2 The type scale

BUILD-PLAN §2.2 declares seventeen steps. Each step is a Tailwind `text-*`
utility. The name is the size in pixels, with a leading zero below ten.

`text-08` `text-09` `text-10` `text-11` `text-12` `text-13` `text-14`
`text-15` `text-16` `text-17` `text-19` `text-21` `text-24` `text-26`
`text-40` `text-48` `text-72`

Every step carries `line-height: normal`, and no step carries a pixel
pairing. Three facts make that the right default.

Leading in this design belongs to the role, not to the size. 13px alone is
drawn with four different leadings: mono at `normal` 504 times, sans at
`normal` 257 times, serif at 20px 91 times, sans at 22px 23 times. A single
number per size cannot be right for all four.

`normal` is what the design draws. Counting every `text-[Npx]/[X]` class in
the eighteen exports gives about 5,216 nodes at `normal` against about 1,530
at a pixel value. `normal` also means "the face decides", which is the point:
next/font reports 1.30em for Geist and Geist Mono and 1.00em for Newsreader,
and the design relies on that difference. About 403 Newsreader nodes are
drawn at `normal`, and any fixed ratio would set every one of them wrong.

The pairing in Plate V is a specimen, not a spec. That row is one string,
`Baumy Biltong — six revisions`, set at a uniform ratio of about 1.3 to show
the sizes. Eleven of its seventeen pairings occur exactly once in all
eighteen exports, and that once is the specimen itself. Do not read it as a
leading scale.

A role that draws an absolute leading writes the ratio. See §4.3.

### 4.3 Line height and letter spacing

BUILD-PLAN §2.2 declares seven line heights as a ratio. The name is the ratio
times one hundred.

`leading-100` `leading-105` `leading-115` `leading-130` `leading-150`
`leading-170` `leading-180`

The ratio scale is the design's leading scale. The exports draw absolute
pixels, and every one of those pixel values is one of these seven ratios
applied to the size and rounded. The largest disagreement is half a pixel:

| Role                | Design draws | Write this            | Result |
| ------------------- | ------------ | --------------------- | ------ |
| Sans body           | 14px / 24px  | `text-14 leading-170` | 23.8px |
| Sans body, tight    | 14px / 21px  | `text-14 leading-150` | 21px   |
| Serif body          | 13px / 20px  | `text-13 leading-150` | 19.5px |
| Serif card title    | 24px / 28px  | `text-24 leading-115` | 27.6px |
| Serif section title | 26px / 30px  | `text-26 leading-115` | 29.9px |
| Display title       | 40px / 42px  | `text-40 leading-105` | 42px   |
| Display title       | 48px / 50px  | `text-48 leading-105` | 50.4px |
| Mono label          | 10px / 17px  | `text-10 leading-170` | 17px   |

No role needs `leading-[Npx]`.

`leading-normal` is the eighth name. It is the CSS keyword `normal`, which is
already every step's default, so it is needed only to undo a leading that a
parent or a variant set. Tailwind's own `--leading-normal` is **1.5**, and
1.5 is on no scale in this design; `src/app/theme.css` clears the namespace
and redeclares the name with the keyword. `leading-tight`, `leading-snug`,
`leading-relaxed` and `leading-loose` do not exist.

> **A trap in `cn()`.** `tailwind-merge` treats a leading as part of the
> font size group. A later size therefore deletes an earlier leading:
> `cn('text-14 leading-170', 'text-24')` returns `text-24` alone. This is
> stock behaviour and it is the same with stock names. It costs more here.
> Each `--text-NN--line-height` is the keyword `normal`, so the text falls
> back to the leading of the face, not to a leading in this table. Always
> pass a size and its leading together in the same argument.

BUILD-PLAN §2.2 declares six letter spacings. Each one has one job in the
design. The name is that job.

| Utility            | Value    | Job                                      |
| ------------------ | -------- | ---------------------------------------- |
| `tracking-display` | `-1px`   | The 40, 48 and 72px titles.              |
| `tracking-title`   | `-0.5px` | The 24 and 26px card titles.             |
| `tracking-flat`    | `0px`    | Every serif and sans body role.          |
| `tracking-micro`   | `0.5px`  | Dates, chip names and the change marker. |
| `tracking-label`   | `1.2px`  | The mono micro-label.                    |
| `tracking-spine`   | `1.5px`  | The accent section label.                |

### 4.4 Space

BUILD-PLAN §2.3 declares thirteen gaps. The first eleven are multiples of
four. `--spacing` is pinned to 4px, so Tailwind's own numeric scale carries
them:

| Design gap | Utility | Design gap | Utility |
| ---------- | ------- | ---------- | ------- |
| `f-gap-04` | `1`     | `f-gap-28` | `7`     |
| `f-gap-08` | `2`     | `f-gap-32` | `8`     |
| `f-gap-12` | `3`     | `f-gap-40` | `10`    |
| `f-gap-16` | `4`     | `f-gap-44` | `11`    |
| `f-gap-20` | `5`     | `f-gap-60` | `15`    |
| `f-gap-24` | `6`     |            |         |

`gap-6` is therefore 24px, and `p-11` is 44px.

The last two steps are not multiples of four. The design uses both as a fixed
column width, and never as a gap, so they are **not** in the spacing
namespace:

| Design gap  | Utility                            | Value |
| ----------- | ---------------------------------- | ----- |
| `f-gap-90`  | `w-col-narrow`, `max-w-col-narrow` | 90px  |
| `f-gap-115` | `w-col-wide`, `max-w-col-wide`     | 115px |

A named `--spacing-90` would have shadowed the numeric scale for the whole
spacing namespace, not only for width. `gap-90` would then mean 90px where
the scale says 360px, and `p-115` would mean 115px where the scale says
460px, with no gate to catch either. `--container-*` builds a width utility
and no gap or padding utility at all, which is the only way the design uses
these two values.

Tailwind's default `--spacing` is `0.25rem`. That is 4px only while the root
font size is 16px. The pinned value is 4px always.

The frame is 1280px wide with a 60px gutter. The content is therefore 1160px
wide. At 360 the gutter is 16px and the content is 328px.

### 4.5 Radius, shadow and elevation

The design is square. Across all eighteen exports there is one radius. It is
2px, and it is drawn 111 times. It is the corner of a chip or a tag pill:
`Chip` carries it 28 times and the tag pills named after their own text
(`air-drying`, `South African`, `French`, and so on) carry it 82 times.
`F/Tag CTA` is one of the 111, not the whole set. There is no shadow, no blur
and no opacity anywhere.

`src/app/theme.css` therefore removes Tailwind's radius scale. `rounded-sm`
through `rounded-4xl` do not exist. One token replaces them:

| Utility        | Value | Use                  |
| -------------- | ----- | -------------------- |
| `rounded-chip` | `2px` | A chip or a tag pill |

`rounded-none` and `rounded-full` still work. Tailwind builds those two
without a token.

`src/app/theme.css` clears seven of Tailwind's default namespaces in all:

| Namespace      | What goes                                      |
| -------------- | ---------------------------------------------- |
| `--color-*`    | 22 hues, 242 values. `black` and `white` stay. |
| `--radius-*`   | `rounded-sm` through `rounded-4xl`.            |
| `--shadow-*`   | `shadow-2xs` through `shadow-2xl`.             |
| `--blur-*`     | Every `blur-*` and `backdrop-blur-*`.          |
| `--text-*`     | `text-xs` through `text-9xl`.                  |
| `--leading-*`  | `tight`, `snug`, `relaxed`, `loose`.           |
| `--tracking-*` | `tighter` through `widest`.                    |

R-BLD-02 and R-TKN-04 say a component must read a token. A hue, a size or a
shadow that is not in the design is the same fault one step removed. `black`
and `white` stay, because a shadcn/ui overlay draws its scrim with them.

**A cleared namespace fails silently, and M3 must plan for it.** Tailwind
emits no rule and no warning for a utility it cannot resolve. shadcn/ui's
new-york primitives are full of `rounded-md`, `rounded-sm`, `rounded-lg`,
`shadow-xs` and `text-sm`. Every one of those loses its property with nothing
in the build output to say so. The outcome is the design's intent — a square,
flat, on-scale control — but it is not a warning. Read each primitive when
you vendor it. Do not paste it.

The same clearing blinds `cn()`. tailwind-merge groups a class by its name,
and none of the names above is one it ships with. `src/lib/utils.ts`
therefore repeats these token lists in an `extendTailwindMerge` call. Add or
rename a token in `theme.css` and change that file in the same commit.

---

## 5. Decisions this map makes

Read this section before you change a value.

**1. `f-paper` is the page ground.** BUILD-PLAN §2.1 calls `f-paper` the card
ground and `f-desk` the page ground. The design draws the opposite. Every
frame in every export is `f-paper`. `f-desk` is the recessed fill under a
tick box, a field, a filter or a control bar. This map follows the design,
and BUILD-PLAN §2.1 now carries the corrected roles.

**2. A card has no fill.** `F/Recipe card`, `F/Index card`, `F/List row`,
`F/Revision`, `F/Batch line`, `F/Mechanism` and `F/Citation` carry no
background. They are hairline-ruled blocks on the page. `card` and `popover`
therefore hold the same value as `background`. This is deliberate. A
shadcn/ui `<Card>` must be restyled to a rule, not given a fill.

**3. `accent` means the design's accent, not the shadcn/ui accent.** The two
systems disagree on this one word. shadcn/ui means the hover ground of a
menu item. The design means the red. R-BLD-03 says the build uses the
design's names, so the design wins. `bg-accent` is the red.

A vendored shadcn/ui primitive that writes `bg-accent` for a hover state must
be changed to `bg-accent-wash`. This choice fails loudly. A missed rewrite
draws a solid red row, and a reader sees it at once. The opposite choice
would fail silently, because a section label in the wash is close to
invisible.

`accent-foreground` follows `accent`, not the wash. shadcn/ui always writes
the two together, as `focus:bg-accent focus:text-accent-foreground`, so the
pair must pass R-ACC-01 on the red. It takes `f-on-accent`, which is 8.06:1
light and 6.92:1 dark. When you rewrite `bg-accent` to `bg-accent-wash`, also
rewrite `text-accent-foreground` to `text-ink`. Leaving it draws paper on the
wash, which is unreadable — loud, like the rest of this decision.

**4. `f-hair-2` is a rule, never a ground under text.** It is drawn 169 times
as a table row border. It is drawn 5 more times as a fill, and every one of
those five is a line, not a ground: three `Rule` elements 1px tall in
`m360-access-science.html`, one `Scrollbar` track 4px tall in
`batch-logs-1280.html`, and the `Chip` that is its own swatch on Plate I. No
text is ever set on it. `muted` therefore takes `f-desk`, not `f-hair-2`.
This choice also removes the one text contrast failure in the system.
See §6.

**5. `input` leaves the design file.** The design draws **no** field boundary
at all. All 209 `Input`, `Field` and `Box` elements in the eighteen exports
(181 `Box`, 23 `Input` and 5 `Field`) are a bare `f-desk` fill with no
border declaration of any kind, and that
fill is 1.12:1 against the page. WCAG 1.4.11 asks for 3:1, so the control has
no perceivable boundary. `input` therefore takes `f-ink-3`, which is 5.25:1
on the paper and 5.60:1 on the dark ground. The value is already in the
palette, so no new colour is invented.

This token is an **addition**, not a substitution. It draws a rule where the
design draws none, and that is a deliberate deviation for R-ACC-01 and
1.4.11. It is the only place where this map leaves the design file. See §7.

**6. shadcn/ui has one muted text level and the design has two.** `f-ink-2`
carries the notice text and the 14px body. It is three points of contrast
above `f-ink-3`. The map therefore adds `foreground-muted` for `f-ink-2`.
Do not collapse the two. That would darken a lot of body copy for no reason.

**7. There is no class-based dark variant.** shadcn/ui ships
`@custom-variant dark (&:is(.dark *))`. Do not copy it in. R-BLD-07 says the
dark theme comes from `prefers-color-scheme`. Nothing adds a `.dark` class,
so the variant would make every `dark:` utility dead code.

**8. `chart-1` to `chart-5` and `sidebar-*` are absent.** The design has no
value for them. R-BLD-02 forbids inventing one.

---

## 6. R-ACC-01 — contrast

The threshold is 4.5:1. The relief for large text needs 24px, or 19px bold.
The relief almost never applies. `f-ink-3` is drawn at 8px and 9px more than
seventy times in `foundations.html` alone. Judge the whole palette at 4.5:1.

### 6.1 The light theme

| Text        | On `paper` | On `desk` | On `accent-wash` | On `warn-wash` |
| ----------- | ---------- | --------- | ---------------- | -------------- |
| `f-ink`     | 15.31:1    | 13.73:1   | 13.38:1          | 13.98:1        |
| `f-ink-2`   | 8.35:1     | 7.48:1    | 7.30:1           | 7.62:1         |
| `f-ink-3`   | 5.25:1     | 4.70:1    | 4.59:1           | 4.79:1         |
| `f-accent`  | 8.06:1     | 7.22:1    | 7.04:1           | 7.36:1         |
| `f-warn`    | 5.43:1     | 4.87:1    | 4.75:1           | 4.96:1         |
| `f-caution` | 5.67:1     | 5.08:1    | 4.96:1           | 5.18:1         |

Two pairs sit outside the table because they are a foreground on a colour,
not on a ground:

| Pair                               | Ratio  | Verdict |
| ---------------------------------- | ------ | ------- |
| `f-on-accent` on `f-accent`        | 8.06:1 | Passes  |
| `accent-foreground` on `bg-accent` | 8.06:1 | Passes  |

`accent-foreground` is `f-on-accent`, and that is why. shadcn/ui writes
`focus:bg-accent focus:text-accent-foreground` on every menu, select and
command item. Mapping `accent-foreground` to `f-ink`, as the shadcn/ui
default set does, gives 1.90:1 and fails. See §5, item 3.

Every pair in this section passes.

### 6.2 The dark theme

| Text         | On `paper` | On `desk` | On `hair-2` |
| ------------ | ---------- | --------- | ----------- |
| `fd-ink`     | 15.29:1    | 16.29:1   | 13.23:1     |
| `fd-ink-2`   | 9.21:1     | 9.80:1    | 7.96:1      |
| `fd-ink-3`   | 5.60:1     | 5.97:1    | 4.85:1      |
| `fd-accent`  | 6.92:1     | 7.37:1    | 5.99:1      |
| `fd-warn`    | 6.45:1     | 6.87:1    | 5.58:1      |
| `fd-caution` | 9.16:1     | 9.75:1    | 7.92:1      |

| Pair                               | Ratio  | Verdict |
| ---------------------------------- | ------ | ------- |
| `fd-on-accent` on `fd-accent`      | 6.92:1 | Passes  |
| `accent-foreground` on `bg-accent` | 6.92:1 | Passes  |

`f-ink` on `fd-accent` would be 2.21:1. See §5, item 3.

The two dark washes are 12% alpha. They composite over two grounds. All four
composites were measured. The worst case is `fd-ink-3` on `fd-accent-wash`
over `fd-paper`, at 4.66:1.

Every pair passes. The dark theme has no text failure.

### 6.3 The one failure, and why it cannot happen

`f-ink-3` on `f-hair-2` is 4.48:1. It fails by 0.02.

The design never draws that pair. `f-hair-2` is a rule, not a ground. This
map keeps it that way: `border-muted` is the only name it has, and no
foreground name pairs with it. See §5, item 4.

Two rules follow from this. Do not use `f-hair-2` as a background. Do not map
`muted` onto `f-hair-2`.

A second fix is available if the designer wants margin. Darken `f-ink-3` from
`#79655F` to `#736059`. That is a 4% change of the same hue. It clears 4.5:1
on all five light grounds, and it gives the light theme the same headroom as
the dark theme. M1 did not apply it. The value belongs to the designer.

### 6.4 Two pairs with no margin

`muted-foreground` on `muted` is 4.70:1. The margin is 0.20. It is also the
pair that shadcn/ui builds most often. Any change that darkens `f-desk` or
lightens `f-ink-3` breaks R-ACC-01. `pnpm audit:ui` must test this pair at
M7.

`f-ink-3` is drawn at 8px and 9px. It passes AA, because WCAG sets no minimum
size. It still carries step durations, oven temperatures, the word
"optional" and every empty-state sentence. This is legal and hard to read.
Raise it with the designer.

---

## 7. WCAG 1.4.11 — non-text contrast

R-ACC-01 covers text only. 1.4.11 is also AA, and the specification claims
AA. These are separate failures.

| Pair                                         | Ratio  | Verdict |
| -------------------------------------------- | ------ | ------- |
| Tick box `f-desk` on the `f-paper` page      | 1.12:1 | Fails   |
| Tick box `fd-desk` on the `fd-paper` page    | 1.06:1 | Fails   |
| Field border `f-hair` on the `f-desk` fill   | 1.20:1 | Fails   |
| Field border `fd-hair` on `fd-desk`          | 1.41:1 | Fails   |
| Focus ring `f-accent` on `f-paper`           | 8.06:1 | Passes  |
| Focus ring `fd-accent` on `fd-paper`         | 6.92:1 | Passes  |
| Tag pill outline `f-cta-line` on `f-paper`   | 3.11:1 | Passes  |
| Tag pill outline `fd-cta-line` on `fd-paper` | 3.43:1 | Passes  |

A plain rule between two blocks is decorative. 1.4.11 does not apply to it.

**`f-cta-line` has the least margin in the palette.** It clears 3:1 by 0.11
light and by 0.43 dark. It is the 1px outline of an interactive tag pill —
42 occurrences of
`bg-[#F7E8E3] [outline:1px_solid_#B0857A] [outline-offset:-0.5px]` inside
`Tag row 1` — so it is a user interface component and 1.4.11 applies. Two
rules follow. Do not lighten it, and do not darken the ground under it:
against `f-desk` it is 2.79:1 and against `f-accent-wash` it is 2.72:1, and
both fail. Never use it as text: `text-cta-line` compiles, and it is 3.11:1
at best, well under the 4.5:1 that R-ACC-01 asks for. `pnpm audit:ui` must
test this pair at M7, the same way it tests `muted-foreground` on `muted`.

The tick box is the serious one. `F/Ingredient row > Box` is 15px by 15px. It
is filled with `f-desk` and has no border. It is the control that D-05 and
C-14 exist for, and a low-vision reader cannot find it.

**The fix for M5.** Give the box a 1px border in `f-ink-3`. That is 5.25:1 on
the light page and 5.60:1 on the dark page. One token serves both themes, and
no new colour is invented.

**The fix for the field.** This map already applies it. `input` is `f-ink-3`.
See §5, item 5.

---

## 8. Values that are off the declared scale

The design draws nine values that no declared scale holds. Plate V says that
anything off the scale is a bug and not a decision. Each one waits on the
designer.

`src/app/theme.css` names all nine in one block. The block is marked
provisional. One block is easy to delete. The same values written by hand
into twenty components are not.

| Token               | Value    | Where the design uses it                         | Uses |
| ------------------- | -------- | ------------------------------------------------ | ---- |
| `text-09-5`         | `9.5px`  | `F/Page foot`                                    | 115  |
| `text-11-5`         | `11.5px` | `F/List row` source chip                         | 69   |
| `text-18`           | `18px`   | `F/Site header 360` menu glyph                   | 27   |
| `tracking-mark-360` | `1px`    | `F/Site header 360` brand mark                   | 27   |
| `tracking-head-360` | `1.3px`  | `F/Page head 360`                                | 52   |
| `tracking-foot`     | `1.4px`  | `F/Page foot`                                    | 115  |
| `gap-list-360`      | `7px`    | `List`                                           | 26   |
| `gap-brand-360`     | `10px`   | `Brand` (27) and `Batch control — two forms` (1) | 28   |
| `gap-section-360`   | `14px`   | `Section` bodies                                 | 53   |

Two more items need a decision.

`fd-hair-2` is `#222629`. No dark screen uses it. The dark screens draw the
table row rule in `fd-hair` instead. M1 keeps the declared value. Ask the
designer whether the dark table row keeps its quiet rule.

`f-gap-90` and `f-gap-115` are never used as a gap. They are used as a fixed
column width. M1 keeps both as a width, under `--container-*`. See §4.4.

`gap-brand-360` is named for the 360 header, but one of its 28 uses is on
`Batch control — two forms`, which is a component and not a header. Ask the
designer whether 10px is a header value or a general one, and rename the
token if it is general.

### 8.1 How an off-scale LENGTH is written — the fractional multiple

The nine tokens above are the off-scale values that carry a _role_: a type
size, a tracking, a named gap. A padding is different. The design draws
`4px 9px`, `11px 18px`, `15px 17px`, `10px 14px`, `11px 13px`, `7px` and a
82px column, and none of those is a role anything else reuses — naming nine
tokens for nine one-off paddings would be a scale nobody reads.

They are written as **fractional multiples of `--spacing`**, never as an
arbitrary pixel length:

| The design  | Written as        | Where                      |
| ----------- | ----------------- | -------------------------- |
| `9px`       | `px-2.25`         | `F/Mark`, `F/Mark quiet`   |
| `18px 11px` | `px-4.5 py-2.75`  | `F/Button`                 |
| `13px 11px` | `px-3.25 py-2.75` | `F/Filter`                 |
| `10px`      | `py-2.5`          | `F/Field`, `F/Tag CTA`     |
| `17px 15px` | `px-4.25 py-3.75` | `F/Notice`                 |
| `14px`      | `px-3.5`          | `F/Tag CTA`, `F/Skip link` |
| `18px`      | `px-4.5`          | `F/Tag hierarchy`          |
| `7px`       | `pb-1.75`         | `F/Section label`          |
| `82px`      | `w-20.5`          | `F/Measure`                |

`--spacing` is pinned to 4px (§4.4), so every one of these still reads the
token: change the unit and the whole system moves together, which an
arbitrary `px-[18px]` does not. M3 shipped both conventions for a while —
`px-4.5` and `px-[18px]` for the same 18px on the same component — and one
of them had to go.

They stay just as greppable as the arbitrary form. A decimal point in a
spacing utility means exactly "off the four-pixel grid":

```bash
grep -rnE '\b[pwmh][xybtlre]?-[0-9]*\.[0-9]' src/
```

### 8.2 The shell's one breakpoint

`--breakpoint-shell: 1080px`, in the `@theme` block, giving the `shell:`
variant. The design draws 1280 and it draws 360 and it does not say where
one becomes the other; the build has to choose, and 1080 is the first width
the drawn 1280 header row fits in — brand 194.4 + navigation 676.5 + list
control 56.8 + two 60px gutters = 1047.7px. Tailwind's `lg` is 1024 and
overflows that, which is the UNREACHABLE fault R-ACC-11 exists for; `xl` is
1280 and is a knife edge, because a classic scrollbar takes the query below
the viewport `pnpm audit:ui` drives at.

It was a literal `min-[1080px]:` repeated 38 times across five files. It is
one token now, mirrored in `src/lib/utils.ts` under `breakpoint` with every
other name this file adds (§4.5). Tailwind's five stock breakpoints are left
alone: nothing uses them, and clearing the namespace would only make a stock
name emit nothing rather than fail.

**Plate IV in `design/exports/plates-3-4.html` carries a superseded palette.**
Its swatch grid reads `f-paper` `#1E1613`, `f-desk` `#14100D`, `f-ink`
`#F6F0EA`, `f-ink-2` `#C4B6AE` — a warm dark, not the cool graphite of Plate
V. Those ten hex values appear in that one file and nowhere else in the
eighteen exports. The authoritative dark set is Plate V's
`DARK — SEPARATE SCREENS, NOT A THEME` grid, corroborated by
`dark-screens.html` and `recipe-1280-dark.html`, and that is what
`src/app/theme.css` holds. Nothing in the build needs a change. Flag Plate IV
to the designer so a later reader does not take it as ground truth.

---

## 9. What M1 built

| File                   | Change                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/app/theme.css`    | New. Holds every token in this document.                                                                            |
| `src/app/layout.tsx`   | Loads the three faces. Imports `theme.css`.                                                                         |
| `src/app/globals.css`  | Not changed. `theme.css` imported it into a `legacy` layer. M7 deleted the file, the layer and the import. See §10. |
| `src/lib/utils.ts`     | New. The `cn()` helper, taught this theme's token names.                                                            |
| `components.json`      | New. The shadcn/ui configuration.                                                                                   |
| `postcss.config.mjs`   | New. Runs the Tailwind plugin.                                                                                      |
| `design/BUILD-PLAN.md` | The `f-paper` and `f-desk` roles in §2.1 corrected. See §5, item 1.                                                 |
| `AGENTS.md`            | The stack and the repository layout record the styling files.                                                       |

`src/app/layout.tsx` asks Newsreader for `style: ['normal', 'italic']`, so
four WOFF2 files are preloaded on each page, not three: Newsreader upright,
Newsreader italic, Geist and Geist Mono. The design draws serif italic 250
times, so the fourth face is right to load. Nothing renders in any of the
four until M3.

R-ACC-09 is met in `src/app/theme.css`, not in each component.
`tw-animate-css` ships `animate-in`, `fade-in-*`, `zoom-in-*` and
`slide-in-from-*` with no `prefers-reduced-motion` guard of any kind, and
every shadcn/ui overlay asks for them. One unlayered
`@media (prefers-reduced-motion: reduce)` block near the palette cuts every
animation and transition to 0.01ms. That is cheaper and safer than a
`motion-safe:` prefix on fourteen primitives, each of which can be
forgotten. `globals.css` held no `!important` and no `@keyframes`, so the
block could not reverse a precedence the old stylesheet relied on.

**M1 to M6: the preflight was off, and the old stylesheet was layered.** The
reset and the old base rules fight each other, so `theme.css` imported
`tailwindcss/theme.css` and `tailwindcss/utilities.css` and left
`tailwindcss/preflight.css` commented out. `globals.css` came in under a
cascade layer called `legacy`, with the order `theme`, `base`, `legacy`,
`components`, `utilities`. Two facts made that necessary. Unlayered CSS
beats every layer whatever the order, and `globals.css` held bare element
rules for `html`, `body`, `a`, `h1`, `p`, `code`, `table` and more — left
unlayered, each would have beaten a Tailwind utility. And `globals.css`
declared three custom properties that Tailwind's own theme declares,
`--font-sans`, `--font-mono` and `--radius-sm`; `legacy` sits above `theme`,
so the old values won and no unrebuilt screen changed.

**M7 undid all of it.** `git rm src/app/globals.css`, the `legacy` layer and
its `@import` gone from `theme.css`, and the three-part import collapsed back
to one `@import 'tailwindcss'` — which is the same three parts in the same
three layers, plus the preflight, and declares the layer order itself so the
two can never drift apart. §10 records what had to be kept.

---

## 10. The palette bridge — M3, and DELETED at M7

**This section is a tombstone. The bridge is gone.**

### 10.1 What it was

`src/app/globals.css` styled the twenty screens that M4 to M6 had not
rebuilt. It declared its own palette — `--bg`, `--surface`, `--text`,
`--accent` and twelve more — and read it in about 400 rules, and those
values were still the old purple. A header rebuilt in DOSSIER sat on a page
painted in purple, and the pairing was not guaranteed to pass R-ACC-01.

M3 answered it with sixteen lines: an **unlayered** `:root` block in
`src/app/theme.css` that redefined every colour property `globals.css`
declared in terms of a `var(--f-*)` token. Unlayered CSS beats every cascade
layer whatever the order, and `globals.css` was imported into
`layer(legacy)`, so those sixteen declarations won over **both** of its
`:root` blocks — the dark one and the one inside its light media query. A
media query adds no specificity and changes no layer, so one block served
both themes and the direction was inherited from the `f-` tokens rather than
repeated. There was no second block and there must not have been one: a
bridge written as two blocks of hex can be written the wrong way round and
invert the site.

It was **colour only**. The six non-colour properties `globals.css`
declared — `--radius`, `--radius-sm`, `--font-sans`, `--font-mono`,
`--measure` and `--page` — were deliberately not bridged. Colour is
self-completing: it repainted twenty screens with no geometric change at
all, so the end-to-end tests and the `pnpm audit:ui` baseline were
untouched. Radius and type are half-jobs. Flipping `--radius` to 2px would
have squared fifteen corners and left eighteen hard-coded ones rounded;
flipping the faces would have reflowed every line on every old screen and
silently rescaled `--measure: 68ch` by about 8%, because Geist's `0` is
wider than the system stack's. Both are shape, not colour, and both belonged
to the milestone that rebuilt each screen.

Every screen it served has since been rebuilt. It did its job.

### 10.2 The deletion

M7 removed all three parts in one commit, exactly as D-03 says:

| Part                      | Where                                                                         | Action   |
| ------------------------- | ----------------------------------------------------------------------------- | -------- |
| the old stylesheet        | `src/app/globals.css`, 1,892 lines                                            | `git rm` |
| the layer that carried it | `theme.css` — `@layer … legacy …` and `@import './globals.css' layer(legacy)` | deleted  |
| the bridge itself         | `theme.css` — the unlayered `:root` block, 91 lines                           | deleted  |

Nothing read the old palette any more. Measured before the deletion: zero
reads of `var(--bg | --surface | --text | --accent | --border | --warn |
--radius | --measure | --page | --font-sans | --font-mono)` anywhere in
`src/` outside a comment. The bridge had no consumer left, so it went with
the file it was bridging to.

The `@theme inline` map in §3.1 is **not** affected. It never fed
`globals.css`; it is how a component reads a token, and it is the whole
colour system now.

### 10.3 What replaced it — the seven declarations that survived

Deleting `globals.css` turns Tailwind's preflight on, and preflight is a
near-complete replacement for what that file's base rules did: it owns the
box sizing, the margin and padding reset, `-webkit-text-size-adjust`, the
heading size and weight reset, the list reset, the form-control font, the
`border-collapse` and the placeholder colour. It is **not** a total one.
Seven declarations had no counterpart and are restored in an `@layer base`
block in `theme.css`, placed after the preflight arrives in the same layer
so it wins on source order. They sit in four rules, and the `body` rule
carries two of them in one line:

| Declaration                       | Why it has no replacement                                                                                                                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `html { scroll-padding-top: … }`  | Preflight has no scroll rule at all. Without it the property is `auto` on every page load and every in-page jump — the skip link, an anchor, focus scrolling — lands under the sticky header.                                      |
| `body { background; color }`      | Preflight paints nothing and leaves the body transparent, so the browser's own canvas shows through and the page loses its ground and its ink.                                                                                     |
| `body { line-height: 1.6 }`       | Preflight sets `html { line-height: 1.5 }`. 1.5 is on no scale in this design. Measured, the difference is 1.6px on 144 elements and it cascades into 532 vertical shifts of up to 29px. Load-bearing, not cosmetic.               |
| `body { -webkit-font-smoothing }` | No counterpart, and no effect on Linux — so no headless measurement can catch it. Dropping it thickens every glyph on macOS and Safari.                                                                                            |
| `h1 … h6 { text-wrap: balance }`  | Its three neighbours in the old heading rule — line height, letter spacing and margin — are written by every rebuilt heading and by preflight. This one is written by nothing, and 14 of 88 page loads re-wrap a title without it. |
| `#main:focus { outline: none }`   | `#main` is a `tabindex="-1"` landmark, not a control, and Chromium matches it against `:focus-visible` all the same. Without the rule, taking the skip link draws a 1px ring around the whole main column.                         |

`body { font-size: 16px }` and `body { font-family }` are in the same block
and are **not** part of the seven. Neither is strictly required — the first
is the browser default and the second is what preflight's
`--default-font-family` resolves to — but both are what every screen was
measured against, and stating them keeps the page off a Tailwind internal.
Nine declarations in four rules is what the block actually holds: seven that
preflight does not cover, plus these two.

Four things `globals.css` did are **deliberately not** restored, because
preflight contradicts them and the design agrees with preflight:

- `a { color: var(--accent); text-decoration-color: 35% accent }`. Preflight
  sets `color: inherit`. Every rebuilt anchor writes its own colour, and
  `PROSE_LINK` writes its own offset. The one measured change is that its
  underline goes from a 35%-alpha accent to the full accent, which is what
  D-10 asks for.
- `h1 { clamp(…) } h2 { 1.35rem } h3 { 1.05rem }`. Preflight resets heading
  size and weight to `inherit`. **Zero** headings changed either.
- `:focus-visible { outline: 2px solid accent; outline-offset: 2px;
border-radius: 4px }`. **The rule had three declarations, and the first
  measurement of it counted only the outline.** Of 2,848 focusable elements
  measured, 74 outline values change and 73 are inert — the control carries
  `outline-none` and the ring is on the box around it. Three real changes
  follow, not one:

  1. **Every focus ring in the app is now square.** `border-radius: 4px`
     applied to every focused element and nothing replaces it. That end
     state is the design — §4.5 counts one radius in the whole system, the
     2px chip corner — but it is a change on every screen, and it is
     invisible to a resting-state pixel diff because a ring is only painted
     while focused.
  2. `F/Skip link`. Its 2px offset did not drop to 0; it fell through to
     Chromium's own `:focus-visible` default of 1px. `f/skip-link.tsx` now
     writes `outline-offset-0`, which is the flush ring
     `foundations.html:1750` draws.
  3. **A scroll box is a third case, and it is not a control.** Chromium
     makes an overflowing scroll container keyboard-focusable with no
     `tabindex`. The mass flow strip is 1002px in a 328px box at 360, so it
     is a tab stop on `/recipes/baumy-biltong`, it drew the accent ring from
     the deleted rule, and it fell through to Chromium's black-and-white
     `outline-style: auto`. `f/mass-flow.tsx` now carries `FOCUS_RING`, and
     so do the four other scroll boxes in `src/` — `markdown.tsx`'s table
     and its `pre`, the measurement table in `batch-log-detail.tsx` and the
     callerless table branch of `filterable-groups.tsx`. Measured, none of
     those four overflows on the seeded site at any audited width, so the
     mass flow strip was the only element in the app in that state.

- `input, select { padding: 0.55rem 0.75rem }`. Preflight's `* { padding: 0 }`
  takes the user agent's own control padding with it. `f/field.tsx` and
  `scale.tsx` write theirs. The four scale presets on the recipe screen lose
  6px of UA padding each and equalise, which is the design.

### 10.4 The class names that went with the file

Thirteen class names in `src/` existed only as `globals.css` selectors or as
end-to-end test hooks hung on one. Each is now a data attribute, and every
utility that stood beside one purely to cancel a legacy declaration went with
the rule it cancelled.

| Was                                     | Is                      | On                                                                                 |
| --------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| `.shopping-item`                        | `[data-shopping-item]`  | `shopping-checklist.tsx`                                                           |
| `.shopping-group-heading`               | `[data-shopping-group]` | `shopping-checklist.tsx`                                                           |
| `.checklist-head`                       | `[data-checklist-head]` | `shopping-checklist.tsx`                                                           |
| `.basket-button`                        | `[data-basket-control]` | `shopping-basket.tsx`                                                              |
| `.button-primary` / `.button-secondary` | `[data-in-basket]`      | `shopping-basket.tsx` — a state marker, read by the wrapper in `recipe-detail.tsx` |
| `.site-footer`                          | `[data-page-foot]`      | `f/page-foot.tsx`                                                                  |
| `.list-recipes`                         | `[data-list-recipes]`   | `app/list/list-recipes.tsx`                                                        |
| `.recipe-hero-image`                    | `[data-hero-image]`     | `recipe-detail.tsx`                                                                |
| `.step-image`                           | `[data-step-image]`     | `recipe-detail.tsx`                                                                |
| `.recipe-tabs`                          | `[data-tab-strip]`      | `recipe-tabs.tsx` — the attribute already existed                                  |
| `.recipe-layout`                        | `[data-recipe]`         | `recipe-tabs.tsx` — the attribute already existed                                  |
| `.recipe-aside`                         | `[data-recipe-aside]`   | `recipe-tabs.tsx`                                                                  |
| `.tag-wrap`                             | `[data-tag]`            | `tags.tsx`, on `TermTag` and not on every `Tag`                                    |
| `.section`                              | `[data-group]`          | `filterable-groups.tsx`                                                            |

`.basket-cta`, `.shopping-list` and `.plain-list` were in no rule and no
test — the last was never a rule in any stylesheet — and were deleted
outright. `data-panels` and `data-aside` on `recipe-tabs.tsx` existed for
`globals.css` alone and went with it.

`scripts/audit-ui.ts` needed no change: its `.tag` and `.check` are string
building and property access, not selectors.

### 10.5 What the bridge did NOT fix, and where that stands

Every fault §10.5 used to list was a `globals.css` rule, and each was closed
by the milestone that replaced that rule. The last of them, the
`.list-recipes[data-pending] { opacity: 0.6 }` group opacity that composited
live text against the page, went with the file: `app/list/list-recipes.tsx`
had already stopped drawing it, and the `opacity-100` that cancelled it is
gone too.

### 10.6 What the 88-load measurement did not cover

The deletion was measured as 88 before-and-after page loads: the 22 routes
in `scripts/audit-ui.ts` at 360 and 1280, light and dark, with every element
in `header`, `main` and `footer` compared on 23 computed properties. **Read
the coverage before you read the number.** Three things sit outside it, and
each was found later by somebody re-measuring:

1. **`border-radius` was not one of the 23 properties**, and the deleted
   `:focus-visible` rule set it. §10.3 records what that changed.
2. **A focus ring is only painted while focused**, so a resting-state pixel
   diff cannot see one at all. The three changes in §10.3 all needed a
   keyboard sweep to find.
3. **`/list` is audited with an EMPTY basket**, so `ShoppingChecklist`,
   `ListRecipes` and `TickAll` never rendered in any of the 88. One real
   change landed there: `[data-checklist-head]` computed `gap: 12px` before
   and `gap: normal` after, because `globals.css`'s
   `.checklist-head { gap: 0.75rem }` was the only writer of it and
   `TickAll` in `f/list-row.tsx` writes none. On `/list?r=…` at 360 the
   readout box moves 12px and the `0 OF 16 IN THE TROLLEY` run shifts about
   7px left, in both themes. **Nothing is fixed, because the new value is
   the design**: `list-search-archive-1280.html:489` draws `Tick all` as
   `gap-0 p-[14px_16px] justify-between`. The comment that authorised the
   removal — "the old rule is the same flex row `TickAll` already draws" —
   was wrong about the gap and right about the outcome by accident.

The lesson for the next measurement is the coverage, not the properties: a
route list built for a geometric audit visits each screen in its resting
state, and a state a reader reaches by clicking is not in it.

---

## 11. The vendored shadcn/ui primitives — M3

**Two** primitives live in `src/components/ui/`: `sheet.tsx` and
`tooltip.tsx`. Each was vendored with `pnpm dlx shadcn@latest add <name>` —
the CLI works on this machine — and then **rewritten**. §4.5 explains why
rewriting is not optional: `theme.css` clears seven of Tailwind's namespaces,
and Tailwind emits no rule and no warning for a utility it cannot resolve.
Stock new-york is full of `rounded-md`, `text-sm`, `shadow-xs` and `h-9`,
and every one of them would have lost its property silently.

### 11.0 Four more were vendored, and then deleted

M3 also vendored `button.tsx`, `badge.tsx`, `input.tsx` and `separator.tsx`.
All four are gone. **The reason is R-CMP-16, not tidiness.**

Each of the four claimed a design name that a component in
`src/components/f/` already owned and shipped — `ui/button.tsx` said it was
`F/Button` and `F/Button > Quiet`, which `f/button.tsx` implements;
`ui/badge.tsx` said it was `F/Mark`, `F/Mark quiet` and `F/Tag CTA`, which
`f/mark.tsx` and `f/tag.tsx` implement; `ui/input.tsx` said it was `F/Field`
and `F/Filter`, which `f/field.tsx` implements. None of the four had a
single importer. R-CMP-16 asks for one component per design name and there
were two, and **the unused one was the one that disagreed with the export**:

| Design name        | The export draws                  | `f/` (shipped)                      | `ui/` (deleted)                                   |
| ------------------ | --------------------------------- | ----------------------------------- | ------------------------------------------------- |
| `F/Button`         | no border of any kind             | `bg-accent text-on-accent`          | `border border-accent …` — 2px wider and taller   |
| `F/Button > Quiet` | a 1px inset **outline** at −0.5px | `outline-1 outline-offset-[-0.5px]` | `border border-hair` — a border, so the box grows |
| `F/Tag CTA`        | `gap-[12px]`, an inset outline    | `gap-3` + the inset outline         | `gap-1` (4px) never overridden, and a border      |
| `F/Mark`           | `p-[ 4px_9px ]`, no border        | `px-2.25 py-1`                      | `border border-transparent` — 9/4 inset by 1px    |

They also contradicted each other on what the design contains: `ui/button`
shipped `sm`, `lg`, `glyph`, `secondary`, `destructive`, `ghost` and `link`,
while `f/button.tsx` records from the exports that there is exactly one size
and none of those variants. `ui/separator.tsx` additionally carried
`'use client'` and pulled a Radix package into the runtime for no consumer,
against §9.3.

M4 builds fifteen more components. It must not be able to pick the wrong
one. §11.3 keeps every conversion the four made, because the readings are
still the record of what stock gets wrong in this theme, and the next
`shadcn add` will meet all of them again.

Three rules were applied to all six.

1. **The design's names, not shadcn/ui's.** R-BLD-03. `bg-accent`, not
   `bg-primary`; `text-ink-3`, not `text-muted-foreground`. Both names
   resolve to the same value (§3.1), so this is legibility, not behaviour.
2. **No opacity, anywhere.** §4.5: the design draws none. Stock uses it for
   hover (`/90`), for focus (`ring-ring/50`) and for the disabled state
   (`opacity-50`). A group opacity also composites live text against
   whatever is behind it, which is exactly how the old stylesheet lost
   contrast on two controls. Every one is replaced by a token colour.
3. **No `dark:` variant.** §5 item 7: nothing in this build adds a `.dark`
   class, so every `dark:` utility stock ships is dead code. All removed.

### 11.1 What the CLI got wrong

Two things, both corrected, both worth knowing before the next `add`:

- It wrote `import { cn } from "cn"` — a bare module specifier, not the
  `@/lib/utils` alias `components.json` declares — and then installed the
  unrelated npm package **`cn`** to satisfy it. Removed from `package.json`,
  and every import repointed at `@/lib/utils`.
- It installed the unified **`radix-ui`** package (310 transitive packages)
  and imported `{ Slot }`, `{ Dialog as SheetPrimitive }` and so on from it.
  Replaced with the four primitives actually used.

### 11.2 The dependencies

Both declare `react` `^19.0` and `react-dom` `^19.0` as peers, so React
19.2.8 is in range. Pinned exactly, matching how the other user-interface
dependencies in `package.json` are pinned.

| Package                   | Version  | Needed by                    |
| ------------------------- | -------- | ---------------------------- |
| `@radix-ui/react-dialog`  | `1.1.23` | `sheet.tsx` — the 360 drawer |
| `@radix-ui/react-tooltip` | `1.2.16` | `tooltip.tsx`                |

`@radix-ui/react-separator`, `@radix-ui/react-slot` and
`class-variance-authority` went with the four deleted files (§11.0) and are
out of `package.json`; `shadcn add` reinstalls what M4 needs. `clsx` and
`tailwind-merge` were already present. `lucide-react` is used by neither of
the two: the drawer's close control is the design's own `×` glyph.

### 11.3 Every conversion

A **dropped** row means the stock utility was removed and nothing replaced
it. A **silent** row means the stock utility resolved to nothing at all
before the rewrite, because §4.5 had cleared its namespace.

The first four tables — `button`, `badge`, `input`, `separator` — are the
**record of a deleted file** (§11.0). They are kept because they are the
list of what stock new-york gets wrong under this theme, and the next
`shadcn add` meets all of it again. Do not read them as shipping code; the
shipping answers for those design names are in `src/components/f/`.

#### `button.tsx` — C-03, C-18, and `F/Button` — DELETED, see §11.0

| Stock                                                                                    | Now                                                                             | Note                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rounded-md`                                                                             | `rounded-none`                                                                  | Silent. §4.5: one radius, 2px, and it is a chip's.                                                                                                                                                 |
| `text-sm font-medium`                                                                    | `font-mono text-10 leading-normal font-normal tracking-spine uppercase`         | Silent. `F/Button > Label` is Geist Mono 10px at 1.5px tracking. Size and leading in one argument — §4.3.                                                                                          |
| `h-9 px-4 py-2 has-[>svg]:px-3`                                                          | `px-4.5 py-2.75`                                                                | The design sizes a button by padding, not height. `--spacing` is 4px, so this is 18px × 11px — `F/Button`'s own box, read from a token rather than written as a raw length.                        |
| `h-6/h-8/h-10`, `size-9`, `icon-xs`, `icon-sm`, `icon-lg`                                | `sm`, `lg`, `glyph`                                                             | Four icon sizes collapse to one 28px `glyph` — the `≡` that opens the drawer. 28px and not 24px so `scripts/audit-ui.ts`, which reports any control under 24 × 24, has margin.                     |
| `focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50`          | `focus-visible:outline-solid outline-2 outline-offset-2 outline-accent`         | `ring-[3px]` is a raw length and `/50` is opacity. R-ACC-05; the ring is `f-accent`, 8.06:1 / 6.92:1 (§7). `outline-none` sets `--tw-outline-style: none`, so `outline-solid` has to set it back.  |
| `disabled:opacity-50`                                                                    | `disabled:border-hair disabled:bg-desk disabled:text-ink-3`                     | Recessed with a colour. 4.70:1, so it clears R-ACC-01 even though WCAG 1.4.3 exempts an inactive control.                                                                                          |
| `aria-invalid:ring-destructive/20`, `dark:aria-invalid:ring-destructive/40`              | `aria-invalid:border-warn aria-invalid:text-warn`                               | Opacity out, `dark:` dead.                                                                                                                                                                         |
| `bg-primary text-primary-foreground hover:bg-primary/90`                                 | `border-accent bg-accent text-on-accent hover:bg-accent-wash hover:text-accent` | `F/Button`. §3.2 records that the design draws no hover colour, so this one is derived: fill and label swap, 7.04:1 light and 5.76:1 dark. The rule is on in both states so the box does not move. |
| `outline`: `border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground` | `border border-hair bg-transparent text-ink hover:bg-desk`                      | `F/Button > Quiet`. `shadow-xs` was silent. The `hover:bg-accent` rewrite is §5 item 3 — in this theme `accent` is the red.                                                                        |
| `ghost`: `hover:bg-accent hover:text-accent-foreground`                                  | `hover:bg-accent-wash hover:text-ink`                                           | §5 item 3, both halves. Leaving `text-accent-foreground` would draw paper on the wash.                                                                                                             |
| `secondary`: `bg-secondary text-secondary-foreground hover:bg-secondary/80`              | `bg-desk text-ink hover:bg-accent-wash`                                         |                                                                                                                                                                                                    |
| `destructive`: `bg-destructive text-white`                                               | `bg-warn text-on-accent`                                                        | `text-white` is a stock hue. `f-on-accent` on `f-warn` is 5.43:1 light, 6.45:1 dark.                                                                                                               |
| `link`: `text-primary underline-offset-4`                                                | `text-accent decoration-cta-line underline-offset-4`                            | `f-cta-line` is _the underline on a call to action_ (BUILD-PLAN §2.1). Never as text — §7.                                                                                                         |
| `dark:border-input dark:bg-input/30 dark:hover:bg-input/50 dark:bg-destructive/60`       | dropped                                                                         | Dead code.                                                                                                                                                                                         |
| `transition-all`                                                                         | `transition-colors`                                                             | Nothing else changes.                                                                                                                                                                              |

#### `badge.tsx` — `F/Mark`, `F/Mark quiet`, `F/Tag CTA`, the list count — DELETED, see §11.0

| Stock                                                           | Now                                                                                                                              | Note                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rounded-full`                                                  | `rounded-none`                                                                                                                   | Silent for the `outline` variant's replacement, dropped elsewhere. The design has no pill; only `F/Tag CTA` takes the 2px corner.                                                                                                                         |
| `px-2 py-0.5`                                                   | `px-2.25 py-1`                                                                                                                   | 9px × 4px — the box `F/Mark` and `F/Mark quiet` share.                                                                                                                                                                                                    |
| `text-xs font-medium`                                           | `font-mono text-09 leading-normal font-normal tracking-label uppercase`                                                          | Silent. Geist Mono 9px at 1.2px.                                                                                                                                                                                                                          |
| `transition-[color,box-shadow]`                                 | `transition-colors`                                                                                                              | There is no shadow to transition.                                                                                                                                                                                                                         |
| focus, `aria-invalid`, `dark:`                                  | as `button.tsx`                                                                                                                  |                                                                                                                                                                                                                                                           |
| `bg-primary text-primary-foreground`                            | `bg-accent text-on-accent`                                                                                                       | `F/Mark`, the kind badge.                                                                                                                                                                                                                                 |
| `bg-secondary text-secondary-foreground`                        | `bg-desk text-ink`                                                                                                               | `F/Mark quiet`, the revision badge.                                                                                                                                                                                                                       |
| `bg-destructive text-white`                                     | `bg-warn text-on-accent`                                                                                                         |                                                                                                                                                                                                                                                           |
| `outline`: `border-border text-foreground [a&]:hover:bg-accent` | `rounded-chip border-cta-line bg-accent-wash px-3.5 py-2.5 font-serif text-15 leading-normal tracking-flat text-ink normal-case` | `F/Tag CTA`, drawn exactly: 14px × 10px, the wash, a 1px `f-cta-line` rule, the 2px corner and Newsreader 15px. The design's `[outline:1px_solid] [outline-offset:-0.5px]` is a 1px inset rule, which `border` under `box-sizing: border-box` already is. |
| `[a&]:hover:bg-primary/90` and friends                          | `[a&]:hover:bg-accent-wash`                                                                                                      | Opacity out. `[a&]:` is kept: a static mark must not react to the pointer.                                                                                                                                                                                |
| —                                                               | **new** `count` variant                                                                                                          | `bg-accent px-1.75 py-0.5 text-10 tracking-flat text-on-accent` — the count beside the word LIST in the site header, `p-[2px_7px]` in the design. C-03.                                                                                                   |

#### `input.tsx` — `F/Field`, `F/Filter`, C-17 — DELETED, see §11.0

| Stock                                                         | Now                                                             | Note                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `h-9 px-3 py-1`                                               | `px-3 py-2.5`                                                   | 12px × 10px, `F/Field > Input`'s box. The design sets no field height.                                                                                                                                                                                                                                       |
| `rounded-md`                                                  | `rounded-none`                                                  | Silent.                                                                                                                                                                                                                                                                                                      |
| `bg-transparent`, `dark:bg-input/30`                          | `bg-desk`                                                       | The design's recessed fill. The `dark:` companion is dead code.                                                                                                                                                                                                                                              |
| `border border-input`                                         | kept                                                            | It resolves to `f-ink-3` here, and that is §5 item 5 — **the one place this map leaves the design file.** The design draws no field boundary at all across 209 elements, and the bare `f-desk` fill is 1.12:1 against the page, which fails WCAG 1.4.11. `f-ink-3` is 5.25:1 / 5.60:1 and invents no colour. |
| `text-base md:text-sm`                                        | `font-sans text-14 leading-normal tracking-flat`                | Both silent. The design draws one size.                                                                                                                                                                                                                                                                      |
| `shadow-xs`                                                   | dropped                                                         | Silent, and §4.5 forbids it.                                                                                                                                                                                                                                                                                 |
| `placeholder:text-muted-foreground`                           | `placeholder:text-ink-3`                                        | Same value, design name. 4.70:1 on `f-desk` — §6.4 names this pair; do not lighten it.                                                                                                                                                                                                                       |
| `selection:bg-primary selection:text-primary-foreground`      | `selection:bg-accent selection:text-on-accent`                  |                                                                                                                                                                                                                                                                                                              |
| `file:h-7 file:text-sm file:font-medium file:text-foreground` | `file:font-mono file:text-10 file:leading-normal file:text-ink` | `file:text-sm` was silent.                                                                                                                                                                                                                                                                                   |
| `disabled:opacity-50`                                         | `disabled:border-hair disabled:text-ink-3`                      | Colour, not opacity.                                                                                                                                                                                                                                                                                         |
| focus, `aria-invalid`, `dark:`                                | as `button.tsx`                                                 |                                                                                                                                                                                                                                                                                                              |

#### `separator.tsx` — DELETED, see §11.0

| Stock       | Now                                     | Note                                                                                                                                                                                                                           |
| ----------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bg-border` | `bg-hair`                               | Same value, design name.                                                                                                                                                                                                       |
| —           | **new** `variant="quiet"` → `bg-hair-2` | The design has two rules. `f-hair-2` is drawn 169 times as a table row border. §5 item 4 permits exactly this use and forbids the other: it is a rule, never a ground under text, because `f-ink-3` on it is 4.48:1 and fails. |

`"use client"` is required and is not a choice — Radix's `Separator.Root`
reads context. It holds no state, so it does not count against the eight
browser components in §9.3, and a Server Component may render it because the
boundary carries only props (R-CON-02).

#### `tooltip.tsx` — C-07, R-ACC-02, R-ACC-03

**The design draws no tooltip.** Grep the eighteen exports and there is
nothing. The treatment is therefore derived, and it was derived from the one
`globals.css` drew at `.tag-tooltip`, so the two agreed while both were on
the site: an opaque page-ground fill with one strong rule. That file went at
M7; this is the only drawing of the tooltip now.

| Stock                                                                       | Now                                           | Note                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bg-foreground text-background`                                             | `border border-ink-3 bg-paper text-ink`       | The bridge's `--border-strong`, in component form. 5.25:1 / 5.60:1 as a boundary, well past 1.4.11's 3:1. The fill must be fully opaque: this floats over body text, and `e2e/classes.spec.ts` asserts an alpha of exactly 1.                                           |
| `rounded-md`                                                                | `rounded-none`                                | Silent.                                                                                                                                                                                                                                                                 |
| `text-xs`                                                                   | `font-sans text-13 leading-150 tracking-flat` | Silent.                                                                                                                                                                                                                                                                 |
| `px-3 py-1.5`                                                               | `px-3 py-2`                                   | 6px is on no scale here; 8px is.                                                                                                                                                                                                                                        |
| `w-fit`                                                                     | `w-fit max-w-88`                              | 352px — what `.tag-tooltip` already caps at.                                                                                                                                                                                                                            |
| `TooltipPrimitive.Arrow` with `rounded-[2px] bg-foreground fill-foreground` | **removed**                                   | A rotated filled square works only on a fill with no border, and this tooltip is a ruled block. A square, flat tooltip with a 1px rule is the design's own language.                                                                                                    |
| `shadow-md`                                                                 | dropped                                       | §4.5: no shadow, no blur, no opacity.                                                                                                                                                                                                                                   |
| `sideOffset={0}`                                                            | `sideOffset={6}`                              | The rule needs to clear the trigger.                                                                                                                                                                                                                                    |
| provider                                                                    | `TooltipProvider` nested inside `Tooltip`     | shadcn/ui's install note asks the caller to wrap the application; nesting is what shadcn/ui itself now ships and it keeps `src/app/layout.tsx` free of a provider one component needs. The named export stays for a caller that wants one delay across a group of tags. |
| animations                                                                  | kept                                          | `tw-animate-css`; R-ACC-09 is handled once in `theme.css`, not per primitive.                                                                                                                                                                                           |

Radix writes `aria-describedby` on the trigger and opens on focus as well as
hover, which is R-ACC-02, R-ACC-03 and R-CMP-03 — and why R-CMP-04 forbids
the `title` attribute.

#### `sheet.tsx` — C-02, the 360 drawer, R-NAV-03

The design draws it as the frame `Contents — 360` in
`design/exports/recipe-360.html`:
`w-[360px] absolute left-0 top-0 bg-[ #FCFAF6 ] overflow-hidden`.

| Stock                                                                                                                                             | Now                                                                                      | Note                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `w-3/4 sm:max-w-sm`                                                                                                                               | `w-full`                                                                                 | The drawer is the full width of the 360 screen. A cap would leave a strip of scrim the design does not draw.                                                                                                                |
| `side = "right"`                                                                                                                                  | `side = "left"`                                                                          | The design opens it from the left.                                                                                                                                                                                          |
| `bg-background`                                                                                                                                   | `bg-paper text-ink`                                                                      | Design name; and §3.2 — there is no raised ground to put it on.                                                                                                                                                             |
| `shadow-lg`                                                                                                                                       | dropped                                                                                  | Silent, and §4.5 forbids it.                                                                                                                                                                                                |
| —                                                                                                                                                 | `rounded-none`                                                                           | Stated rather than assumed.                                                                                                                                                                                                 |
| `border-l` / `border-r` / `border-t` / `border-b`                                                                                                 | `+ border-hair`                                                                          | Stock leaves the colour to preflight, which was off until M7 and is on now. Writing the colour is still right: `border-hair` is a token and preflight's `currentColor` is not.                                              |
| overlay `bg-black/50`                                                                                                                             | **kept**                                                                                 | The one place `black` survives §4.5's clearing, and the comment in `theme.css` says why: shadcn/ui draws its scrim with it. A full-width drawer hides it, but the layer still catches the dismissing click.                 |
| close: `rounded-xs opacity-70 hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 data-[state=open]:bg-secondary` + lucide `XIcon` | `size-7 rounded-none font-mono text-18 text-ink hover:bg-accent-wash` + the design's `×` | `rounded-xs` was silent, and opacity is out. The design draws this control as `×` in Geist Mono at 18px. 28px box, above `audit-ui`'s 24 × 24 floor. Pass `showCloseButton={false}` when `F/Site header 360` draws its own. |
| `SheetHeader`: `flex-col gap-1.5 p-4`                                                                                                             | `flex-row items-center justify-between gap-2 border-b border-hair p-4`                   | The design's drawer header is a 16px box with a 1px `f-hair` rule under it.                                                                                                                                                 |
| `SheetTitle`: `font-semibold text-foreground`                                                                                                     | `font-serif text-17 leading-normal font-medium tracking-flat text-ink`                   | `Brand > W` is Newsreader 17px at weight 500. Stock set no face and no size at all. Radix requires a title on every dialog — wrap it in `sr-only` rather than omitting it.                                                  |
| `SheetDescription`: `text-sm text-muted-foreground`                                                                                               | `font-sans text-13 leading-170 tracking-flat text-ink-3`                                 | `text-sm` was silent. The drawer entry's `D` is Geist 13px over 22px; 22 ÷ 13 is 1.69, which is `leading-170` to a tenth of a pixel (§4.3).                                                                                 |
| content `gap-4`                                                                                                                                   | `gap-0 overflow-y-auto`                                                                  | The drawer's own sections carry their spacing, and nine entries can exceed a 360 × 780 screen.                                                                                                                              |

R-NAV-06 and R-CMP-02 keep the list control **outside** this drawer. Nothing
in the file enforces that; it is a rule for whoever composes
`F/Site header 360`.

### 11.4 Reading a size from a token, not writing a length

The design's control padding is not on the thirteen-step gap scale of §4.4:
`F/Button` is `p-[11px_18px]`, `F/Field` is `p-[10px_12px]`, `F/Mark` is
`p-[ 4px_9px ]`.

No primitive writes an arbitrary length for these. `--spacing`
is pinned to 4px (§4.4) and Tailwind's spacing scale accepts a fractional
multiplier, so `px-4.5` compiles to `calc(var(--spacing) * 4.5)` — 18px read
from the token. The same trick gives 11px (`2.75`), 10px (`2.5`), 9px
(`2.25`) and 7px (`1.75`).

This deliberately adds **no** new token. §4.5 requires that any token added
to `theme.css` be repeated in `src/lib/utils.ts` in the same commit, so a
padding scale would have been a second file and a second list to keep in
step, for values that are the design's own off-scale drift rather than a
declared scale. If the designer later ratifies a control-padding scale, it
belongs in `theme.css` with the nine provisional values in §8 — and these
multipliers are then a single find-and-replace.

§8.1 extends the same rule to `src/components/f/`, which shipped a second
convention — `px-[18px]` beside `px-4.5` for the same 18px on the same
component — until it was normalised. There is one form now.

Verified against the built stylesheet: every utility the primitives use
emits a rule, and every one of those rules reads a `var(--…)` from
`theme.css`. Nothing was dropped silently.
