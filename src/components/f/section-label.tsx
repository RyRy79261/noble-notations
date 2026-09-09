/**
 * F/Section label and F/Section 360 — the two section headings.
 *
 * Read from `design/exports/foundations.html`, Plate II:
 *   F/Section label  section F.6, line 2795
 *   F/Section 360    section F.4's body, line 2529
 * The 1280 form is corroborated 61 times across the exports, for instance as
 * the shopping aisles in `list-search-archive-1280.html:533`, where the
 * ordinal reads `I` and the meta reads `THREE INGREDIENTS · ONE COUNTER`.
 *
 * The 1280 form is a roman ordinal in a fixed 40px column, a 26px Newsreader
 * title at weight 500, a hairline under the whole row, and a mono meta run
 * pushed to the right edge. The design writes that right edge as a `Gap`
 * child with `flex:1 1 0`; `ml-auto` on the meta is the same result with one
 * element fewer.
 *
 * The 360 form is a different component and not a variant: the title becomes
 * a 9px accent micro-label, the rule tightens from 8px to 7px, and the whole
 * block gains a body with a 14px gap — which is what the provisional
 * `--spacing-section-360` token is named for.
 *
 * `m-0`, `tracking-flat` and an explicit leading on the title are not
 * decoration. Tailwind's preflight is OFF until M7, and `globals.css` still
 * carries `h1, h2, h3, h4 { line-height: 1.25; letter-spacing: -0.015em;
 * margin: 0 0 0.5rem }`. Each of those three has to be answered or the old
 * rule draws it.
 *
 * Server components.
 */

import type { ElementType, HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/* The hairline. One declaration for all four widths, and an explicit style:
   with the preflight off nothing sets a global `border-style`, so a lone
   `border-b` would draw nothing. See the same note in `notice.tsx`. */
const SECTION_RULE =
  '[border-style:solid] [border-width:0px_0px_1px_0px] border-b-hair';

export type SectionLabelProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'title'
> & {
  /** The roman ordinal in the 40px column. `I`, `II`, `III`. Optional. */
  ordinal?: ReactNode;
  title: ReactNode;
  /** The mono run at the right edge. `SIX REVISIONS`. Optional. */
  meta?: ReactNode;
  /** The heading level. A section heading is an `h2` unless it is nested. */
  as?: ElementType;
};

/** F/Section label — the 1280 section heading. */
export function SectionLabel({
  ordinal,
  title,
  meta,
  as: Heading = 'h2',
  className,
  ...props
}: SectionLabelProps) {
  return (
    <div
      className={cn(
        'flex h-fit w-full shrink-0 flex-row items-center gap-4',
        'pb-2',
        SECTION_RULE,
        className,
      )}
      {...props}
    >
      {ordinal ? (
        /* 40px is `f-gap-40`, which `--spacing` puts on Tailwind's own
           numeric scale, so `w-10` is the token and not an escape. */
        <span className="w-10 shrink-0 text-10 font-mono tracking-spine text-accent">
          {ordinal}
        </span>
      ) : null}
      <Heading className="m-0 text-26 leading-normal font-serif font-medium tracking-flat text-ink">
        {title}
      </Heading>
      {meta ? (
        <span className="ml-auto text-09 font-mono tracking-spine uppercase text-ink-3">
          {meta}
        </span>
      ) : null}
    </div>
  );
}

/* ── F/Section 360 ─────────────────────────────────────────────────────── */

export type Section360Props = HTMLAttributes<HTMLDivElement> & {
  /** The accent micro-label. Drawn as `AT A GLANCE` on the plate. */
  label: ReactNode;
  /** The quiet run at the right edge. Optional; the plate draws none. */
  meta?: ReactNode;
  /** The heading level. A section heading is an `h2` unless it is nested. */
  as?: ElementType;
  children?: ReactNode;
};

/**
 * F/Section 360 — the phone section: a ruled micro-label over a body.
 *
 * `gap-section-360` is the provisional 14px token, and this component is the
 * one it is named for (TOKEN-MAP.md §8). The 7px bottom padding is the other
 * off-scale value here; `--spacing-list-360` also holds 7px but it is named
 * for the 360 list control, and a misleading name is worse than an arbitrary
 * value.
 *
 * THE LABEL IS A HEADING, the same `as` prop F/Section label carries. It was
 * a `<span>` inside an unnamed `<section>`, which made the two most-read
 * blocks of the recipe screen — AT A GLANCE and INGREDIENTS — reachable
 * neither by heading navigation nor as a region, while every other band on
 * the same screen kept its `<h2>`. The three overrides below are what a real
 * heading costs with the preflight off: `globals.css:125` sets `h1..h4` to
 * `line-height: 1.25; letter-spacing: -0.015em; margin: 0 0 0.5rem`, `h2` to
 * `font-size: 1.35rem`, and the user agent draws it bold. Every one of them
 * is answered here, so the drawn label is unchanged to the pixel.
 */
export function Section360({
  label,
  meta,
  as: Heading = 'h2',
  children,
  className,
  ...props
}: Section360Props) {
  return (
    <section
      className={cn(
        'flex h-fit w-full shrink-0 flex-col items-start gap-section-360',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'flex h-fit w-full shrink-0 flex-row items-center gap-3',
          'pb-1.75',
          SECTION_RULE,
        )}
      >
        <Heading className="m-0 text-09 leading-normal font-mono font-normal tracking-spine uppercase text-accent">
          {label}
        </Heading>
        {/* `tracking-label`, 1.2px, and not the 1.5px of the label beside
            it. The design draws both section metas at 1.2px — the `3 / 16`
            tally at `recipe-1280.html:980` and the band meta at `:3303` —
            and the band head in `recipe-detail.tsx` already writes it, so
            1.5px here put two heads in adjacent columns at two trackings. */}
        {meta ? (
          <span className="ml-auto text-09 font-mono tabular-nums tracking-label uppercase text-ink-3">
            {meta}
          </span>
        ) : null}
      </div>
      {children ? (
        <div className="flex h-fit w-full shrink-0 flex-col items-start gap-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}
