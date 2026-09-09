/**
 * F/Revision — one entry in the revision timeline.
 *
 * Read from `design/exports/foundations.html`, Plate II section F.5,
 * `data-pencil-name="F/Revision"` at line 2644. Corroborated on
 * `recipe-1280.html:3331` (six entries, one CURRENT and one backfilled),
 * `recipe-revision-1280.html:3367` and `recipe-1280-dark.html:3507`.
 *
 * THERE IS NO TIMELINE FURNITURE. No rule, no dot, no connecting line, no
 * badge. The old build's 50%-radius dot and vertical rule have no
 * counterpart anywhere in the eighteen exports: a 210px left column and 40px
 * of gutter is the whole timeline, and entries are 16px apart.
 *
 * THE NUMBER IS A WORD. `Sixth revision`, `First revision` — 21px Newsreader
 * at weight 500, not a numeral and not an F/Mark quiet. `revisionOrdinal` in
 * `src/lib/site.ts` writes it, and `src/components/recipe-card.tsx` writes
 * the card's `SIXTH REVISION` from the SAME function: the design draws one
 * string for both slots, so a second table here would be a second answer to
 * one question. The rationale beside it is the only 15px sans run in M4 set
 * in `f-ink` rather than `f-ink-2`: the reason for a revision is primary
 * text, not metadata.
 *
 * R-SCR-07 — THE CURRENT ENTRY. `Left` gains a third child, the bare word
 * `CURRENT` in 9px Geist Mono, `f-accent`, at 1.5px tracking — one step
 * wider than the date directly above it, which is 1.2px. It is NOT an
 * F/Mark quiet: no ground, no padding, no box. Six of them exist across the
 * exports and every one reads CURRENT in the accent.
 *
 * R-SCR-08 — THE BACKFILLED ENTRY. The date is the ordinary `Date` field
 * that every entry already carries; the words are a second child of `Right`,
 * BELOW the rationale, reading `RECORDED LATER — FOUND IN THE OLD NOTEBOOK`
 * in 8px mono `f-caution`. That is the smallest type in M4 — 5.67:1 light
 * and 9.16:1 dark, so it is legal and it is hard to read. TOKEN-MAP.md §6.4
 * makes the same complaint about 8px `f-ink-3` text. Raised, not changed.
 *
 * THE 360 FORM IS THIS BUILD'S. The design does not draw one:
 * `data-pencil-name="F/Revision"` occurs only in `foundations.html`, and
 * `recipe-360.html` draws the REVISIONS tab strip but not the timeline
 * behind it. The drawn 1280 row is a 210px lead column and a 40px gutter,
 * which leaves 78px of a 328px phone for the rationale — so below `shell:`
 * the entry stacks: the lead becomes a full-width row of its own and the
 * rationale takes the whole column, at the 8px the design uses between the
 * lead's own parts. Every sibling in this milestone with a wide lead column
 * carries the same pair (`mechanism.tsx`, `citation.tsx`, `table-row.tsx`).
 * Raised in the M4 report; the designer owns the real drawing.
 *
 * WHAT IS NOT DRAWN: on `/recipes/[slug]/revisions/3` the third entry — the
 * one being read — carries no mark of any kind in the timeline. "You are
 * here" is said by the page hero's warn-toned `F/Mark quiet` and the
 * superseded `F/Notice`, both of which M3 already built.
 *
 * Server components.
 */

import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';

import { revisionOrdinal } from '@/lib/site';
import { cn } from '@/lib/utils';

import { FOCUS_RING } from './button';

/* 21px over 24px. The size and its leading go in ONE cn() argument, or
   tailwind-merge drops the leading with the next size it meets —
   TOKEN-MAP.md §4.3. */
const ORDINAL = 'text-21 leading-115 font-serif font-medium text-ink';

const DATE = cn(
  'text-09 font-mono tracking-label tabular-nums uppercase',
  'text-ink-3',
);

/** 1.5px, not the 1.2px of the date above it. The one difference. */
const CURRENT = 'text-09 font-mono tracking-spine uppercase text-accent';

/* 15px over 26px, in one argument for the same reason as above. */
const DESC = 'm-0 w-full text-15 leading-170 font-sans text-ink';

const LATER = 'text-08 font-mono tracking-label uppercase text-caution';

export type RevisionProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  /** The revision number. Written out as a word by `revisionOrdinal`. */
  revisionNumber?: number;
  /** Overrides the word. Use it when the caller has its own phrasing. */
  ordinal?: ReactNode;
  /** The date this revision was written. Drawn on every entry. */
  date?: ReactNode;
  /** This revision's own page. The design draws the link no differently. */
  href?: string;
  /** R-SCR-07. Marks the entry `CURRENT` in the accent. */
  current?: boolean;
  /** The current entry's word. Uppercased by the component. */
  currentLabel?: ReactNode;
  /** R-SCR-08. Adds the `recorded later` line under the rationale. */
  backfilled?: boolean;
  /** The reason, drawn after an em dash: `found in the old notebook`. */
  backfilledNote?: ReactNode;
  /** The rationale. The design gives it the page's primary ink. */
  children?: ReactNode;
};

/**
 * F/Revision — a 210px left column, 40px of gutter, and the rationale.
 *
 * R-SCR-07 is met by `revisionNumber` and `current`; R-SCR-08 by `date`,
 * which every entry carries anyway, and `backfilled`.
 */
export function Revision({
  revisionNumber,
  ordinal,
  date,
  href,
  current = false,
  currentLabel = 'Current',
  backfilled = false,
  backfilledNote,
  children,
  className,
  ...props
}: RevisionProps) {
  /* `revisionOrdinal` returns `undefined` for a number that is not a
     revision, so the slot is dropped rather than drawn empty (R-STA-05). */
  const word =
    ordinal ??
    (revisionNumber === undefined
      ? undefined
      : revisionOrdinal(revisionNumber));

  return (
    <div
      data-current={current ? 'true' : undefined}
      className={cn(
        'flex w-full shrink-0 flex-col gap-2 py-5',
        'shell:flex-row shell:items-start shell:gap-10',
        className,
      )}
      {...props}
    >
      <div className="flex w-full shrink-0 flex-col items-start gap-1 shell:w-52.5">
        {word === null || word === undefined ? null : href ? (
          <Link
            href={href}
            aria-current={current ? 'true' : undefined}
            className={cn(ORDINAL, 'no-underline', FOCUS_RING)}
          >
            {word}
          </Link>
        ) : (
          <span className={ORDINAL}>{word}</span>
        )}
        {/* R-CMP-14's real space between each stacked run: without it the
            lead column reads "Sixth revision08 SEP 2026CURRENT". */}
        {date ? ' ' : null}
        {date ? <span className={DATE}>{date}</span> : null}
        {current ? ' ' : null}
        {current ? <span className={CURRENT}>{currentLabel}</span> : null}
      </div>{' '}
      {/* `flex-1 basis-0` only above `shell:`: below it the entry is a
          column, and a zero basis on a column child is a height and not a
          width. */}
      <div className="flex w-full flex-col items-start gap-2 shell:flex-1 shell:basis-0">
        {children ? <p className={DESC}>{children}</p> : null}
        {backfilled ? (
          <span className={LATER}>
            Recorded later
            {backfilledNote ? <> — {backfilledNote}</> : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}
