/**
 * F/Batch line — one recorded run, and the SOURCE cell beside it.
 *
 * Read from `design/exports/foundations.html`, Plate II section F.5,
 * `data-pencil-name="F/Batch line"` at line 2704. Corroborated on
 * `batch-logs-1280.html:360` (six runs, the last of them naming no recipe),
 * `recipe-1280.html:3663` (the bare line inside a recipe) and
 * `m360-batch-search-list.html:320` (the 360 form of the source).
 *
 * A 110px lead column at 0.5px tracking, then a column of three: a 17px
 * Newsreader title, a 14px sans summary and a 9px mono meta run. `Col` holds
 * all three in all 53 instances across the exports.
 *
 * THE LEAD IS NOT A DATE FIELD. The design calls it `Date` and fills it with
 * `29 NOV 2024` on `/batch-logs` and with a catalogue number, `NN-04-02`, on
 * the `Recipe list` of a tag or cuisine page — the same component, the same
 * 110px, the same 10px mono `f-ink-3`, the same `p-[ 11px_0px ]`
 * (`classes-cuisines-1280.html:2077`). It is a free run and this file passes
 * it through, so M6 gets both screens from one component.
 *
 * `tracking-micro` — 0.5px — is used here and in F/Provenance line and
 * nowhere else in M4.
 *
 * R-SCR-44 AND K-01 — THE RUN THAT NAMES NO RECIPE. `BatchSource` below
 * draws both states, and exactly ONE property separates them: the colour of
 * the value. `SOURCE` stays `f-ink-3`, the type stays 15px Newsreader at
 * weight 500, the cell keeps its 150px and its 4px gap, and the row keeps
 * its place in date order. A linked run reads `Baumy Biltong` at 15.31:1; an
 * unlinked one reads `Not yet linked` at 5.25:1. The row is not hidden, not
 * indented, not dimmed as a whole and not given a warn tone. K-01 decided a
 * run may name no recipe; this is what that looks like.
 *
 * At 360 the same state is carried by an F/List mark instead — square
 * `f-hair`, name `f-ink-3`, text `SOURCE · Not yet linked`. That is
 * `ListMark` with `form="control"` and `muted`, in `list-row.tsx`; it is not
 * duplicated here.
 *
 * Server components.
 */

import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { FOCUS_RING } from './button';

/* 110px at 0.5px tracking. `tabular-nums` because the column is usually a
   date and R-CON-06 asks every number for the mono face and lining figures. */
const LEAD = cn(
  'w-27.5 shrink-0',
  'text-10 font-mono tracking-micro tabular-nums uppercase text-ink-3',
);

const TITLE = 'm-0 text-17 font-serif font-medium text-ink';

/* 14px over 24px. The size and its leading go in ONE cn() argument, or
   tailwind-merge drops the leading — TOKEN-MAP.md §4.3. */
const TEXT = 'm-0 w-full text-14 leading-170 font-sans text-ink-2';

const META = cn(
  'text-09 font-mono tracking-label tabular-nums uppercase',
  'text-ink-3',
);

export type BatchLineProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  /** The 110px column. A date on `/batch-logs`, a catalogue number on a
   *  tag or cuisine page. Passed through, never formatted here. */
  lead?: ReactNode;
  title: ReactNode;
  /** The run's page. The design draws the link no differently. */
  href?: string;
  /** The summary. Absent when the run has none (R-STA-05). */
  text?: ReactNode;
  /** The 9px mono run: costs, yield per kilogram, the revision it used. */
  meta?: ReactNode;
};

/** F/Batch line — a lead column and a title, summary and meta beside it. */
export function BatchLine({
  lead,
  title,
  href,
  text,
  meta,
  className,
  ...props
}: BatchLineProps) {
  return (
    <div
      className={cn(
        'flex w-full shrink-0 flex-row items-start gap-5 py-2.75',
        className,
      )}
      {...props}
    >
      <span className={LEAD}>{lead}</span>{' '}
      <div className="flex flex-1 basis-0 flex-col items-start gap-1">
        {href ? (
          <p className={TITLE}>
            {/* The colour goes on the anchor, not only on the paragraph:
                `globals.css` still carries `a { color: var(--accent) }`
                until M7, and a specified colour beats an inherited one. */}
            <Link
              href={href}
              className={cn('text-ink no-underline', FOCUS_RING)}
            >
              {title}
            </Link>
          </p>
        ) : (
          <p className={TITLE}>{title}</p>
        )}
        {text ? <p className={TEXT}>{text}</p> : null}
        {meta ? <span className={META}>{meta}</span> : null}
      </div>
    </div>
  );
}

/* ── The SOURCE cell (R-SCR-44) ────────────────────────────────────────── */

const SOURCE_LABEL = cn(
  'text-09 font-mono tracking-label uppercase',
  'text-ink-3',
);

/* No `whitespace-nowrap`: the design carries one on nearly every text node
   and it is an export artefact. A recipe title in a 150px column has to
   wrap (R-STA-09). */
const SOURCE_VALUE = 'w-full text-15 font-serif font-medium';

export type BatchSourceProps = HTMLAttributes<HTMLDivElement> & {
  /** The micro-label above the value. Uppercased by the component. */
  label?: ReactNode;
  /** The source recipe's title. Absent ⇒ the unlinked state. */
  name?: ReactNode;
  /** The source recipe's page. */
  href?: string;
  /** What the cell says when there is no source recipe. */
  fallback?: ReactNode;
};

/**
 * The SOURCE cell of a batch log row, in both of its states.
 *
 * R-SCR-44 says the row must READ CORRECTLY with no source recipe, and the
 * design's answer is a placeholder in the same slot, in the same type, three
 * points of contrast quieter. Nothing else moves.
 */
export function BatchSource({
  label = 'Source',
  name,
  href,
  fallback = 'Not yet linked',
  className,
  ...props
}: BatchSourceProps) {
  const linked = name !== undefined && name !== null && name !== '';

  return (
    <div
      className={cn(
        'flex w-37.5 shrink-0 flex-col items-start gap-1',
        className,
      )}
      {...props}
    >
      <span className={SOURCE_LABEL}>{label}</span>
      {linked && href ? (
        <p className={cn(SOURCE_VALUE, 'm-0 text-ink')}>
          <Link href={href} className={cn('text-ink no-underline', FOCUS_RING)}>
            {name}
          </Link>
        </p>
      ) : (
        <p
          className={cn(
            SOURCE_VALUE,
            'm-0',
            linked ? 'text-ink' : 'text-ink-3',
          )}
        >
          {linked ? name : fallback}
        </p>
      )}
    </div>
  );
}
