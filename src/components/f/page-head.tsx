import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/* The shell's one breakpoint is `shell:` — `--breakpoint-shell` in
   `theme.css`, at 1080px. `nav-drawer.tsx` says why it must be written out
   as a whole class name at every use. */

export interface PageHeadProps {
  /** The document number and its path: `NN-04-02 · BAUMY BILTONG`. */
  left: ReactNode;
  /** A count, a revision, a date or a status: `SIXTH REVISION · 08 SEP 2026`. */
  right: ReactNode;
  /** The 360 wording of `left`, where the design shortens it. */
  leftNarrow?: ReactNode;
  /** The 360 wording of `right`, where the design shortens it. */
  rightNarrow?: ReactNode;
}

/**
 * `F/Page head` and `F/Page head 360` — band 2 of the two bands at the top
 * of every screen.
 *
 * It is NOT part of the site header. It is a per-screen document kicker
 * with exactly two slots, and both strings change on every one of the 26
 * screens the design draws: the left is a document number and a path, the
 * right is a count, a revision, a date or a status. The layout therefore
 * does not render it. Each screen renders it as the first thing inside
 * `<main>`, immediately under the header, and M4 to M6 wire it as they
 * rebuild each screen.
 *
 *   1280   14/60 padding, no fill and no rule at all, 10px mono at 1.5
 *          tracking in `f-ink-3`.
 *   360    10/16 padding, a `f-desk` ground, 9px mono at 1.3 tracking.
 *
 * A CONTRAST NOTE FOR THE DESIGNER. `f-ink-3` on `f-desk` is 4.70:1, one of
 * the two pairs in the whole palette with almost no margin (TOKEN-MAP §6.4,
 * 0.20 over the threshold). This component is where the design puts them
 * together, at 9px, on every 360 screen. It passes AA and it is hard to
 * read. `pnpm audit:ui` must cover this exact pair at M7.
 *
 * TWO BUILD ADDITIONS.
 *
 * The design sets both slots `white-space: nowrap`, which at 360 puts two
 * unbreakable strings in a 328px box. `truncate` on the left slot is
 * invisible while they fit and ellipsises rather than pushing the document
 * sideways when they do not — R-ACC-11 counts a sideways page as a major
 * fault.
 *
 * The drawn gap is `gap-0` and this is `gap-4`. Four pixels of column gap is
 * a minimum, not a layout: `justify-between` puts the two slots at the
 * edges, so the gap is only ever seen at the width where the left slot
 * reaches the right one — which is exactly where the drawing would have two
 * strings touching. The left slot truncates before that, so nothing the
 * design draws moves. Same reasoning as `page-foot.tsx`.
 */
export function PageHead({
  left,
  right,
  leftNarrow,
  rightNarrow,
}: PageHeadProps) {
  const slot = cn(
    'text-09 leading-normal font-mono tracking-head-360 whitespace-nowrap text-ink-3',
    'shell:text-10 shell:tracking-spine',
  );

  return (
    <div
      className={cn(
        'flex w-full shrink-0 flex-row items-center justify-between gap-4 bg-desk px-4 py-2.5',
        'shell:bg-transparent shell:px-15 shell:py-3.5',
      )}
    >
      <Slot
        className={cn(slot, 'min-w-0 truncate')}
        wide={left}
        narrow={leftNarrow}
      />
      <Slot
        className={cn(slot, 'shrink-0')}
        wide={right}
        narrow={rightNarrow}
      />
    </div>
  );
}

/**
 * One of the two strings, in its two wordings.
 *
 * Where the two are the same — which is most screens — one element carries
 * both, so a screen reader is not read the same kicker twice.
 */
function Slot({
  className,
  wide,
  narrow,
}: {
  className: string;
  wide: ReactNode;
  narrow?: ReactNode;
}) {
  if (narrow === undefined || narrow === wide) {
    return <div className={className}>{wide}</div>;
  }
  return (
    <>
      <div className={cn(className, 'shell:hidden')}>{narrow}</div>
      <div className={cn(className, 'hidden', 'shell:block')}>{wide}</div>
    </>
  );
}

export interface PageHeroProps {
  /** The accent mono line above the title: `SCIENCE · EIGHT`. */
  kicker?: ReactNode;
  /** The screen's title. Rendered as the page's `<h1>`. */
  title: ReactNode;
  /** The paragraph under it. */
  lede?: ReactNode;
  /** Anything the screen adds below the lede. */
  children?: ReactNode;
}

/**
 * `F/Page hero` — the title band of an index screen.
 *
 * A 12px column of an accent 9px mono kicker, a 48px Newsreader 500 title
 * at 1.05 leading and −1px tracking, and a 16px Geist lede at 1.7 in
 * `f-ink-2`. There is no rule above it or below it: the design separates
 * the head, the hero and the body with padding and a change of type, and
 * the only two rules in the whole shell are the one under the site header
 * and the one over the page foot.
 *
 * At 360 the title drops to 40px and the lede to 15px.
 *
 * TWO HERO SHAPES EXIST IN THE DESIGN and only this one is in §9.5. The
 * index screens use `Page hero`; the recipe and home screens use a richer
 * node named `Hero` — marks row, subtitle, summary, tags, 20px gap — and
 * that one belongs to M5.
 *
 * THE LEDE HAS NO MEASURE, and this is a real hole. The component is drawn
 * with a fixed 660px lede and then overridden per screen to 640, 740, 760,
 * 780, 820, 840 and 860 — eight widths with no scale behind any of them.
 * TOKEN-MAP §3.2 dropped `--measure` on the grounds that the 1280 frame
 * fixes the width; it does not. Rather than invent a ninth value the lede
 * is left at the column width here, and the designer owes M4 either one
 * measure token or a rule for choosing between eight.
 */
export function PageHero({ kicker, title, lede, children }: PageHeroProps) {
  return (
    <div className="flex w-full shrink-0 flex-col items-start gap-3">
      {kicker !== undefined && (
        <div className="text-09 leading-normal font-mono tracking-spine uppercase text-accent">
          {kicker}
        </div>
      )}
      <h1
        className={cn(
          'm-0 text-40 leading-105 font-serif font-medium tracking-display text-ink',
          'shell:text-48 shell:leading-105',
        )}
      >
        {title}
      </h1>
      {lede !== undefined && (
        <p
          className={cn(
            'm-0 w-full text-15 leading-170 font-sans tracking-flat text-ink-2',
            'shell:text-16 shell:leading-170',
          )}
        >
          {lede}
        </p>
      )}
      {children}
    </div>
  );
}
