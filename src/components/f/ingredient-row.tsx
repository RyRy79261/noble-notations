/**
 * F/Ingredient row and F/Ingredient callout — the checklist line and the
 * step chip.
 *
 * Read from `design/exports/foundations.html`, Plate II:
 *   F/Ingredient callout  section F.2, line 2039
 *   F/Ingredient row      section F.7, line 3169
 * Corroborated on `recipe-1280.html:1014` (16 rows, three of them ticked),
 * `recipe-360.html:524` (the same row, byte for byte — only the group label
 * above it drops from 9px to 8px), `recipe-1280-dark.html:1097` and
 * `ingredients-1280.html:1849`, where the chip's name is a recipe title
 * under the heading `AS CALLED FOR`.
 *
 * THE ROW HAS NO RULE AND NO GROUND. The rows sit flush — their `Rows`
 * container is `gap-0` — and the 8px of padding on each of them is the whole
 * separation. Four fixed columns carry the alignment instead: a 15px box, a
 * 24px reference, a 96px amount split 46/45, and then the name grows.
 *
 * THE TICKED STATE IS EXACTLY THREE SWAPS AND NOTHING ELSE. The box goes
 * `f-desk` → `f-accent`, the amount `f-ink` → `f-ink-3`, the name `f-ink` →
 * `f-ink-3`. The unit, the reference and the preparation are already
 * `f-ink-3` and do not move. There is NO strikethrough — `line-through` and
 * `text-decoration` appear nowhere in the eighteen exports — and no opacity
 * change; TOKEN-MAP.md §4.5 records that the design has no opacity at all.
 * The padding, the gap and the ground of the row are unchanged.
 *
 * THE CHIP IS THE ONLY FULLY BORDERED THING IN M4. `gap-0`, no radius, and
 * `overflow-hidden` so the wash on the amount half is clipped to the 1px
 * box. R-CMP-08 is met by ground, border, marker, face, size and case at
 * once: the badge is solid, the tag has no chrome, this one is boxed and
 * two-celled, and the shop chip carries a square. See the comparison in
 * `tag.tsx`.
 *
 * Server components in the sense that matters: no state, no effect and no
 * browser API of their own. `onTick` is a callback, so M5's client
 * checklist renders the row inside its own boundary and this file needs no
 * `"use client"` (R-CON-01).
 */

import Link from 'next/link';
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { FOCUS_RING } from './button';

/* ── The tick box ──────────────────────────────────────────────────────── */

/**
 * THE ONE DEPARTURE FROM THE DESIGN IN THIS FILE, and why it has to be one.
 *
 * The design draws the 15px box as a bare `f-desk` fill with no border of
 * any kind — all 181 `Box` elements in the eighteen exports carry the same
 * class string. `f-desk` on the `f-paper` page is 1.12:1, and WCAG 1.4.11
 * asks a user interface component for 3:1, so a low-vision reader cannot
 * find the control. TOKEN-MAP.md §7 measured this and called the fix "the
 * fix for M5": a 1px border in `f-ink-3`, which is 5.25:1 light and 5.60:1
 * dark and invents no colour. `input` is that token (TOKEN-MAP.md §5 item
 * 5), and it is already spent on F/Field.
 *
 * The design draws the fix itself, one component over: its own 13px tick-all
 * square is `bg-[ #FCFAF6 ] [ border:1px_solid_#79655F ]`
 * (`foundations.html:3413`, inside the `Tick all — three states` frame at
 * `:3398`). So this is the design's border moved down onto
 * the design's other box, not a colour this build made up. The two shapes
 * disagree inside the design file; that is the disagreement being resolved.
 *
 * `appearance-none`, `rounded-none`, `box-border` and `m-0` are not
 * decoration. Tailwind's preflight is OFF until M7 (BUILD-PLAN §3.1), so a
 * bare `<input type="checkbox">` still draws the user agent's own control,
 * and a border that is not inside the box would make the 15px square 17px.
 * `m-0` is the one that is easy to miss: the user agent gives a checkbox
 * `margin: 3px 3px 3px 4px`, and measured in Chromium it pushed the box four
 * pixels right and three down — off the column every other row aligns to.
 *
 * BOTH CONSTANTS ARE EXPORTED, and `f/list-row.tsx` imports them rather than
 * writing them again. The border above is a departure from the drawing; a
 * departure recorded in one file and copied by hand into another is exactly
 * the drift D-06 keeps a family in one file to prevent.
 */
export const TICK_BOX = cn(
  'box-border m-0 h-3.75 w-3.75 shrink-0',
  'appearance-none rounded-none border border-solid border-input',
);

/** `f-accent` when ticked, `f-desk` when not. The first of the three swaps. */
function tickGround(ticked: boolean): string {
  return ticked ? 'bg-accent' : 'bg-desk';
}

/*
 * The 44px tap target the old stylesheet asks for is not available here: the
 * design draws a 15px box in a row 31px tall, and a 44px label would set
 * every row 13px apart from its neighbours. 25px is, and it costs nothing —
 * the negative margin cancels the padding exactly, so the input's border box
 * lands where a bare 15px flex item would, and only the hit area grows.
 * `scripts/audit-ui.ts` reads `el.closest('label')` for a checkbox and
 * reports anything under 24×24 as a minor fault; this clears it.
 */
export const TICK_TARGET = '-m-1.25 inline-flex shrink-0 cursor-pointer p-1.25';

export type TickBoxProps = {
  ticked?: boolean;
  /** Present ⇒ a real checkbox. Absent ⇒ a decorative square. */
  onTick?: (ticked: boolean) => void;
  /** The accessible name. The row's own name, in the reader's words. */
  label?: string;
};

/**
 * The 15px box, in both of its shapes.
 *
 * With `onTick` it is a controlled `<input type="checkbox">` inside a label
 * that widens the hit area. Without it — a server-rendered page, or a
 * printed list — it is an `aria-hidden` square, because a checkbox with a
 * `checked` prop and no handler is a React warning and a control that lies.
 */
function TickBox({ ticked = false, onTick, label }: TickBoxProps) {
  if (!onTick) {
    return (
      <span aria-hidden="true" className={cn(TICK_BOX, tickGround(ticked))} />
    );
  }

  return (
    <label className={TICK_TARGET}>
      <input
        type="checkbox"
        checked={ticked}
        onChange={(event) => onTick(event.currentTarget.checked)}
        aria-label={label}
        className={cn(TICK_BOX, tickGround(ticked), FOCUS_RING)}
      />
    </label>
  );
}

/* ── F/Ingredient row ──────────────────────────────────────────────────── */

/*
 * The four fixed columns, in the design's own pixels: 15, 24, 96 (46 + 4 +
 * 45) and then the rest. `w-3.75` is 15px because `--spacing` is pinned to
 * 4px; see the note in `mark.tsx` on the fractional multiple.
 */
const ROW = 'flex w-full shrink-0 flex-row items-start gap-3 py-2';

/** 10px mono. Always rendered, even empty, or the amounts stop lining up. */
const REF = 'w-6 shrink-0 text-10 font-mono tabular-nums text-ink-3';

const AMOUNT = 'flex w-24 shrink-0 flex-row items-start gap-1';

/* R-SCR-12 and R-CON-06: the amount is Geist Mono with tabular figures, so
   a column of quantities lines up and a scaled value does not shuffle. */
const NUM = 'w-11.5 shrink-0 text-right text-13 font-mono tabular-nums';

const UNIT = 'w-11.25 shrink-0 text-13 font-mono text-ink-3';

const COL = 'flex flex-1 basis-0 flex-col items-start gap-1';

/*
 * `Name row` is a `gap-[ 8px ] items-center` row that holds exactly one child
 * in all 181 instances across the eighteen exports. It is a slot the design
 * provisions and never fills — the "(optional)" mark of §10.2.6 goes there,
 * and the word "optional" occurs zero times in the whole export set. M4 kept
 * the row and did not invent the mark; M5 is the first call site that has one
 * to put in it, so the slot is now a `mark` prop.
 *
 * IT IS A SIBLING OF THE LINK AND NOT A CHILD OF IT. Folding the mark into
 * `name` — the only route a caller had before the prop existed — put it
 * inside the `<Link>`, so a line's link was named "Kombu (optional)" while it
 * points at the Kombu ingredient page, which is not optional. "Optional" is a
 * property of this recipe line, not of the ingredient.
 */
const NAME_ROW = 'flex w-full flex-row items-center gap-2';

/* No `whitespace-nowrap`. The exports carry it on nearly every text node
   including whole sentences; it is an export artefact, and an ingredient
   name has to be free to wrap at 360 (R-STA-09). Same ruling as M3 made in
   `tag.tsx`. */
const NAME = 'text-14 font-sans';

/* 13px over 20px. The size and its leading go in ONE cn() argument, or
   tailwind-merge drops the leading with the next size it meets —
   TOKEN-MAP.md §4.3. */
const PREP = 'm-0 w-full text-13 leading-150 font-serif italic text-ink-3';

export type IngredientRowProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange'
> &
  TickBoxProps & {
    /** The 24px catalogue column, `01`, `02`. Optional (R-STA-05). */
    reference?: ReactNode;
    /** The quantity, already scaled and formatted by the caller. */
    amount?: ReactNode;
    /** The unit, drawn in the quiet ink beside the quantity. */
    unit?: ReactNode;
    name: ReactNode;
    /** R-SCR-13. Set only when the ingredient is in the ingredient list. */
    href?: string;
    /**
     * The `Name row` slot beside the name — §10.2.6's "(optional)" mark. It
     * sits OUTSIDE the link, because it describes the line and not the
     * ingredient the link points at.
     */
    mark?: ReactNode;
    /** The preparation, in serif italic under the name. */
    preparation?: ReactNode;
  };

/**
 * F/Ingredient row — a tick box, a reference, an amount and a name.
 *
 * R-SCR-13 is met by `href`: the caller sets it when the line resolves to a
 * row in the ingredient list and leaves it off when the line is only raw
 * text. The design gives the link NO affordance of its own — there is not
 * one `underline` in the eighteen exports — so it is drawn exactly like the
 * name beside it and only the focus ring is added, for R-ACC-05. That is
 * the same ruling M3 made on F/Tag. It is raised again in the M4 report:
 * WCAG 1.4.1 is not met by a link that is identical to the text around it.
 */
export function IngredientRow({
  reference,
  amount,
  unit,
  name,
  href,
  mark,
  preparation,
  ticked = false,
  onTick,
  label,
  className,
  ...props
}: IngredientRowProps) {
  /* Swaps two and three. The unit, the reference and the preparation are
     already `f-ink-3` and stay where they are. */
  const quiet = ticked ? 'text-ink-3' : 'text-ink';

  return (
    <div
      data-ticked={ticked ? 'true' : undefined}
      className={cn(ROW, className)}
      {...props}
    >
      <TickBox
        ticked={ticked}
        onTick={onTick}
        label={label ?? (typeof name === 'string' ? name : undefined)}
      />
      <span className={REF}>{reference}</span>{' '}
      {/* The 96px cell is drawn even when the line carries no quantity, so a
          line with no amount keeps its name in the same column as the rest
          (R-STA-05). */}
      <span className={AMOUNT}>
        <span className={cn(NUM, quiet)}>{amount}</span>{' '}
        <span className={UNIT}>{unit}</span>
      </span>{' '}
      <span className={COL}>
        <span className={NAME_ROW}>
          {href ? (
            <Link
              href={href}
              className={cn(NAME, quiet, 'no-underline', FOCUS_RING)}
            >
              {name}
            </Link>
          ) : (
            <span className={cn(NAME, quiet)}>{name}</span>
          )}
          {mark ? <> {mark}</> : null}
        </span>{' '}
        {/* The two `{' '}` above and the one below are real text nodes and
            not decoration. `NAME_ROW` and `COL` are both flex containers, so
            CSS Flexbox §4 drops a white-space-only run from the rendering and
            the drawing is unchanged — while `textContent` keeps the space. A
            flex gap alone read `Beef silversidecut into strips along the
            grain`, which is the fault class R-CMP-14 records and BUILD-PLAN
            §4.1 closed in four row components. This is the fifth. */}
        {preparation ? <p className={PREP}>{preparation}</p> : null}
      </span>
    </div>
  );
}

/* ── F/Ingredient callout ──────────────────────────────────────────────── */

/*
 * `border border-solid border-hair` and not the four-value form M3 uses in
 * `notice.tsx`: all four sides are 1px here, so `border` sets every width
 * and `border-solid` every style, and there is no side left holding the CSS
 * initial `medium`. The preflight is still off, so the style has to be
 * written; a lone `border` would draw nothing.
 *
 * `overflow-hidden` is load-bearing. It clips the wash on the amount cell to
 * the border box, which is what makes the seam between the two cells the
 * edge of the ground rather than a gap.
 */
const CALLOUT = cn(
  'inline-flex h-fit w-fit shrink-0 flex-row items-center',
  'overflow-hidden rounded-none border border-solid border-hair',
);

const CALLOUT_QTY = cn(
  'shrink-0 px-2.25 py-1',
  'bg-accent-wash text-11 font-mono tabular-nums whitespace-nowrap text-accent',
);

/*
 * `min-w-0` and NO `shrink-0`, unlike the amount cell beside it. The chip is
 * `w-fit` inside `overflow-hidden`, so at 360 a long name in a `shrink-0`
 * cell is not wrapped and not scrolled — it is cut off with no ellipsis and
 * no way to read the rest. Measured: `1.5 kg` plus a 45-character name gave a
 * 328px border box over a 367px scroll width, 39px of the name gone. The
 * amount keeps `shrink-0` and `whitespace-nowrap`, because it is short by
 * construction and a broken quantity is worse than a wrapped word.
 */
const CALLOUT_NAME = 'min-w-0 px-2.5 py-1 text-13 font-sans text-ink';

export type IngredientCalloutProps = Omit<
  HTMLAttributes<HTMLElement>,
  'prefix'
> & {
  /** The scaled amount and its unit, as one string: `162 g` (R-SCR-31). */
  amount?: ReactNode;
  name: ReactNode;
  /** R-SCR-32. Set only when the line resolves to an ingredient page. */
  href?: string;
};

/**
 * F/Ingredient callout — the step chip. Two cells inside one hairline box.
 *
 * R-CMP-14 — THE REAL SPACE, AND WHY IT IS A TEXT NODE. The design writes
 * `gap-0` between the amount cell and the name cell, so there is no flex gap
 * to be invisible; there is also no character. `textContent` would read
 * `162 gWorcestershire sauce`, a screen reader would say it, and a copied
 * chip would paste it. That fault was found and fixed once already, in
 * `step-ingredients.tsx`, and §9.3's own background note records it.
 *
 * The `{' '}` below is a real text node between two flex items. CSS Flexbox
 * §4 says a sequence of child text runs that contains only white space is
 * not rendered, so the drawing is unchanged to the pixel while the DOM, the
 * accessibility tree and the clipboard all carry the space.
 *
 * R-CMP-15 is the caller's: do not render a chip for a `uses` entry that
 * does not resolve to a line in this revision. The design supplies no
 * treatment for an unresolved chip — all 55 chips in the eighteen exports
 * are drawn identically, whether they point at an ingredient page, at a
 * recipe page or nowhere at all.
 */
export function IngredientCallout({
  amount,
  name,
  href,
  className,
  ...props
}: IngredientCalloutProps) {
  const body = (
    <>
      {amount === undefined || amount === null || amount === '' ? null : (
        <>
          <span className={CALLOUT_QTY}>{amount}</span>{' '}
        </>
      )}
      <span className={CALLOUT_NAME}>{name}</span>
    </>
  );

  if (!href) {
    return (
      <span className={cn(CALLOUT, className)} {...props}>
        {body}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(CALLOUT, 'no-underline', FOCUS_RING, className)}
      {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
    >
      {body}
    </Link>
  );
}
