/**
 * F/Provenance line — where a recipe came from, one line per source.
 *
 * Read from `design/exports/foundations.html`, Plate II section F.5,
 * `data-pencil-name="F/Provenance line"` at line 2686. Corroborated on
 * `recipe-1280.html:3570`, which draws three of them under the accent
 * section label PROVENANCE. Lines sit 16px apart.
 *
 * IT IS F/BATCH LINE WITH THE COLUMN FLATTENED TO A SENTENCE, and the two
 * differ in exactly two ways. The padding is `p-[ 9px_0px ]` against the batch
 * line's `p-[ 11px_0px ]` — two pixels tighter. And the text is `f-ink` and
 * grows, against a batch line's `Text`, which is `f-ink-2` and sits inside a
 * `Col` under a title. There is no title and no meta run here.
 *
 * The 110px lead is IDENTICAL to F/Batch line's: 10px Geist Mono, 0.5px
 * tracking, `f-ink-3`. Both files write it out rather than share a constant,
 * because they are two components in the design and a reviewer compares each
 * against its own drawing.
 *
 * THE DATE IS A FREE STRING. The three values drawn are `2024`, `2024–25`
 * and `01 SEP 2026`. Do not format it — a provenance date is often a range
 * or a decade, and the source rarely knows a day. It is passed through.
 *
 * R-STA-05: the design draws no empty state for this block. The section is
 * absent when the list is empty; that is the caller's, and it is what §10.2.3
 * asks of every block.
 *
 * A server component.
 */

import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/* R-CON-06: the lead is a date, so it takes the mono face and tabular
   figures even though it is often a range rather than a figure. */
const DATE = cn(
  'w-27.5 shrink-0',
  'text-10 font-mono tracking-micro tabular-nums text-ink-3',
);

/* 14px over 24px, in ONE cn() argument — TOKEN-MAP.md §4.3. The text takes
   the page's primary ink here and the quiet ink on a batch line; that is
   the whole difference in tone between the two. */
const TEXT = 'm-0 flex-1 basis-0 text-14 leading-170 font-sans text-ink';

export type ProvenanceLineProps = HTMLAttributes<HTMLDivElement> & {
  /** A year, a range or a full date. Written as the source states it. */
  date?: ReactNode;
  children?: ReactNode;
};

/** F/Provenance line — a date column and one sentence. No rule, no ground. */
export function ProvenanceLine({
  date,
  children,
  className,
  ...props
}: ProvenanceLineProps) {
  return (
    <div
      className={cn(
        'flex w-full shrink-0 flex-row items-start gap-5 py-2.25',
        className,
      )}
      {...props}
    >
      <span className={DATE}>{date}</span> <p className={TEXT}>{children}</p>
    </div>
  );
}
