import Link from 'next/link';
import type { ReactNode } from 'react';

import { site } from '@/lib/site';
import { cn } from '@/lib/utils';

/** See the note on the same constant in `nav-drawer.tsx`. R-ACC-05. */
const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/* The shell's one breakpoint is `shell:` — `--breakpoint-shell` in
   `theme.css`, at 1080px. `nav-drawer.tsx` says why it must be written out
   as a whole class name at every use. */

export interface PageFootProps {
  /**
   * The effectivity or provenance statement, hard left.
   * `EFFECTIVITY: SIXTH REVISION AND ON`, `EVERY RUN, LINKED OR NOT`,
   * `COMPILED 08 SEP 2026 · TWENTY-SEVEN INGREDIENTS`.
   *
   * The default is the design's own generic left slot, which it draws on
   * every screen that has no effectivity to state — `/connect`, `/sign-in`,
   * `/connect/done` and the 404 all read `ISSUE 01 · 08 SEP 2026`. It is
   * NOT a copyright line: no © appears anywhere in the eighteen exports,
   * and the slot is set in mono capitals, which is not how a copyright is
   * written. C-04 in §9.1 calls this slot "the copyright"; the design calls
   * it a document issue, and the design decides how a screen reads. Recorded
   * as D-07.
   */
  left?: ReactNode;
  /**
   * The document address, hard right. Two shapes, one slot: a slash path
   * (`NN/BATCH-LOGS`) on an index or a utility screen, a document number
   * (`NN-04-02 · SIXTH REVISION`) on the recipe, science and home family.
   */
  right?: ReactNode;
}

/**
 * `F/Page foot` — C-04.
 *
 * Three slots at 1280 and two at 360, on a 1px `f-hair` top rule with no
 * ground of its own. The middle slot is the only invariant string in the
 * whole foot: `CONNECT · SOURCE · LLMS.TXT` on every 1280 screen without
 * exception, and it is C-04's three links. The outer two are per-screen
 * copy, so they are props.
 *
 * `justify-between`, NOT a three-column grid. Measured on the drawing, the
 * middle slot's centre is at 673.3 in a 1280 box, not at 640. A grid would
 * move it.
 *
 * THE DRAWN GAP IS `gap-0` AND THIS IS NOT. Four pixels of column gap is a
 * minimum, not a layout: `justify-between` puts the slots at the edges and
 * the gap is only ever seen when the left slot is long enough to reach the
 * middle one, where the drawing would have two strings touching. The left
 * slot truncates before that happens, so the 4px is a guard and nothing in
 * the drawing moves.
 *
 * THREE INCONSISTENCIES IN THE DRAWING, resolved the way the majority of
 * the frames draw them, and all three recorded for the designer:
 *
 * - G-9. The dark 360 home carries the 1280 foot inside a 360 frame —
 *   26/60 padding and all three slots — which leaves 240px for three
 *   strings. Every other 360 frame uses 24/16 padding and two slots. The
 *   two-slot foot is taken.
 * - G-10. `recipe-360.html` sets the 360 foot at 9.5px and 1.4 tracking;
 *   the four newer `m360-*` files set it at 9px and 1.2 across 20 frames.
 *   The 20 are taken.
 * - G-16. The design drops the middle slot below 1280 and surfaces the
 *   connector nowhere else at 360, which would leave `/connect`, the
 *   repository and `/llms.txt` unreachable on every phone and tablet. That
 *   is a C-04 function and `/connect` is deliberately absent from the
 *   sitemap, so the footer link is its only address. THE LINKS ARE KEPT AT
 *   EVERY WIDTH: below `shell` they take a row of their own under the two
 *   drawn slots, which is what the old shell did with `flex-wrap` before
 *   M3. The drawn two-slot row is unchanged; a third row is added beneath
 *   it. The designer still owns the question of what the phone foot should
 *   say — this build will not answer it by deleting the link.
 */
export function PageFoot({ left = site.issue, right = 'NN' }: PageFootProps) {
  const slot = cn(
    'text-09 leading-normal font-mono tracking-label whitespace-nowrap text-ink-3',
    'shell:text-09-5 shell:tracking-foot',
  );

  return (
    /*
     * `data-page-foot` is a test hook, not a style. `e2e/site.spec.ts`
     * asserts that the connector link is in the foot and nowhere louder.
     * It replaced the `site-footer` class at M7, when `globals.css` went and
     * with it the top border, the 2rem/1.25rem padding, the `--text-faint`
     * and the 0.88rem size that class used to draw. Every one of those is
     * written by a utility below, ON THE ELEMENT ITSELF, so nothing added to
     * this foot later inherits the old type by omission.
     */
    <footer
      data-page-foot=""
      className={cn(
        'flex w-full shrink-0 flex-row flex-wrap items-center justify-between gap-x-4 gap-y-4 border-t border-hair px-4 py-6',
        'text-09 leading-normal font-mono text-ink-3',
        'shell:flex-nowrap shell:gap-y-0 shell:px-15 shell:py-6.5 shell:text-09-5',
      )}
    >
      <div className={cn(slot, 'min-w-0 truncate uppercase')}>{left}</div>

      {/*
       * The design sets this as one quiet mono string with the separators
       * inside it, so the separators are text in the run and not gapped
       * flex children — five flex items with a gap around each `·` measured
       * about 24px wider than the drawing.
       *
       * `order-1` and `w-full` put the run on its own row below `shell`,
       * under the two slots the design draws; at `shell` and above the
       * order resets and the run takes its drawn place in the middle. The
       * document order is left, links, right at every width, so the reading
       * order never leaves the drawn order.
       */}
      <div
        className={cn(
          slot,
          'order-1 w-full whitespace-normal',
          'shell:order-none shell:w-auto shell:shrink-0 shell:whitespace-nowrap',
        )}
      >
        <FootLink href="/connect">Connect</FootLink>
        <Separator />
        <FootLink href={site.repository} external>
          Source
        </FootLink>
        <Separator />
        <FootLink href="/llms.txt" external>
          llms.txt
        </FootLink>
      </div>

      <div className={cn(slot, 'shrink-0 uppercase')}>{right}</div>
    </footer>
  );
}

/**
 * One of the three words in the middle slot.
 *
 * The design sets the slot as plain text, so the hover darkening and the
 * underline are the affordance it leaves out; neither is the only way to
 * tell, because the words read as a list of destinations either way, which
 * is what R-ACC-10 asks.
 *
 * `min-h-6` is not in the drawing. The three words are standalone controls
 * in a row and they are drawn 13px tall, under the 24px WCAG 2.5.8 minimum
 * that the brand, the list control and the `≡` glyph all take in this same
 * shell (G-5). The negative block margin gives the height back to the row,
 * so the drawn baseline does not move.
 */
function FootLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: ReactNode;
}) {
  const className = cn(
    '-my-1.5 inline-flex min-h-6 items-center align-middle',
    'text-09 leading-normal font-mono tracking-label whitespace-nowrap text-ink-3 uppercase no-underline hover:text-ink hover:underline hover:underline-offset-2',
    'shell:text-09-5 shell:tracking-foot',
    FOCUS,
  );

  /* `/llms.txt` is a route handler and the repository is another origin.
     Neither is a client-side navigation, so neither goes through `Link`. */
  if (external) {
    return (
      <a href={href} rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/** The separator the design draws between the three words, as text. */
function Separator() {
  return <span aria-hidden>{' · '}</span>;
}
