/**
 * F/Citation — one source, from `note_sources`.
 *
 * Read from `design/exports/foundations.html`, Plate II section F.4,
 * `data-pencil-name="F/Citation"` at line 2424. Drawn on the page at
 * `science-1280.html:1439` and `:1467`, and at 360 in
 * `m360-access-science.html:2923`.
 *
 * It is F/Mechanism's row with three things changed: the gutter is `f-ink-3`
 * and not accent, the title is 15 over 23 rather than 19 over 25, and the
 * tail is a source line rather than a conditions line. That is deliberate —
 * a mechanism is a claim, a citation is apparatus, and the quieter gutter
 * says so.
 *
 * ONE COMPONENT, THREE CALLERS. The design draws the same row three times:
 * the REFERENCES block on a study (`[1]`, `[2]`), the `FROM THE RECIPES`
 * block on the `/science` index (`R1`…`R6`, whose source line reads
 * `BEEF WELLINGTON · RESEARCH`), and the 360 REFERENCES block. `source`
 * overrides the computed line so the second caller needs no second
 * component. D-06 in `design/DECISIONS.md` is the rule: the exported symbol
 * carries the design's name, the file groups the family.
 *
 * A server component.
 */

import Link from 'next/link';
import { Fragment } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { FOCUS_RING } from './button';

/*
 * `2026-09-08` → `08 SEP 2026`, which is how the design writes every date:
 * `F/Page foot`, `F/Batch line > Date` and this component all draw it.
 *
 * Parsed by splitting the string rather than through `new Date()`. A bare
 * `YYYY-MM-DD` is parsed as UTC and rendered in the local zone, so west of
 * Greenwich `new Date('2026-09-08')` is the seventh of September — a date on
 * a citation that moves with the reader's clock is worse than no formatting
 * at all. Anything that is not a plain ISO date is passed through unchanged.
 */
const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

export function citationDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return value;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return value;
  return `${match[3]} ${month} ${match[1]}`;
}

/**
 * What to show in place of an address. `note_sources.url` holds both real
 * addresses and repository-relative paths — the design draws
 * `DOCS/RECIPE_TINKERING/DEMI-GLAZE-RESEARCH.MD` in this slot — so an
 * absolute address is reduced to host and path and anything else is passed
 * through. The component uppercases it.
 */
function addressLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const tail = `${parsed.search}${parsed.hash}`;
    const path = parsed.pathname === '/' && !tail ? '' : parsed.pathname;
    /* The query and the fragment are kept. They are often the whole of what
       identifies a page — `example.com/?p=8812` collapses to `example.com`
       without them, and two different sources then draw the same line. Only
       the scheme and a bare trailing slash are dropped. */
    return `${parsed.host}${path}${tail}`;
  } catch {
    return url.replace(/^\.?\//, '');
  }
}

/*
 * `part` is also a real DOM attribute — CSS Shadow Parts — and React's
 * `HTMLAttributes` declares it as `string`. Left in the intersection it
 * narrows this prop to `string | undefined` and a nullable `note_sources`
 * column stops type-checking. It is omitted rather than the prop renamed:
 * `part` is R-SCR-42's own word for the field, and no page in this build
 * uses shadow parts.
 */
export type CitationProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'title' | 'part'
> & {
  /** The gutter: `[1]`, `[2]` on a study; `R1`… on the index. */
  code?: ReactNode;
  /**
   * R-SCR-42's first of three — the work. `note_sources.title`.
   * Every field below can be null (R-STA-05), and this one is the only
   * element that must never come out blank: an empty serif line reads as a
   * rendering fault. It falls back to the part, then to the address, then to
   * the literal `Untitled source`.
   */
  work?: string | null;
  /** R-SCR-42's second — which part of it. `note_sources.citation`. */
  part?: string | null;
  /** R-SCR-42's third — the date a person read it. `YYYY-MM-DD`. */
  accessedAt?: string | null;
  /** `note_sources.url`. The design draws no visible address unless there is
   *  nothing else to put on the source line. */
  url?: string | null;
  /** Overrides the whole title, for a caller that is not a `note_sources`
   *  row — the `/science` index's `FROM THE RECIPES` list. */
  title?: ReactNode;
  /** Overrides the computed source line. Segments, not a sentence. */
  source?: ReactNode[];
  /** An address inside the app. `url` is used for one that leaves it. */
  href?: string;
};

/**
 * F/Citation — a quiet code, a serif title and a mono source line.
 *
 * The title carries no underline. The design draws none anywhere, and WCAG
 * 1.4.1 asks for a second cue only where a link is distinguished from the
 * text AROUND it; this one is a whole line with no surrounding copy. It does
 * take `FOCUS_RING` — R-ACC-05 is not optional. A body link inside running
 * prose is the other case, and `markdown.tsx` underlines that one.
 */
export function Citation({
  code,
  work,
  part,
  accessedAt,
  url,
  title,
  source,
  href,
  className,
  ...props
}: CitationProps) {
  const address = url ? addressLabel(url) : null;

  /* The fallback chain. `usedAsTitle` stops the source line repeating
     whichever field the title borrowed. */
  const fallback = work ?? part ?? address ?? 'Untitled source';
  const heading = title ?? fallback;
  const usedAsTitle = title ? null : fallback;

  const segments =
    source ?? buildSource({ work, part, accessedAt, address, usedAsTitle });
  const hasCode = code !== undefined && code !== null && code !== '';

  const body = (
    <>
      {/* 14/21 at 360 and 15/23 at 1280 — both `leading-150`. Size and
          leading in one argument; TOKEN-MAP §4.3. */}
      <span className="w-full text-14 leading-150 shell:text-15 font-serif text-ink">
        {heading}
      </span>
      {/* R-CMP-14 again. The two runs are stacked flex items with no
          character between them, so a copy-paste reads "EscoffierConsulted
          · Not yet linked in the repository". */}
      {segments.length > 0 ? ' ' : null}
      {segments.length > 0 ? (
        /* One mono run, and each value its own element with an `aria-hidden`
           separator between them — the same treatment `mechanism.tsx` gives
           the conditions and `breadcrumb.tsx` gives the trail. The dot is
           U+00B7 and it inherits `f-ink-3` from the run. */
        <span className="w-full text-09 leading-170 shell:leading-normal font-mono tracking-label uppercase text-ink-3">
          {segments.map((segment, index) => (
            <Fragment key={index}>
              {index > 0 ? <span aria-hidden="true">{' · '}</span> : null}
              <span>{segment}</span>
            </Fragment>
          ))}
        </span>
      ) : null}
    </>
  );

  return (
    <div
      className={cn(
        'flex h-fit w-full shrink-0 flex-row items-start gap-3 shell:gap-4',
        className,
      )}
      {...props}
    >
      {hasCode ? (
        /* 26px at 360, 34px at 1280. `f-ink-3`, and no tracking: the design
           draws none on this one run. */
        <span className="w-6.5 shell:w-8.5 shrink-0 text-10 leading-150 shell:leading-170 font-mono tabular-nums text-ink-3">
          {code}
        </span>
      ) : null}
      {/* R-CMP-14's real space: without it the row reads "[1]Archived
          research export" as one run. */}
      {hasCode ? ' ' : null}
      {href ? (
        <Link
          href={href}
          className={cn(
            'flex h-fit flex-1 basis-0 flex-col items-start gap-1 no-underline',
            FOCUS_RING,
          )}
        >
          {body}
        </Link>
      ) : url ? (
        /* An address that leaves the app is a plain anchor, never `Link`. */
        <a
          href={url}
          rel="noreferrer nofollow"
          target="_blank"
          className={cn(
            'flex h-fit flex-1 basis-0 flex-col items-start gap-1 no-underline',
            FOCUS_RING,
          )}
        >
          {body}
        </a>
      ) : (
        <div className="flex h-fit flex-1 basis-0 flex-col items-start gap-1">
          {body}
        </div>
      )}
    </div>
  );
}

/**
 * The source line the design draws, and what it does when a field is empty.
 *
 * Both rows on `science-1280.html` are covered by one rule, and the rule is
 * that an address takes the place of a consultation note:
 *
 *   [1]  Archived research export
 *        DOCS/RECIPE_TINKERING/DEMI-GLAZE-RESEARCH.MD
 *   [2]  Escoffier, Le Guide Culinaire — espagnole and demi-glace
 *        CONSULTED · NOT YET LINKED IN THE REPOSITORY
 *
 * `[1]` has an address and no date, and draws the address alone. `[2]` has a
 * work and neither of the other two, and says so in the design's own words —
 * so a source WITH a title and no address does draw
 * `CONSULTED · NOT YET LINKED IN THE REPOSITORY`. That is the design's line
 * and it is kept.
 *
 * THE ONE ROW IT IS NOT DRAWN FOR IS THE EMPTY ONE. Every field on
 * `note_sources` is nullable (`src/lib/queries/read.ts`), so a row with no
 * work, no part, no date and no address is representable — and CONSULTED is
 * a claim about something a person did. Printing it under `Untitled source`
 * asserts a consultation the repository never recorded. The function returns
 * nothing for that row and it draws as a title on its own, which is the same
 * rule F/Mechanism applies to its conditions.
 */
function buildSource({
  work,
  part,
  accessedAt,
  address,
  usedAsTitle,
}: {
  work?: string | null;
  part?: string | null;
  accessedAt?: string | null;
  address: string | null;
  usedAsTitle: string | null;
}): ReactNode[] {
  if (!work && !part && !accessedAt && !address) return [];

  const segments: ReactNode[] = [];

  if (part && part !== usedAsTitle) segments.push(part);
  if (accessedAt) segments.push(`Consulted ${citationDate(accessedAt)}`);

  if (address) {
    if (address !== usedAsTitle) segments.push(address);
  } else {
    if (!accessedAt) segments.push('Consulted');
    segments.push('Not yet linked in the repository');
  }

  return segments;
}
