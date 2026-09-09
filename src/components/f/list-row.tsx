/**
 * F/List row, F/List mark and the tick-all bar — the shopping list.
 *
 * Read from `design/exports/foundations.html`, Plate II:
 *   F/List mark             section F.2, line 2066
 *   Tick all — three states section F.8, line 3398
 *   F/List row              section F.8, line 3465
 * Corroborated on `list-search-archive-1280.html:488` (the bar) and `:524`
 * (27 rows, 12 of them carrying the kept-apart amount), on the same 27 rows
 * in `dark-screens.html`, and on `m360-batch-search-list.html:880`, which
 * draws the one "this chip goes nowhere" state in the whole export set.
 *
 * F/List row IS NOT F/Ingredient row, and it differs in exactly four ways:
 * 10px of vertical padding rather than 8, no reference column, a 100px
 * amount that is a COLUMN rather than a row, and a `Col` of three parts
 * rather than two. The 15px box, the 14px name and the 12px gap are shared,
 * which is why the ticked treatment below is taken from the other file and
 * the tick box itself is IMPORTED from it: the design draws no ticked row on
 * `/list` at any width in either theme. See the note on `ListRow`.
 *
 * IT ALSO HAS TWO DRAWN FORMS, WHERE F/INGREDIENT ROW HAS ONE. F/Ingredient
 * row is byte-identical at 360 and 1280 (`recipe-360.html:524` against
 * `foundations.html:3169`); this one is not, and it is the design's own
 * `/list` at 360 (`m360-batch-search-list.html:5726`, under
 * `/list — Shopping list, 360` at `:5306`) that differs in five values:
 *
 *   value      360                        1280
 *   padding    11px                       10px
 *   rule       1px `f-hair-2` beneath     none at all
 *   Amount     89px, Num 42, Unit 42      100px, Num 52, Unit 43
 *   Unit       12px                       13px
 *   Sources    items-start                items-center
 *   Original   12px over 18px             13px over 20px
 *
 * The narrow form is the default and `shell:` (1080px, TOKEN-MAP §8.2) opens
 * it out, exactly as `table-row.tsx`, `citation.tsx` and `mechanism.tsx` do.
 * THE ROW IS RULED AT 360 AND FLUSH AT 1280 — the separation at the wide
 * width is the padding alone, and only there.
 *
 * THE ROW HAS FOUR REGISTERS AND ONE HEIGHT: a 13px mono amount, a 10px
 * `f-caution` overflow, a 14px sans name, and a serif italic quotation of
 * what each recipe actually asked for.
 *
 * Server components: no state, no effect, no browser API. M6's shopping
 * checklist is the client boundary and passes `onTick` and `onToggle` in.
 */

import Link from 'next/link';
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { Fragment } from 'react';

import { cn } from '@/lib/utils';

import { FOCUS_RING } from './button';
import { TICK_BOX, TICK_TARGET } from './ingredient-row';
import { MarkQuiet } from './mark';

/* ── F/List mark ───────────────────────────────────────────────────────── */

/*
 * One shape, three drawn forms, and the form is a padding and a type size —
 * not a second component.
 *
 *   source   102 uses  `p-[ 3px_8px ]`          11.5px  a chip on a list row
 *   control   75 uses  `p-[ 5px_8px_5px_10px ]` 13px    the DRAWN FROM bar
 *   control    6 uses  the same                 13px    the 360 batch source
 *
 * `text-11-5` is the provisional 11.5px token of TOKEN-MAP.md §8, named for
 * this chip and its 69 uses. The 360 drawing of the same chip is 11px, which
 * is on the real scale, so the pair below is written `text-11
 * shell:text-11-5` — it draws the design at both widths and it is the one
 * cheap way to retire a provisional token if the designer would rather.
 *
 * The 8px accent square is the only glyph any of the four marks in R-CMP-08
 * carries. Do not collapse this with the `/classes` tag pill, which is the
 * same square at `p-[ 4px_9px_4px_10px ]` with a 13px name: that one is F/Tag
 * given a ground on one screen, and the two are kept apart on purpose.
 */
const LIST_MARK_FORMS = {
  /** On an F/List row, under the name. 11px at 360, 11.5px at 1280. */
  source: 'px-2 py-0.75 text-11 shell:text-11-5',
  /** The removable chip in a control bar, and the 360 batch source chip. */
  control: 'py-1.25 pr-2 pl-2.5 text-13',
} as const;

export type ListMarkForm = keyof typeof LIST_MARK_FORMS;

const LIST_MARK_BASE = cn(
  'inline-flex h-fit w-fit shrink-0 flex-row items-center gap-2',
  'rounded-none bg-desk',
);

const LIST_MARK_SQUARE = 'h-2 w-2 shrink-0';

/*
 * WCAG 2.5.8 asks an interactive target for 24×24, and `scripts/audit-ui.ts`
 * reports anything smaller as a minor fault. The source chip as drawn is
 * 21px tall and the control chip 23px. `min-h-6` costs three pixels and one
 * pixel respectively, and it is applied ONLY when the chip is interactive —
 * a chip that is neither a link nor removable is drawn exactly as designed.
 */
const LIST_MARK_TARGET = 'min-h-6';

export type ListMarkProps = HTMLAttributes<HTMLElement> & {
  name: ReactNode;
  /** R-SCR-21. The source recipe's page. */
  href?: string;
  form?: ListMarkForm;
  /**
   * The one "no destination" state the design draws
   * (`m360-batch-search-list.html:880`): the square drops to `f-hair` and
   * the name to `f-ink-3`. It is drawn on the batch source chip of a run
   * that names no recipe, and nowhere else.
   */
  muted?: boolean;
  /** The × control. Present ⇒ the chip is form B, the removable one. */
  onRemove?: () => void;
  /** The accessible name of the × control. Say what is being removed. */
  removeLabel?: string;
};

/** F/List mark — an 8px accent square, a name, and an optional × . */
export function ListMark({
  name,
  href,
  form = 'source',
  muted = false,
  onRemove,
  removeLabel,
  className,
  ...props
}: ListMarkProps) {
  const square = (
    <span
      aria-hidden="true"
      className={cn(LIST_MARK_SQUARE, muted ? 'bg-hair' : 'bg-accent')}
    />
  );
  const text = cn('font-sans', muted ? 'text-ink-3' : 'text-ink');
  const shell = cn(LIST_MARK_BASE, LIST_MARK_FORMS[form]);

  /* The whole chip is the link when nothing else in it is interactive: a
     bigger target, and one focus stop rather than two. A removable chip
     cannot be, because a <button> inside an <a> is not valid HTML. */
  if (href && !onRemove) {
    return (
      <Link
        href={href}
        className={cn(
          shell,
          LIST_MARK_TARGET,
          'no-underline',
          FOCUS_RING,
          className,
        )}
        {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {square}
        <span className={text}>{name}</span>
      </Link>
    );
  }

  return (
    <span
      className={cn(shell, onRemove ? LIST_MARK_TARGET : null, className)}
      {...props}
    >
      {square}
      {href ? (
        <Link href={href} className={cn(text, 'no-underline', FOCUS_RING)}>
          {name}
        </Link>
      ) : (
        <span className={text}>{name}</span>
      )}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className={cn(
            /* A bare <button> carries the user agent's border, ground,
               radius and font. Every reset here was load-bearing while the
               preflight was off, up to M7; the preflight answers all of
               them since, and they stay as the stated values — see the
               longer note in `f/button.tsx`. */
            'inline-flex shrink-0 cursor-pointer appearance-none',
            'rounded-none border-0 bg-transparent p-0',
            'text-13 font-mono text-ink-3',
            FOCUS_RING,
          )}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

/* ── F/List row ────────────────────────────────────────────────────────── */

/*
 * 11px of padding and a quiet rule at 360; 10px and no rule at 1280. The
 * width is written as a four-value `border-width` at BOTH widths rather than
 * a `shell:border-b-0`, so the two are the same declaration and the variant
 * is what decides. The style is written out because that is the form the
 * export draws; it was forced while the preflight was off, up to M7 — same
 * note as `table-row.tsx` and `notice.tsx`.
 */
const ROW = cn(
  'flex w-full shrink-0 flex-row items-start gap-3 py-2.75',
  '[border-style:solid] [border-width:0px_0px_1px_0px] border-b-hair-2',
  'shell:py-2.5 shell:[border-width:0px_0px_0px_0px]',
);

/* 89px at 360 and 100px at 1280, as a column: the kept-apart amount sits
   under the main one. */
const AMOUNT = 'flex w-22.25 shrink-0 flex-col items-start gap-1 shell:w-25';

const AMOUNT_MAIN = 'flex w-full flex-row items-start gap-1';

/* R-CON-06 and R-TON-02: mono with tabular figures, so a column of
   quantities lines up and a changing total does not shuffle. */
const NUM =
  'w-10.5 shrink-0 text-right text-13 font-mono tabular-nums shell:w-13';

const UNIT =
  'w-10.5 shrink-0 text-12 font-mono text-ink-3 shell:w-10.75 shell:text-13';

/*
 * R-SCR-19's "kept apart" line, and the only use of `f-caution` in M4's
 * surface: `+ 10 heads` under `2 cloves`, right-aligned across the whole
 * 100px column. 12 rows draw it.
 */
const EXTRA = 'w-full text-right text-10 font-mono tabular-nums text-caution';

const COL = 'flex flex-1 basis-0 flex-col items-start gap-1';

const NAME_ROW = 'flex w-full flex-row items-center gap-2';

const NAME = 'text-14 font-sans';

const SOURCES =
  'flex w-full flex-row flex-wrap items-start gap-2 shell:items-center';

/* 12px over 18px at 360 and 13px over 20px at 1280 — both `leading-150`. The
   size and its leading go in ONE cn() argument, and the `shell:` size cannot
   strip an unprefixed leading because Tailwind v4 routes it through
   `--tw-leading`. TOKEN-MAP.md §4.3. */
const ORIGINAL = cn(
  'm-0 w-full text-12 leading-150 shell:text-13',
  'font-serif italic text-ink-3',
);

/**
 * R-SCR-20. The design never draws it: the notice above the aisles says the
 * amount reads "some" and no row on any `/list` export at any width shows
 * one. The word goes in the `Num` slot in the quiet ink, because it is not a
 * measurement and it must not read as one, and the unit is dropped — there
 * is no unit to qualify a quantity nobody recorded. Flagged in the M4
 * report; it is the design's own word and this build's placement.
 */
const UNQUANTIFIED = 'some';

export type ListSource = {
  name: string;
  /** R-SCR-21. The recipe page this line came from. */
  href?: string;
};

export type ListRowProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & {
  /** The summed quantity. Absent ⇒ the row reads "some" (R-SCR-20). */
  amount?: ReactNode;
  unit?: ReactNode;
  /** R-SCR-19. The amount that would not convert, e.g. `+ 10 heads`. */
  extra?: ReactNode;
  name: ReactNode;
  href?: string;
  /** R-SCR-21. One chip per recipe that put this on the list. */
  sources?: ListSource[];
  /** R-SCR-21. What each source recipe actually asked for, verbatim. */
  originals?: ReactNode[];
  ticked?: boolean;
  onTick?: (ticked: boolean) => void;
  /** The accessible name of the tick box. Defaults to the row's name. */
  label?: string;
  /**
   * §10.6's OPTIONAL badge — "each row shows: a tick box, the combined
   * amount, the name, an OPTIONAL 'optional' badge and the source recipes".
   *
   * The design draws no such badge: `optional` appears nowhere in
   * `list-search-archive-1280.html`, `m360-batch-search-list.html` or
   * `foundations.html`, because no row on any `/list` frame is optional.
   * The specification names it, the seed has one (Kombu on demi-glace), and
   * without it an optional line reads as required — so it is drawn in a
   * register the design already owns rather than invented: `F/Mark quiet`
   * in its `faint` tone, in the name row, beside the name it qualifies.
   */
  optional?: boolean;
};

/**
 * F/List row — a tick box, a combined amount, a name and its sources.
 *
 * THE TICKED STATE IS BORROWED, AND KNOWINGLY. Every `Box` on every `/list`
 * export, at 1280 and at 360, light and dark, is `f-desk`: the design draws
 * no ticked row here at all. The three swaps come from F/Ingredient row,
 * which draws the same 15px box beside the same 14px name and is consistent
 * about the pairing everywhere it does draw it. See the M4 report.
 */
export function ListRow({
  amount,
  unit,
  extra,
  name,
  href,
  sources = [],
  originals = [],
  ticked = false,
  onTick,
  label,
  optional = false,
  className,
  ...props
}: ListRowProps) {
  const unquantified = amount === undefined || amount === null || amount === '';
  const quiet = ticked ? 'text-ink-3' : 'text-ink';

  return (
    <div
      data-ticked={ticked ? 'true' : undefined}
      className={cn(ROW, className)}
      {...props}
    >
      {onTick ? (
        <label className={TICK_TARGET}>
          <input
            type="checkbox"
            checked={ticked}
            onChange={(event) => onTick(event.currentTarget.checked)}
            aria-label={label ?? (typeof name === 'string' ? name : undefined)}
            className={cn(
              TICK_BOX,
              ticked ? 'bg-accent' : 'bg-desk',
              FOCUS_RING,
            )}
          />
        </label>
      ) : (
        <span
          aria-hidden="true"
          className={cn(TICK_BOX, ticked ? 'bg-accent' : 'bg-desk')}
        />
      )}
      <span className={AMOUNT}>
        <span className={AMOUNT_MAIN}>
          <span className={cn(NUM, unquantified ? 'text-ink-3' : quiet)}>
            {unquantified ? UNQUANTIFIED : amount}
          </span>{' '}
          <span className={UNIT}>{unquantified ? null : unit}</span>
        </span>
        {extra ? ' ' : null}
        {extra ? <span className={EXTRA}>{extra}</span> : null}
      </span>{' '}
      {/* R-CMP-14's construct: a flex gap is invisible to `textContent`, so
          without this the row reads "1.8kg+ 10 headsGarlic" to a screen
          reader and to a copy-paste. A whitespace-only text run is not
          rendered as a flex item (CSS Flexbox §4), so nothing moves. The same
          space sits between the quantity and its unit above. */}
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
          {/* R-CMP-14 again: the flex gap is invisible to `textContent`, so
              the badge needs a real space before it or the row reads
              "Komburoptional". */}
          {optional ? ' ' : null}
          {optional ? <MarkQuiet tone="faint">Optional</MarkQuiet> : null}
        </span>

        {sources.length > 0 ? (
          <span className={SOURCES}>
            {sources.map((source, index) => (
              <Fragment key={`${source.href ?? source.name}-${index}`}>
                {index > 0 ? ' ' : null}
                <ListMark name={source.name} href={source.href} form="source" />
              </Fragment>
            ))}
          </span>
        ) : null}

        {originals.length > 0 ? (
          /* The design joins two quotations with a middle dot inside one
             run. Each one is its own element here and the separator is
             `aria-hidden`, so the pixels are the export's and the reading is
             two values rather than one sentence — the same treatment M3 gave
             the breadcrumb. */
          <p className={ORIGINAL}>
            {originals.map((original, index) => (
              <Fragment key={index}>
                {index > 0 ? <span aria-hidden="true">{' · '}</span> : null}
                <span>“{original}”</span>
              </Fragment>
            ))}
          </p>
        ) : null}
      </span>
    </div>
  );
}

/* ── The tick-all bar ──────────────────────────────────────────────────── */

/*
 * The 13px square, and the three states Plate II draws beside its own
 * caption: "THE MIDDLE STATE IS INDETERMINATE · A READOUT GIVES N OF M IN
 * THE TROLLEY".
 *
 * Note that this square is SMALLER than the 15px row box and that, unlike
 * the row box, the design gives it a border of its own. That border is where
 * `ingredient-row.tsx` and the row box above got theirs.
 *
 * The indeterminate state is a 4px accent ring around a 5px paper core, not
 * a dash and not a half fill.
 */
const TICK_ALL_SQUARE = {
  none: 'bg-paper border border-solid border-input',
  some: 'bg-paper border-4 border-solid border-accent',
  all: 'bg-accent',
} as const;

export type TickAllState = keyof typeof TICK_ALL_SQUARE;

export type TickAllProps = Omit<HTMLAttributes<HTMLDivElement>, 'onToggle'> & {
  state?: TickAllState;
  /** The control's own words. `TICK EVERYTHING` on `/list`. */
  label?: ReactNode;
  /** R-CMP-12's readout. `9 OF 24 IN THE TROLLEY`. */
  readout?: ReactNode;
  onToggle?: () => void;
};

/**
 * The tick-all bar — the only filled bar in M4.
 *
 * R-CMP-12 IS MET BY `aria-checked="mixed"` ON A BUTTON, not by the DOM
 * `indeterminate` property. `indeterminate` is a property and not an
 * attribute: React cannot set it declaratively, so a real checkbox would
 * need a ref and an effect, and this file would become a client component
 * for a piece of drawing. `role="checkbox"` on a `<button>` carries the same
 * three states, needs no browser API, and takes its accessible name from the
 * label it already draws.
 *
 * R-ACC-06 IS THE CALLER'S. The readout is a plain span here on purpose:
 * `src/lib/announce.ts` keeps ONE polite live region for the whole document,
 * outside the shell, because Radix's `hideOthers` exempts a live region and
 * every ancestor of it — a second `aria-live` inside `<main>` would hold the
 * shell in the accessibility tree behind the open 360 drawer. M6 calls
 * `useAnnounce` with the sentence.
 */
export function TickAll({
  state = 'none',
  label,
  readout,
  onToggle,
  className,
  ...props
}: TickAllProps) {
  const square = (
    <span
      aria-hidden="true"
      className={cn(
        'box-border h-3.25 w-3.25 shrink-0 rounded-none',
        TICK_ALL_SQUARE[state],
      )}
    />
  );

  /* `p-[ 5px_8px_5px_10px ]`, and `min-h-6` for the one pixel that takes the
     drawn 23px control over WCAG 2.5.8's 24. */
  const chip = cn(
    'inline-flex h-fit w-fit min-h-6 shrink-0 flex-row items-center gap-2',
    'bg-desk py-1.25 pr-2 pl-2.5',
    'text-10 font-mono tracking-label uppercase text-ink-2',
  );

  return (
    <div
      className={cn(
        'flex w-full shrink-0 flex-row items-center justify-between',
        'bg-desk px-4 py-3.5',
        className,
      )}
      {...props}
    >
      {onToggle ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={state === 'some' ? 'mixed' : state === 'all'}
          onClick={onToggle}
          className={cn(
            chip,
            'cursor-pointer appearance-none rounded-none border-0',
            FOCUS_RING,
          )}
        >
          {square}
          {label}
        </button>
      ) : (
        <span className={chip}>
          {square}
          {label}
        </span>
      )}

      {readout ? (
        <span className="text-10 font-mono tracking-label tabular-nums uppercase text-ink-3">
          {readout}
        </span>
      ) : null}
    </div>
  );
}
