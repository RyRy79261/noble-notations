/**
 * F/Stat and F/Measure — the display figure and the inline annotation.
 *
 * Read from `design/exports/foundations.html`, Plate II section F.7
 * "Ingredients, statistics, measures": `data-pencil-name="F/Stat"` at line
 * 3134 and `data-pencil-name="F/Measure"` at line 3151. The 360 size of
 * F/Stat is on the same plate, inside `F/Section 360 > Stats` at line 2566.
 *
 * They are not one component at two sizes. They differ on every axis:
 *
 *              F/Stat                      F/Measure
 *   Axis       column, label above         row, label before
 *   Gap        4px                         8px
 *   Label      9px mono, f-accent, 1.5px   8px mono, f-ink-3, 1.2px
 *   Value      15/16/19/26px, f-ink        11px, f-ink-2
 *   Count      139                         57
 *
 * F/Stat is the home ledger, the batch-log totals, the ingredient facts and
 * the recipe's "At a glance" panel. F/Measure is step metadata on the
 * method, card metadata in a list, and the provenance rows on `/archive`.
 *
 * THE LABEL COLOUR OF F/Stat IS INVARIANT. All 139 labels measured are
 * `f-accent` at 9px and 1.5px tracking, in both themes. It is not a tone.
 *
 * R-CON-06 and R-TON-02: both values are Geist Mono with `tabular-nums`, so
 * a column of figures lines up and a changing count does not shuffle.
 *
 * Server components.
 */

import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The four value sizes the design draws. `size` is a real prop, not a
 * convenience: `text-15` is 52 of the 139 instances and it is what EVERY 360
 * screen uses, so a single-size F/Stat would put M6 wrong on every phone
 * screen it builds.
 */
const STAT_SIZES = {
  /** 15px. Every 360 screen, and `F/Section 360 > Stats` on Plate II. */
  sm: 'text-15',
  /** 16px. The recipe's "At a glance" panel at 1280 only. */
  md: 'text-16',
  /** 19px. The standard 1280 statistic. 66 instances. */
  lg: 'text-19',
  /** 26px. The home-page ledger only. */
  xl: 'text-26',
} as const;

export type StatSize = keyof typeof STAT_SIZES;

export type StatProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  size?: StatSize;
  /**
   * The container flexes two ways in the design: `w-fit shrink-0` when the
   * row is packed to the left, and `flex:1 1 0` when the statistics share a
   * row evenly (`/classes`, `/ingredients`, `F/Section 360`).
   */
  grow?: boolean;
};

/** F/Stat — an accent micro-label over a mono figure. No ground, no rule. */
export function Stat({
  label,
  value,
  size = 'lg',
  grow = false,
  className,
  ...props
}: StatProps) {
  return (
    <div
      className={cn(
        'flex h-fit flex-col items-start gap-1',
        grow ? 'flex-1' : 'w-fit shrink-0',
        className,
      )}
      {...props}
    >
      {/* The design's nowrap declaration is not shipped on either run.
          `SCIENCE NOTES` and `35.28 kg` share a 360 row three at a time, and
          a label that cannot wrap pushes the page sideways (R-STA-09). */}
      <span className="text-09 font-mono tracking-spine uppercase text-accent">
        {label}
      </span>
      <span className={cn(STAT_SIZES[size], 'font-mono tabular-nums text-ink')}>
        {value}
      </span>
    </div>
  );
}

/* ── F/Measure ─────────────────────────────────────────────────────────── */

export type MeasureProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  /**
   * The 360 provenance form, drawn 4 times in
   * `m360-batch-search-list.html`: the label takes a fixed 82px column, the
   * value grows and wraps at 11px over 17px. Use it wherever the value is a
   * path or a sentence rather than a figure.
   */
  wrap?: boolean;
};

/**
 * F/Measure — an 8px label and an 11px value, eight pixels apart.
 *
 * 57 instances, one class string. `F/Note reference` shares this exact shape
 * and takes a 10px `f-accent` value instead; it is a different component and
 * it belongs to M4.
 */
export function Measure({
  label,
  value,
  wrap = false,
  className,
  ...props
}: MeasureProps) {
  return (
    <div
      className={cn(
        wrap
          ? 'flex h-fit w-full shrink-0 flex-row items-start gap-2'
          : 'inline-flex h-fit w-fit shrink-0 flex-row items-center gap-2',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'text-08 font-mono tracking-label uppercase text-ink-3',
          wrap ? 'w-20.5 shrink-0' : 'whitespace-nowrap',
        )}
      >
        {label}
      </span>
      {/* The wrapping form is the second and last place in M3 where the
          leading is not `normal`. Size and leading in ONE argument, or
          tailwind-merge drops the leading — TOKEN-MAP.md §4.3. */}
      <span
        className={cn(
          wrap ? 'flex-1 text-11 leading-150' : 'text-11 whitespace-nowrap',
          'font-mono tabular-nums text-ink-2',
        )}
      >
        {value}
      </span>
    </div>
  );
}
