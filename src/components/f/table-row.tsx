/**
 * F/Table row — the ingredient index row, and its column head.
 *
 * Read from `design/exports/foundations.html`, Plate II section F.8,
 * `data-pencil-name="F/Table row"` at line 3369. The head is not on the
 * plate; it is `data-pencil-name="Column head"` at `ingredients-1280.html:333`.
 * The stacked form is `m360-classes-ingredients.html:3473`. The identical
 * row carries the archive at `list-search-archive-1280.html:3719`, where the
 * alias column holds a file path and the count column holds a date.
 *
 * THE HIERARCHY IS TWO RULE COLOURS AND NOTHING ELSE. The head is 1px
 * `f-hair` and each body row is 1px `f-hair-2`. The head carries no ground —
 * the old stylesheet gave `thead th` a `--surface-2` fill and the design
 * does not.
 *
 * R-SCR-23 — HOW THE ALIAS IS MADE QUIETER. It is not smaller. The alias and
 * the name are BOTH 14px at 1280, and the quieting is three non-dimensional
 * moves at once: Geist becomes Newsreader, upright becomes italic, and
 * `f-ink` (15.31:1) becomes `f-ink-3` (5.25:1). The count is a fourth
 * register again — 12px mono, `f-ink-2`, right-aligned. Four cells, four
 * treatments, one row height.
 *
 * THE COLUMN LABELS ARE THE DESIGN'S, NOT §10.7'S. The specification says
 * "Ingredient, Also known as, Recipes"; the design draws four columns and
 * calls the second one `ALSO CALLED`. R-BLD-03 makes the design win.
 *
 * AT 360 THE ROW IS NOT A ROW. It folds: the reference, the name and the
 * count keep one line and the alias drops to a second, indented 32px. One
 * DOM serves both widths here — `flex-wrap` with a full-width alias below
 * the `shell:` breakpoint, `flex-nowrap` with `order` above it — so nothing
 * is unmounted and no horizontal scroller is needed (R-STA-08, R-STA-09).
 *
 * ARIA. These are `<div>`s with table roles, because the design's row is a
 * flex layout at 1280 and a two-line block at 360, and `display:flex` on a
 * `<tr>` is exactly the change that strips a real table of its semantics.
 * A `role="row"` with no `role="table"` above it is invalid ARIA, so the
 * container ships WITH the row rather than as a sentence in this comment:
 * `Table` and `TableGroup` are below, and a caller that reaches for
 * `TableRow` finds them in the same import. M6 wires `/ingredients` and
 * `/archive` through them; `filterable-groups.tsx` still emits a real
 * `<table>` for the rows it has today, and the two must not be nested —
 * either the whole group is div-roled or the whole group is a `<table>`.
 *
 * A dark note the designer still owns: `f-hair-2` is `#222629` in the dark
 * theme and NO dark screen draws it — there is no dark `/ingredients` and no
 * dark `/archive`, and every rule in `dark-screens.html` is `f-hair`.
 * `border-b-hair-2` below is the honest reading of the declared token.
 * TOKEN-MAP.md §8 parks it. See the M4 report.
 *
 * Server components.
 */

import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { FOCUS_RING } from './button';

/*
 * The rules. One declaration for all four widths and an explicit style: the
 * preflight is OFF until M7, so nothing sets a global `border-style` and a
 * lone `border-b` would draw nothing, while adding `border-solid` to fix
 * that would give the other three sides the CSS initial `medium` width. Same
 * note as `notice.tsx` and `section-label.tsx`.
 */
const HEAD_RULE =
  '[border-style:solid] [border-width:0px_0px_1px_0px] border-b-hair';

const ROW_RULE =
  '[border-style:solid] [border-width:0px_0px_1px_0px] border-b-hair-2';

/* The four columns, at both widths. 22/34, then the name, then 44/60. */
const REF_COL = 'w-5.5 shrink-0 shell:w-8.5';
const NAME_COL = 'flex-1 shell:w-65 shell:flex-none shell:shrink-0';
const ALIAS_COL = 'w-full pl-8 shell:w-auto shell:flex-1 shell:pl-0';
/*
 * The head's alias cell takes NO base column. It is `sr-only` below the
 * breakpoint, and `sr-only` carries its own `width: 1px` — Tailwind emits
 * `.w-full` after `.sr-only`, so a `w-full` on the same element would win
 * and leave an absolutely positioned, full-width header lying across the
 * first row. `cn()` cannot catch it: the two are different class groups.
 */
const ALIAS_HEAD_COL = 'shell:flex-1';
/* `shell:order-1` is what puts the count last at 1280 while the DOM keeps it
   on the first line at 360, where the alias wraps below it. */
const COUNT_COL = 'w-11 shrink-0 text-right shell:w-15 shell:order-1';

/* ── The column head ───────────────────────────────────────────────────── */

const HEAD_CELL = cn(
  'text-08 tracking-label shell:text-09 shell:tracking-spine',
  'font-mono uppercase text-ink-3',
);

export type TableHeadProps = HTMLAttributes<HTMLDivElement> & {
  /** The catalogue column. The design draws `NO.`; the case is the cell's. */
  reference?: ReactNode;
  name?: ReactNode;
  alias?: ReactNode;
  count?: ReactNode;
};

/**
 * F/Table row's column head — 9px mono capitals over a `f-hair` rule.
 *
 * At 360 the design merges two labels into one cell, `INGREDIENT · ALSO
 * CALLED`, because the alias has moved under the name. The merge is drawn
 * with an `aria-hidden` suffix and the alias header is kept in the
 * accessibility tree at `sr-only`, so the picture is the design's at both
 * widths and every row still has four cells to four headers.
 */
export function TableHead({
  reference = 'No.',
  name = 'Ingredient',
  alias = 'Also called',
  count = 'Recipes',
  className,
  ...props
}: TableHeadProps) {
  return (
    <div
      role="row"
      className={cn(
        'flex w-full shrink-0 flex-row items-center gap-3 pb-1.75',
        'shell:gap-5 shell:pb-2.25',
        HEAD_RULE,
        className,
      )}
      {...props}
    >
      <span role="columnheader" className={cn(HEAD_CELL, REF_COL)}>
        {reference}
      </span>{' '}
      <span role="columnheader" className={cn(HEAD_CELL, NAME_COL)}>
        {name}
        <span aria-hidden="true" className="shell:hidden">
          {' · '}
          {alias}
        </span>
      </span>{' '}
      <span role="columnheader" className={cn(HEAD_CELL, COUNT_COL)}>
        {count}
      </span>{' '}
      <span
        role="columnheader"
        className={cn(HEAD_CELL, 'sr-only shell:not-sr-only', ALIAS_HEAD_COL)}
      >
        {alias}
      </span>
    </div>
  );
}

/* ── The body row ──────────────────────────────────────────────────────── */

const REF_CELL = cn(
  'text-09 shell:text-10',
  'font-mono tabular-nums text-ink-3',
);

const NAME_CELL = 'text-14 font-sans text-ink';

/** R-SCR-23. Serif, italic and `f-ink-3` — the same 14px as the name. */
const ALIAS_CELL = cn('text-12 shell:text-14', 'font-serif italic text-ink-3');

/**
 * The archive draws the same column in 12px Geist Mono rather than serif
 * italic, because it holds a file path and not a gloss
 * (`list-search-archive-1280.html:3719`). One cell, two voices.
 */
const PATH_CELL = 'text-12 font-mono text-ink-3';

/* R-CON-06: a count is a number, so it takes the mono face and tabular
   figures whatever else is in the column. */
const COUNT_CELL = 'text-12 font-mono tabular-nums text-ink-2';

/** R-STA-05. The design draws an em dash in an empty alias cell, not a
 *  blank one — `ingredients-1280.html`, row 12, "Ground beef". */
const NO_ALIAS = '—';

export type TableRowProps = HTMLAttributes<HTMLDivElement> & {
  reference?: ReactNode;
  name: ReactNode;
  /** The detail page. The design gives the link no affordance of its own. */
  href?: string;
  /** The gloss, or the file path when `aliasKind` is `path`. */
  alias?: ReactNode;
  aliasKind?: 'alias' | 'path';
  count?: ReactNode;
};

/** F/Table row — four cells, four registers, one row height. */
export function TableRow({
  reference,
  name,
  href,
  alias,
  aliasKind = 'alias',
  count,
  className,
  ...props
}: TableRowProps) {
  const empty = alias === undefined || alias === null || alias === '';

  return (
    <div
      role="row"
      className={cn(
        'flex w-full shrink-0 flex-row flex-wrap items-center',
        'gap-x-3 gap-y-1 py-2.25',
        'shell:flex-nowrap shell:gap-x-5 shell:py-2.75',
        ROW_RULE,
        className,
      )}
      {...props}
    >
      {/* R-CMP-14's construct. A flex gap is invisible to `textContent`, so
          without these the row reads "01Coriander4cilantro" to a screen
          reader and to a copy-paste. A whitespace-only text run is not
          rendered as a flex item (CSS Flexbox §4), so the drawing does not
          move — the same argument F/Ingredient callout already makes. */}
      <span role="cell" className={cn(REF_CELL, REF_COL)}>
        {reference}
      </span>{' '}
      <span role="cell" className={cn(NAME_CELL, NAME_COL)}>
        {href ? (
          /* The colour has to be on the anchor. `globals.css` is still
             live until M7 and carries `a { color: var(--accent) }`, and a
             colour specified on the element beats one inherited from the
             cell around it. */
          <Link href={href} className={cn('text-ink no-underline', FOCUS_RING)}>
            {name}
          </Link>
        ) : (
          name
        )}
      </span>{' '}
      {/* The count comes BEFORE the alias in the DOM, and `shell:order-1`
          puts it back on the right at 1280. At 360 the row wraps, and the
          alias is the full-width item that has to fall to the second line:
          with the alias written first it would take the count down with it
          and the row would fold into three lines rather than two. */}
      <span role="cell" className={cn(COUNT_CELL, COUNT_COL)}>
        {count}
      </span>{' '}
      <span
        role="cell"
        className={cn(aliasKind === 'path' ? PATH_CELL : ALIAS_CELL, ALIAS_COL)}
      >
        {empty ? NO_ALIAS : alias}
      </span>
    </div>
  );
}

/* ── The container the roles need ──────────────────────────────────────── */

export type TableProps = HTMLAttributes<HTMLDivElement> & {
  /** Required. `role="table"` with no accessible name is a table nobody can
   *  find in a rotor. The design's own head names it: INGREDIENT INDEX. */
  label: string;
};

/**
 * `role="table"` around `TableHead` and `TableGroup`.
 *
 * It exists so the roles below it cannot be used without it. The design draws
 * no frame at all — a table in this system is four hairlines under four rows
 * and nothing around the outside — so this element carries geometry only:
 * the column that holds the rows, and R-STA-08's own scroller.
 */
export function Table({ label, className, ...props }: TableProps) {
  return (
    <div
      role="table"
      aria-label={label}
      className={cn('flex w-full flex-col items-start gap-0', className)}
      {...props}
    />
  );
}

/** `role="rowgroup"`. One for the head, one for the body — the ARIA shape a
 *  `<thead>`/`<tbody>` pair has, without the `display:flex` that would strip
 *  a real one of its semantics. */
export function TableGroup({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="rowgroup"
      className={cn('flex w-full flex-col items-start gap-0', className)}
      {...props}
    />
  );
}
