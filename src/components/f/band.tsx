/**
 * F/Band — the page-level spine, and its 360 fold.
 *
 * This is the shape M6 exists to build. It is drawn identically at
 * `home-recipes-1280.html:262`, `:403`, `:884`, `:1501`, `:1593` and
 * `science-1280.html:232`, `:318`, `:589`, and it is the difference between
 * a document and a stack of cards:
 *
 *     Band    flex-row gap-[ 44px ] items-start
 *       L     text-[ 9px ]/[ 16px ] w-[ 178px ] shrink-0 #8E2A1E 1.5px
 *       Centre [ flex:1_1_0 ] flex-col gap-[ 20|24|32px ]
 *       M     text-[ 9px ]/[ 16px ] w-[ 130px ] shrink-0 #79655F 1.2px right
 *
 * 178 + 44 + 764 + 44 + 130 = 1160, which is the 1280 frame less its 60px
 * gutters. There is no rule, no ground, no radius and no box: what separates
 * one band from the next is 44px of air and a change of type.
 *
 * AT 360 THE SPINE ROTATES INTO A HEADER, and a rule appears that does not
 * exist at 1280. `m360-access-science.html:1659` and `m360-core.html` draw
 * it as `F/Section 360`: a `gap-[ 14px ]` column whose first child is a
 * ruled row carrying the same label and the same meta, over a `gap-[ 16px ]`
 * body. The words do not change with the width — only the geometry does.
 *
 * ONE DOM SERVES BOTH WIDTHS. The meta is the one string that has to move
 * from the head to the right margin, so it is written twice and one copy is
 * always `display:none` — the same construct `page-head.tsx` uses for its
 * two wordings, and for the same reason: a `display:none` element is not in
 * the accessibility tree, so nothing is announced twice.
 *
 * WHY THIS IS NOT `recipe-detail.tsx`'s `Band`. That one is deliberately the
 * full-width `F/Section 360` head at every width, because it sits inside a
 * 700px panel where 396px of spine would leave 85px of text — the
 * measurement is in the comment at `recipe-detail.tsx:160`. A spine is a
 * PAGE-level device. This component is the page-level one; that one stays.
 *
 * A server component.
 */

import type { ElementType, HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/* The shell's one breakpoint is `shell:` — `--breakpoint-shell` in
   `theme.css`, at 1080px. `nav-drawer.tsx` says why it must be written out
   as a whole class name at every use. */

/*
 * The rule that exists only at 360. One four-value declaration and an
 * explicit style, because Tailwind's preflight is OFF until M7: nothing sets
 * a global `border-style`, so a lone `border-b` draws nothing at all and a
 * `border-solid` beside it would give the other three sides the CSS initial
 * `medium` width. Same note as `notice.tsx` and `section-label.tsx`.
 */
const HEAD_RULE = cn(
  '[border-style:solid] [border-width:0px_0px_1px_0px] border-b-hair',
  'shell:[border-width:0px_0px_0px_0px]',
);

/** The rail. 9 over 16 is `leading-180`; at 360 the design draws `normal`. */
const LABEL = cn(
  'm-0 text-09 leading-normal shell:leading-180',
  'font-mono font-normal tracking-spine uppercase text-accent',
);

/** The right-hand note. 1.2px of tracking, not the label's 1.5px. */
const META = cn(
  'text-09 leading-normal shell:leading-180',
  'font-mono tabular-nums tracking-label uppercase text-ink-3',
);

/**
 * The centre column's gap at `shell:`. The design draws exactly three, and
 * which one a band takes is decided by what is IN it rather than by the
 * screen: 20px between cards, 24px between citation rows, 32px between
 * mechanisms. At 360 all three collapse to the drawn 16px.
 */
const CENTRE_GAP = {
  /** `gap-[ 20px ]`. Home, `/recipes`, the STUDIES and APPLIED IN bands. */
  card: 'shell:gap-5',
  /** `gap-[ 24px ]`. `/science`'s FROM THE RECIPES list. */
  citation: 'shell:gap-6',
  /** `gap-[ 32px ]`. The mechanism list, on both science screens. */
  mechanism: 'shell:gap-8',
} as const;

export type BandGap = keyof typeof CENTRE_GAP;

export type BandProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  /** The rail, in the design's own words: `RECENTLY WORKED`, `MECHANISMS`. */
  label: ReactNode;
  /**
   * The right-hand note — the count of things in this band, spelled in
   * words, with a noun only where a bare number would be ambiguous:
   * `SIX`, `NINE GROUPS · 34 TAGS`, `NONE YET`. `numberWord` below is the
   * spelling rule. A band with a rail and no meta is half the pattern, so
   * this is not optional in practice; it is typed optional for the one band
   * that genuinely counts nothing.
   */
  meta?: ReactNode;
  /** The centre column's gap at `shell:`. See `CENTRE_GAP`. */
  gap?: BandGap;
  /** The heading level. A band head is an `h2` unless it is nested. */
  as?: ElementType;
  /** Classes for the centre column, for a band that needs its own measure. */
  centreClassName?: string;
  children: ReactNode;
};

/**
 * F/Band — a rail, a wide centre column and a right-hand meta note.
 */
export function Band({
  label,
  meta,
  gap = 'card',
  as: Heading = 'h2',
  centreClassName,
  children,
  className,
  ...props
}: BandProps) {
  const hasMeta = meta !== undefined && meta !== null && meta !== '';

  return (
    <section
      className={cn(
        'flex h-fit w-full shrink-0 flex-col items-start gap-section-360',
        'shell:flex-row shell:items-start shell:gap-11',
        className,
      )}
      {...props}
    >
      {/* The head at 360, the rail at 1280. `items-center` only matters at
          360, where the meta shares the row; at `shell:` the meta below is
          the one that draws and this is a single line of text. */}
      <div
        className={cn(
          'flex h-fit w-full shrink-0 flex-row items-center gap-3 pb-1.75',
          'shell:w-44.5 shell:gap-0 shell:pb-0',
          HEAD_RULE,
        )}
      >
        <Heading className={LABEL}>{label}</Heading>
        {/* R-CMP-14's real space. A flex gap is invisible to `textContent`,
            so without it the head reads "MECHANISMSNINE" to a screen reader
            and to a copy-paste. A whitespace-only text node is not rendered
            as a flex item (CSS Flexbox §4), so the drawn gap does not move. */}
        {hasMeta ? ' ' : null}
        {hasMeta ? (
          <span className={cn(META, 'ml-auto text-right', 'shell:hidden')}>
            {meta}
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          'flex h-fit w-full min-w-0 flex-col items-start gap-4',
          'shell:flex-1 shell:basis-0',
          CENTRE_GAP[gap],
          centreClassName,
        )}
      >
        {children}
      </div>

      {/* The 130px right margin. Hidden at 360, where the copy above draws
          instead. */}
      {hasMeta ? (
        <span
          className={cn(
            META,
            'hidden',
            'shell:block shell:w-32.5 shell:shrink-0 shell:text-right',
          )}
        >
          {meta}
        </span>
      ) : null}
    </section>
  );
}

/* ── The meta's spelling rule ──────────────────────────────────────────── */

const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];

/**
 * The count in a band's meta note, spelled the way the design spells it.
 *
 * Every meta in the eighteen exports is a WORD — `SIX`, `TWO STUDIES · SEVEN
 * MECHANISMS`, `ONE RECIPE` — with exactly one numeral in the whole set,
 * home's `NINE GROUPS · 34 TAGS`. So the rule is: spell it while a word is
 * shorter than the thing it counts, and print the numeral once it is not.
 * Twenty is where that turns over, and it is also the last number English
 * writes in one word without a hyphen.
 *
 * The component uppercases; this returns lower case, the same way
 * `KIND_LABELS` holds "Recipe" and `Mark` draws "RECIPE".
 */
export function numberWord(count: number): string {
  if (!Number.isFinite(count) || count < 0) return String(count);
  const whole = Math.floor(count);
  return WORDS[whole] ?? String(whole);
}
