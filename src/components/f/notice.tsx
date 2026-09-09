/**
 * F/Notice and F/Empty — the two page-level statements.
 *
 * Read from `design/exports/foundations.html`, Plate II section F.6:
 * `data-pencil-name="F/Notice"` at line 2911 and
 * `data-pencil-name="F/Empty"` at line 2929.
 *
 * F/Notice is drawn in three tones at one geometry — 20 accent, 1 warn
 * (`recipe-revision-1280.html:293`, "YOU ARE READING THE THIRD REVISION OF
 * SIX") and 1 neutral (`plates-3-4.html:1007`, "THE REPOSITORY IS NOT
 * AVAILABLE"). Only the ground, the left rule and the title colour change.
 * The body text is `f-ink-2` in all three; it never takes the tone colour.
 *
 * A WARNING IS NOT A FOURTH TONE. F/Warning (Plate II line 2330) is a row
 * and not a column: it carries a 26px number gutter, a 16px gap, a kind
 * label at 1.5px rather than 1.2px, and a title coloured `f-warn`. It is a
 * numbered note in the footnote apparatus; F/Notice is a statement of policy
 * about the page. F/Warning is M4's. Do not fold it into this file.
 *
 * C-12's two states map onto the two components exactly: "not configured" is
 * a neutral F/Notice, "read failed" is an F/Warning.
 *
 * Server components.
 */

import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/*
 * The left rule is written as an arbitrary `border-style` and a single
 * four-value `border-width`, rather than as a per-side width utility. Two
 * reasons. The design writes exactly those two declarations, so this reads
 * back against the export. And Tailwind's preflight is OFF until M7, so
 * nothing sets a global border style: a lone three-pixel left width would
 * draw nothing at all, and adding `border-solid` to fix that would instead
 * give the other three sides the CSS initial `medium` width. One declaration
 * for all four widths is the only form with no trap in it.
 */
const NOTICE_RULE = '[border-style:solid] [border-width:0px_0px_0px_3px]';

const NOTICE_TONES = {
  /** 20 instances. The default, and the only tone drawn outside two pages. */
  accent: 'bg-accent-wash border-l-accent',
  /** 1 instance. The superseded revision. */
  warn: 'bg-warn-wash border-l-warn',
  /** 1 instance. The repository is not available. */
  neutral: 'bg-desk border-l-ink-3',
} as const;

const NOTICE_TITLE_TONES = {
  accent: 'text-accent',
  warn: 'text-warn',
  /** The neutral tone puts `f-ink` on the title, not `f-ink-3`. */
  neutral: 'text-ink',
} as const;

export type NoticeTone = keyof typeof NOTICE_TONES;

export type NoticeProps = HTMLAttributes<HTMLDivElement> & {
  tone?: NoticeTone;
  /** The 9px mono micro-label above the sentence. */
  title?: ReactNode;
  children?: ReactNode;
};

/**
 * F/Notice — a ground, a 3px left rule and no radius. Never a full border.
 */
export function Notice({
  tone = 'accent',
  title,
  children,
  className,
  ...props
}: NoticeProps) {
  return (
    <div
      className={cn(
        'flex h-fit w-full shrink-0 flex-col items-start gap-1',
        /* `15px 17px` — both off the gap scale. See the note in mark.tsx. */
        'px-4.25 py-3.75',
        NOTICE_RULE,
        NOTICE_TONES[tone],
        className,
      )}
      {...props}
    >
      {title ? (
        /* The design carries a nowrap declaration here. It is an export
           artefact and it is not shipped: a title long enough to wrap must
           wrap at 360 rather than push the page sideways (R-STA-09). */
        <span
          className={cn(
            'text-09 font-mono tracking-label uppercase',
            NOTICE_TITLE_TONES[tone],
          )}
        >
          {title}
        </span>
      ) : null}
      {children ? (
        /* 14px over 24px. The size and its leading go in ONE argument, or
           tailwind-merge drops the leading with the next size it meets —
           TOKEN-MAP.md §4.3. This is one of only two places in M3 where a
           leading is not `normal`. */
        <div className="w-full text-14 leading-170 font-sans text-ink-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/* ── F/Empty ───────────────────────────────────────────────────────────── */

export type EmptyProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /**
   * R-STA-04. When this is set the sentence is written for you, in the exact
   * words `src/components/filterable-groups.tsx` already ships, curly quotes
   * and all, so the two agree while both are on the site.
   */
  query?: string;
  /** R-STA-03. One sentence, in the design's voice. */
  children?: ReactNode;
};

/**
 * F/Empty — one line of italic Newsreader, centred, on nothing.
 *
 * ONE KIND. Seven instances in the exports, one class string, and only the
 * sentence changes: "No processes recorded yet.", "Nothing matches
 * “szechuan”.", "Nothing else answered all six conditions. Drop the
 * exclusion and two more recipes appear." There is no icon, no title, no
 * action and no separate "no results" against "nothing yet" treatment.
 *
 * The design's nowrap declaration on the sentence is NOT shipped. It is
 * the artefact that would put a long empty state off the side of a 360
 * screen and fail `pnpm audit:ui`.
 *
 * `40px 24px` is the one padding in this milestone that is entirely on
 * BUILD-PLAN §2.3's gap scale.
 */
export function Empty({ query, children, className, ...props }: EmptyProps) {
  const sentence = children ?? (query ? <>Nothing matches “{query}”.</> : null);
  if (sentence === null || sentence === undefined) return null;

  return (
    <div
      className={cn(
        'flex h-fit w-full shrink-0 flex-col items-center justify-center gap-2',
        'px-6 py-10',
        className,
      )}
      {...props}
    >
      {/* The design's `F/Empty > Text` is left-aligned. The parent centres
          the block, which is identical for the one-line sentence the design
          draws and rags right for a sentence that wraps, as the design
          would. */}
      <p className="m-0 text-19 font-serif text-ink-3 italic">{sentence}</p>
    </div>
  );
}
