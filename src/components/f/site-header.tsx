import Link from 'next/link';

import { Contents360, Navigation } from '@/components/f/nav-drawer';
import { BasketButton } from '@/components/shopping-basket';
import { site } from '@/lib/site';
import { cn } from '@/lib/utils';

/** See the note on the same constant in `nav-drawer.tsx`. R-ACC-05. */
const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/* The shell's one breakpoint is `shell:` — `--breakpoint-shell` in
   `theme.css`, at 1080px. `nav-drawer.tsx` says why it must be written out
   as a whole class name at every use. */

/**
 * `Brand` — the mark and the wordmark, from `F/Site header` and
 * `F/Site header 360`.
 *
 * The mark is a square `f-accent` block with "NN" in 11px mono; the design
 * gives it no radius, and the one 2px corner in the whole system is the
 * chip pill. The wordmark is Newsreader 500. At 360 everything shrinks by
 * one step — 12px gap to 10, 5/8 padding to 4/7, 11px mark to 10, 21px
 * wordmark to 17 — and nothing else changes.
 *
 * The mark is `aria-hidden`, so the link is named "Noble Notations" rather
 * than "NN Noble Notations".
 */
export function Brand() {
  return (
    <Link
      href="/"
      className={cn(
        /* `min-h-6` is not in the drawing. The brand lockup is 194.4 × 24 at
           1280 and 159 × 21 at 360, and 21 is under the 24px WCAG 2.5.8
           minimum that `pnpm audit:ui` also checks. Three pixels of minimum
           height cost nothing: the row is `items-center`, so the mark and
           the wordmark do not move. */
        'flex min-h-6 w-fit shrink-0 flex-row items-center gap-brand-360 no-underline',
        'shell:gap-3',
        FOCUS,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex shrink-0 flex-row items-center rounded-none bg-accent px-1.75 py-1 text-10 leading-normal font-mono tracking-mark-360 text-on-accent',
          'shell:px-2 shell:py-1.25 shell:text-11 shell:tracking-label',
        )}
      >
        NN
      </span>
      <span
        className={cn(
          'text-17 leading-normal font-serif font-medium tracking-flat whitespace-nowrap text-ink',
          'shell:text-21',
        )}
      >
        {site.name}
      </span>
    </Link>
  );
}

/**
 * `F/Site header` and `F/Site header 360` — band 1 of the two the design
 * stacks at the top of every screen. Band 2 is `F/Page head`, which is
 * per-screen data and belongs to each page, not to the layout.
 *
 * The two drawn boxes are one component here, because rendering both and
 * hiding one would put the nine addresses in the document twice.
 *
 *   1280   20/60 padding, opaque `f-paper`, 1px `f-hair` under it, and
 *          three parts on a `justify-between` row: brand, nav, list.
 *   360    16px padding all round, the same hairline, brand on the left and
 *          a 12px cluster of list control and `≡` on the right.
 *
 * TWO DEPARTURES FROM THE DRAWING, both recorded for the designer:
 *
 * - The 360 box has NO fill in the design — no `fill` on the component and
 *   no `bg-*` class in any of its 26 exported instances (G-4). R-NAV-04
 *   makes this header sticky, and a transparent sticky bar lets the page
 *   scroll through it. `bg-paper` is added at 360; 1280 already has it.
 * - The list control keeps a 24px minimum hit box. It is drawn 56.8 × 17 at
 *   1280 and 48.8 × 16 at 360, both under WCAG 2.5.8 (G-5). The extra
 *   height is taken back with a negative block margin, so the row it sits
 *   in is unmoved.
 *
 * WHAT R-NAV-06 COSTS. The list control is outside the drawer and outside
 * the nav, which is what R-NAV-06 and R-CMP-02 require and what the design
 * draws — the drawer's own copy of this header has the control switched off
 * explicitly. The consequence is that while the drawer is open the count is
 * not on screen. The design chose that; both rules permit it; it is
 * recorded because R-NAV-06's second sentence can also be read as "visible
 * at all times", and only the designer can settle which reading is meant.
 */
export function SiteHeader() {
  return (
    <header
      /*
       * R-NAV-05: the probe in `header-height.tsx` finds the header by this
       * attribute and publishes its measured height as `--header-h`. It is
       * an attribute and not a class on purpose. `globals.css` styled
       * `.site-header` with a blur, a colour-mix ground and its own
       * padding, and this header had to inherit none of the three. That
       * file went at M7; the attribute stays because AGENTS.md's rule is
       * that a hook a probe or a test needs is a `data-` attribute and
       * never a class name.
       */
      data-site-header
      className={cn(
        'sticky top-0 z-20 flex w-full shrink-0 flex-row items-center justify-between gap-0 border-b border-hair bg-paper p-4',
        'shell:px-15 shell:py-5',
      )}
    >
      <Brand />
      <Navigation />
      {/*
       * At 360 this is the design's `Right`: the list control and the `≡`,
       * 12px apart, held together at the end of a `justify-between` row.
       *
       * At 1280 there is no `≡` and the design puts the list control at the
       * end of a three-part row of its own, so the wrapper dissolves to
       * `display: contents` and the control becomes a direct child. That is
       * also what makes R-CMP-01 fall out for free: with an empty list the
       * control renders nothing, the row is left with two children, and
       * `justify-between` puts the brand left and the nav right — which is
       * what the design's own reflow would do. A wrapper left in place
       * would have held a zero-width third slot at the right edge and
       * stranded the nav in the middle.
       */}
      <div
        className={cn(
          'flex w-fit shrink-0 flex-row items-center gap-3',
          'shell:contents',
        )}
      >
        <BasketButton />
        <Contents360 brand={<Brand />} />
      </div>
    </header>
  );
}
