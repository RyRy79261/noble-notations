/**
 * F/Recipe card, F/Index card and the grid that carries them.
 *
 * Read from `design/exports/foundations.html`, Plate II section F.8:
 *   F/Recipe card  line 3255
 *   F/Index card   line 3339
 * Corroborated on the screens: `home-recipes-1280.html:417` (the three-up
 * row on `/`), `classes-cuisines-1280.html:2632` (the recipe card on a
 * cuisine page) and `:3282` (the ruled index-card grid on `/cuisines`),
 * `dark-screens.html`, and `m360-core.html:343` and
 * `m360-batch-search-list.html` for the 360 forms.
 *
 * NEITHER CARD HAS A GROUND, A BORDER, A RADIUS OR ANY PADDING. TOKEN-MAP
 * §5 item 2 states the rule and F.8's own caption states the reason:
 * "Cards without borders — a change of type and a band of air does the
 * separating." A twelve-pixel column and a change of face is the whole
 * component. The old `.card` in `globals.css` — a filled, ruled, rounded,
 * padded box — is the thing this replaces.
 *
 * The two are not variants of one another. Five things differ, and the
 * table is worth keeping because a reviewer will check it:
 *
 *   |          | F/Recipe card                | F/Index card                |
 *   | column   | `gap-3` (12px)               | `gap-2` (8px)               |
 *   | lead     | F/Mark + a mono `Code`       | a bare accent `Kicker`      |
 *   | title    | 26/30, `tracking-title`      | 24/28, `tracking-title`     |
 *   | middle   | serif italic, then sans      | sans only                   |
 *   | trailing | up to three F/Tag            | one mono count              |
 *
 * R-CMP-07. The kind badge is F/Mark, imported and not rebuilt, so the four
 * recipe kinds read from the one map in `mark.tsx`. All three kinds the
 * design draws on a card — RECIPE, PREPARATION, RESEARCH — are the same
 * solid `f-accent` block; the word tells them apart, not a colour.
 *
 * WHAT THE DESIGN DOES NOT DRAW ON A CARD, and this file therefore does not
 * build:
 *
 *   - No revision badge. The revision is a segment of the mono `Code` run
 *     (`NN-04-02 · SIXTH REVISION`), never a second solid block beside the
 *     kind. `src/components/recipe-card.tsx` folds it in there.
 *   - No fourth term and no `+n` overflow chip. Twenty-six cards draw three
 *     terms, one draws two, seventeen draw none, and `+[0-9]` does not
 *     occur anywhere in the eighteen exports.
 *   - No truncation of any kind. Zero `line-clamp`, zero `text-overflow`,
 *     zero `truncate` in the export set, and `Summary` is `w-full` with
 *     free wrapping. See the note on the cut in
 *     `src/components/recipe-card.tsx`.
 *   - No image. `grep -c '<img'` over all eighteen exports is 0, as is
 *     `<svg>` and `background-image`. There is no image slot anywhere in
 *     this system. That is the design's answer to Q-03.
 *
 * Server components. They have no state and no browser API.
 */

import Link from 'next/link';
import {
  Children,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

import { FOCUS_RING } from './button';
import { Mark } from './mark';

/*
 * NO `whitespace-nowrap` ANYWHERE IN THIS FILE.
 *
 * The exports carry it on nearly every text node, whole sentences included;
 * `tag.tsx` already records it as a design-file artefact. Two of the runs
 * here would be short enough to keep it — `Code`, `Kicker` and `Meta` are
 * all mono micro-labels — but the design itself contradicts the artefact on
 * the one it matters for: at 360 `m360-batch-search-list.html` redraws
 * `Code` as `w-full text-[ 9px ]/[ 15px ]`, i.e. a run that WRAPS, and stacks
 * the badge above it. So `Code` must be free to wrap, and there is no
 * reason to treat its two siblings differently. R-STA-09.
 */

/** The card title's destination, drawn with no affordance at all — there is
 *  not one underline in the eighteen exports. Colour and `FOCUS_RING` carry
 *  it; the ring is M3's, from `button.tsx`. */
const CARD_LINK = cn('text-ink no-underline', FOCUS_RING);

/*
 * `m-0`, an explicit leading and an explicit tracking on every heading and
 * every paragraph are not decoration. Tailwind's preflight is OFF until M7
 * and `globals.css` still carries `h1, h2, h3, h4 { line-height: 1.25;
 * letter-spacing: -0.015em; margin: 0 0 0.5rem }` and `p { margin: 0 0 1rem
 * }`. Each of those has to be answered or the old rule draws it. Same trap
 * `section-label.tsx` records.
 *
 * Every size travels with its leading in ONE `cn()` argument. tailwind-merge
 * groups a leading with the font size, so a later size deletes an earlier
 * leading and the text falls back to the leading of the face rather than to
 * a leading on the scale — TOKEN-MAP §4.3.
 */
const CARD_TITLE = cn(
  'm-0 w-full',
  'text-26 leading-115 font-serif font-medium tracking-title text-ink',
);

const INDEX_TITLE = cn(
  'm-0 w-full',
  'text-24 leading-115 font-serif font-medium tracking-title text-ink',
);

const CARD_SUBTITLE = cn(
  'm-0 w-full',
  'text-15 leading-150 font-serif italic tracking-flat text-ink-2',
);

const CARD_BODY = cn(
  'm-0 w-full',
  'text-14 leading-170 font-sans tracking-flat text-ink-2',
);

/** The mono run beside the kind badge. `uppercase` belongs to the component
 *  and not to the data, the same rule `Mark` applies: the caller passes
 *  "Sixth revision" and the card draws SIXTH REVISION. */
const CARD_CODE = cn(
  'text-09 leading-normal font-mono tracking-label tabular-nums uppercase',
  'text-ink-3',
);

/** F/Index card's `Kicker`. The one accent micro-label on a card, and the
 *  only place `tracking-spine` appears in this file. */
const INDEX_KICKER = cn(
  'text-09 leading-normal font-mono tracking-spine uppercase text-accent',
);

/** F/Index card's `Meta`. `ONE RECIPE`, `FOUR RECIPES`. */
const INDEX_META = cn(
  'text-09 leading-normal font-mono tracking-label tabular-nums uppercase',
  'text-ink-3',
);

/**
 * R-STA-05 in one predicate. Almost every field on a card can be empty, and
 * an empty ROW must not be drawn: a `Tags` container with nothing in it
 * still spends 16 pixels of column gap. `[]` is truthy in JavaScript, so
 * `{terms ? … : null}` is not enough on its own.
 */
function absent(node: ReactNode): boolean {
  if (node === null || node === undefined || node === false) return true;
  if (node === '') return true;
  return Array.isArray(node) && node.length === 0;
}

/* ── F/Recipe card ─────────────────────────────────────────────────────── */

export type RecipeCardProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  /**
   * A key of `KIND_LABELS`, handed straight to F/Mark. R-CMP-07 is met by
   * that one map; this file does not carry a second one. Absent on a card
   * with no kind — `Mark` renders nothing rather than an empty block.
   */
  kind?: string;
  /**
   * The mono run beside the badge. The design draws it as one free string
   * with ` · ` separators (`NN-04-02 · SIXTH REVISION`, and a third segment
   * on `/cuisines/[slug]`), never as two or three fields.
   */
  code?: ReactNode;
  title: ReactNode;
  /** The title's destination. Without one the title is plain text. */
  href?: string;
  /** Serif italic. Absent on the design's own Pickled Jalapeños card. */
  subtitle?: ReactNode;
  /** Sans body. Not clamped — see the file header. */
  summary?: ReactNode;
  /** The `Tags` row: F/Tag children, drawn with no prefix. Three of them. */
  terms?: ReactNode;
  /** The heading level. A card under a section `h2` is an `h3`. */
  as?: ElementType;
};

/**
 * F/Recipe card — a twelve-pixel column of five optional parts.
 *
 * The root is `w-full` and not the design's `[ flex:1_1_0 ]`. The design draws
 * both: `flex:1 1 0` at 1280, where the card is a cell of a row, and
 * `w-full shrink-0` at 360, where it is not. Putting `flex-1` on the GRID
 * CELL rather than on the card keeps one card that works in either place,
 * and it is what `/cuisines` needs anyway — there the `flex:1 1 0` and the
 * cell's top rule belong to the grid cell and the card sits inside it.
 */
export function RecipeCard({
  kind,
  code,
  title,
  href,
  subtitle,
  summary,
  terms,
  as: Heading = 'h3',
  className,
  ...props
}: RecipeCardProps) {
  const hasTop = Boolean(kind) || !absent(code);

  return (
    <article
      className={cn(
        'flex h-fit w-full shrink-0 flex-col items-start gap-3',
        className,
      )}
      {...props}
    >
      {hasTop ? (
        /* The design draws a plain `flex-row` here. `flex-wrap` is this
           build's: at 360 the design stacks the badge above the code in a
           column, and a wrapping row is the same result at whichever width
           the two stop fitting, with one class instead of a variant.
           The axes are split because the design draws two gaps, not one:
           12px between the badge and the code on one line
           (`m360-core.html:347`) and 8px once the code takes a line of its
           own (`m360-batch-search-list.html:5191`, the `/search` card, where
           `Top` is a `flex-col gap-[ 8px ]`). */
        <div className="flex h-fit w-full shrink-0 flex-row flex-wrap items-center gap-x-3 gap-y-2">
          <Mark kind={kind} />
          {absent(code) ? null : <span className={CARD_CODE}>{code}</span>}
        </div>
      ) : null}

      <Heading className={CARD_TITLE}>
        {href ? (
          <Link href={href} className={CARD_LINK}>
            {title}
          </Link>
        ) : (
          title
        )}
      </Heading>

      {absent(subtitle) ? null : <p className={CARD_SUBTITLE}>{subtitle}</p>}
      {absent(summary) ? null : <p className={CARD_BODY}>{summary}</p>}

      {absent(terms) ? null : (
        /* 16px, `items-center`. `flex-wrap` again is this build's: three
           terms fit one 286px column in the drawing and the same three need
           somewhere to go at 360. Same reasoning as `TagHierarchy`. */
        <div className="flex h-fit w-full shrink-0 flex-row flex-wrap items-center gap-4">
          {terms}
        </div>
      )}
    </article>
  );
}

/* ── F/Index card ──────────────────────────────────────────────────────── */

export type IndexCardProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  /** The accent micro-label above the title. `CUISINE`, `TECHNIQUE`. */
  kicker?: ReactNode;
  title: ReactNode;
  href?: string;
  /** Sans body. The index card has no serif italic line. */
  description?: ReactNode;
  /** The mono count under the description. `ONE RECIPE`. */
  meta?: ReactNode;
  as?: ElementType;
};

/**
 * F/Index card — the card on `/cuisines`, and the shape a classification or
 * an ingredient index reaches for.
 *
 * On `/cuisines` the design puts each one in a grid cell that carries a 1px
 * top rule and 18px of air. That rule belongs to the CELL and not to the
 * card, so it lives on `CardGrid`'s `ruled` prop and not here.
 */
export function IndexCard({
  kicker,
  title,
  href,
  description,
  meta,
  as: Heading = 'h3',
  className,
  ...props
}: IndexCardProps) {
  return (
    <article
      className={cn(
        'flex h-fit w-full shrink-0 flex-col items-start gap-2',
        className,
      )}
      {...props}
    >
      {absent(kicker) ? null : <span className={INDEX_KICKER}>{kicker}</span>}

      <Heading className={INDEX_TITLE}>
        {href ? (
          <Link href={href} className={CARD_LINK}>
            {title}
          </Link>
        ) : (
          title
        )}
      </Heading>

      {absent(description) ? null : <p className={CARD_BODY}>{description}</p>}
      {absent(meta) ? null : <span className={INDEX_META}>{meta}</span>}
    </article>
  );
}

/* ── The grid ──────────────────────────────────────────────────────────── */

/*
 * C-06. The design draws this as explicit rows and not as a grid, and the
 * difference is visible: on `/recipes` the last row holds one card and that
 * card spans the WHOLE row. `grid-cols-2` would leave it at half width.
 *
 *   Centre    flex-col gap-[ 20px ]   the rows
 *   Row       flex-row gap-[ 40px ]   the cells, each `[ flex:1_1_0 ]`
 *
 * `/` and `/cuisines` draw three cells to a row and `/recipes` draws two,
 * because `/recipes` gives 130px of its width to a right rail. The screen
 * decides, so it is a prop; the cards themselves are column-agnostic.
 *
 * At 360 the design stacks the cards in a single column at `gap-[ 16px ]`
 * (`m360-core.html`, container `B`), which is what the sub-`shell:` classes
 * below draw. `--breakpoint-shell` is 1080px; `nav-drawer.tsx` says why the
 * variant has to be written out as a whole class name at every use.
 */

/** The `/cuisines` cell: a 1px `f-hair` top rule over 18px of air. One
 *  declaration for all four widths and an explicit style, because with the
 *  preflight off a lone `border-t` draws nothing — the same note is in
 *  `notice.tsx` and `section-label.tsx`. */
const CELL_RULE = cn(
  '[border-style:solid] [border-width:1px_0px_0px_0px] border-t-hair',
  'pt-4.5',
);

export type CardGridProps = HTMLAttributes<HTMLDivElement> & {
  /** Cells to a row at `shell:` and above. The design draws 3 and 2. */
  columns?: number;
  /** The `/cuisines` treatment: a rule and 18px of air on every cell, and
   *  32px between rows rather than 20px. Both are drawn. */
  ruled?: boolean;
  children?: ReactNode;
};

export function CardGrid({
  columns = 3,
  ruled = false,
  children,
  className,
  ...props
}: CardGridProps) {
  const cells = Children.toArray(children);
  if (cells.length === 0) return null;

  const perRow = Math.max(1, Math.floor(columns));
  const rows: ReactNode[][] = [];
  for (let i = 0; i < cells.length; i += perRow) {
    rows.push(cells.slice(i, i + perRow));
  }

  return (
    <div
      className={cn(
        'flex h-fit w-full shrink-0 flex-col items-start gap-4',
        ruled ? 'shell:gap-8' : 'shell:gap-5',
        className,
      )}
      {...props}
    >
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="flex h-fit w-full shrink-0 flex-col gap-4 shell:flex-row shell:items-start shell:gap-10"
        >
          {row.map((cell, cellIndex) => (
            <div
              key={cellIndex}
              className={cn(
                'flex h-fit w-full flex-col items-start shell:flex-1',
                ruled ? CELL_RULE : null,
              )}
            >
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
