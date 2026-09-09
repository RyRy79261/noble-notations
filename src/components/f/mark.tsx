/**
 * F/Mark and F/Mark quiet — the two badges.
 *
 * Read from `design/exports/foundations.html`, Plate II section F.2 "Four
 * species of mark", `data-pencil-name="F/Mark"` at line 2000 and
 * `data-pencil-name="F/Mark quiet"` at line 2011. Corroborated across all
 * eighteen exports: 63 F/Mark instances and 15 F/Mark quiet instances.
 *
 * The two share their geometry byte for byte — 4px over 9px of padding,
 * no gap, 9px Geist Mono at 1.2px tracking, no border, no radius. Only the
 * ground and the text colour differ. F.2's own caption says why: "F takes
 * E's method and lets exactly one of them — the mark — stay solid, because
 * a kind badge has to shout a little."
 *
 * R-CMP-07. The four recipe kinds are NOT four colours. Every one of the 63
 * F/Mark instances in the exports is drawn with one fill and one text
 * colour; PREPARATION, RESEARCH, BATCH LOG and RECIPE are the same two
 * hexes. The design tells the kinds apart by the word alone, so this file
 * gives F/Mark a label and no palette. Inventing a colour per kind would
 * break R-BLD-02.
 *
 * R-CMP-06. The eight note kinds are not a badge at all. F.4's caption is
 * explicit: "Six of the eight kinds carry no colour at all." The design
 * draws the note kind as a two-part text run, `SEVERITY · KIND`, in three
 * severity tones. `noteKindLabel` and `NOTE_SEVERITY_TONE` below are that
 * map, so eight distinct strings ride on three drawn treatments. M4's
 * F/Footnote and F/Warning read them.
 *
 * A server component. It has no state and no browser API.
 */

import type { HTMLAttributes, ReactNode } from 'react';

import { KIND_LABELS, NOTE_KIND_LABELS } from '@/lib/site';
import { cn } from '@/lib/utils';

/*
 * The shared geometry. `px-2.25` and `py-1` are the design's `4px 9px`.
 *
 * Nine pixels is off BUILD-PLAN §2.3's gap scale, which declares only
 * multiples of four below 44. Every off-scale padding in this milestone is
 * written as a FRACTIONAL MULTIPLE OF `--spacing`, never as an arbitrary
 * pixel length: `--spacing` is pinned to 4px in `theme.css`, so 9px is
 * `2.25` and the value still comes from the token the way the rest of the
 * system does. The off-scale ones stay just as greppable as an arbitrary
 * value would be — a decimal point in a spacing utility means exactly
 * "off the four-pixel grid", so
 *
 *   grep -rn '\b[pwmh][xybtlre]\?-[0-9]*\.[0-9]' src/
 *
 * finds all of them when the designer settles the scale. See TOKEN-MAP §8.
 *
 * `uppercase` rather than uppercase source data: KIND_LABELS holds "Recipe"
 * and the design draws "RECIPE". The case belongs to the badge.
 */
const MARK_BASE = cn(
  'inline-flex h-fit w-fit shrink-0 items-center',
  'px-2.25 py-1',
  'text-09 font-mono tracking-label uppercase whitespace-nowrap',
);

export type MarkProps = HTMLAttributes<HTMLSpanElement> & {
  /** A key of KIND_LABELS. Ignored when `children` is given. */
  kind?: string;
  children?: ReactNode;
};

/** The label the design draws for a recipe kind. Reads `KIND_LABELS`. */
export function recipeKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

/**
 * F/Mark — the loud kind badge. One ground, one text colour, no radius.
 *
 * Renders nothing when it has neither a kind nor children (R-STA-05: almost
 * every field can be empty).
 */
export function Mark({ kind, children, className, ...props }: MarkProps) {
  const label = children ?? (kind ? recipeKindLabel(kind) : null);
  if (label === null || label === undefined || label === '') return null;

  return (
    <span
      className={cn(MARK_BASE, 'bg-accent text-on-accent', className)}
      {...props}
    >
      {label}
    </span>
  );
}

/**
 * The tones of F/Mark quiet.
 *
 * `neutral`, `faint` and `warn` are drawn. `caution` is not: the design
 * carries CAUTION as a bare text run in the footnote apparatus and never as
 * a badge. It is added here so R-CMP-06 can put all three severities on one
 * shape. `f-caution` on `f-desk` is 5.08:1 light and 9.75:1 dark, so it
 * meets R-ACC-01 and it invents no colour. Delete it if the designer would
 * rather the caution note stay a bare run.
 */
const QUIET_TONES = {
  /** `#F3EDE5` ground, `#2B1F1C` text. SIXTH REVISION, CUISINE, TAG, INDEX. */
  neutral: 'bg-desk text-ink',
  /** `#F3EDE5` ground, `#79655F` text. VIA IMPORT, on a provenance row. */
  faint: 'bg-desk text-ink-3',
  /** `#FBEDE9` ground, `#C42B1C` text. THIRD REVISION, on a superseded one. */
  warn: 'bg-warn-wash text-warn',
  /** Not drawn. See the note above. */
  caution: 'bg-desk text-caution',
} as const;

export type MarkQuietTone = keyof typeof QUIET_TONES;

export type MarkQuietProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: MarkQuietTone;
  children?: ReactNode;
};

/**
 * F/Mark quiet — the recessed badge. The revision number wears this one.
 */
export function MarkQuiet({
  tone = 'neutral',
  children,
  className,
  ...props
}: MarkQuietProps) {
  if (children === null || children === undefined || children === '')
    return null;

  return (
    <span className={cn(MARK_BASE, QUIET_TONES[tone], className)} {...props}>
      {children}
    </span>
  );
}

/* ── The note apparatus (R-CMP-06) ─────────────────────────────────────── */

/**
 * The three severities the design draws. F.4's caption ranks them:
 * "WARNING means a person can be hurt, CAUTION means the work can be
 * spoiled, NOTE is information."
 */
export type NoteSeverity = 'note' | 'caution' | 'warning';

/**
 * Which severity each note kind carries.
 *
 * The kinds themselves come from `NOTE_KIND_LABELS` in `src/lib/site.ts`.
 * This map adds one attribute to them; it is not a second list of kinds.
 * Five entries are drawn in the exports — `NOTE · OBSERVATION`,
 * `NOTE · RESULT`, `CAUTION · SUBSTITUTION`, `CAUTION · IDEA` and `WARNING`
 * alone. Two are a reading of the ranking above rather than a drawn fact:
 * `research` is information, and `correction` says an earlier statement was
 * wrong, so working from the uncorrected text spoils the batch.
 *
 * `science` is the eighth kind in §9.2 of the specification. Its label was
 * missing from `NOTE_KIND_LABELS` and the builder reached it only through
 * the raw-key fallback below, which happened to render the right string;
 * `src/lib/site.ts` now carries the label, so R-CMP-06 no longer depends on
 * a fallthrough.
 */
const SEVERITY_BY_KIND: Record<string, NoteSeverity> = {
  observation: 'note',
  research: 'note',
  result: 'note',
  science: 'note',
  substitution: 'caution',
  idea: 'caution',
  correction: 'caution',
  warning: 'warning',
};

/** The severity of a note kind. An unknown kind is information. */
export function noteSeverity(kind: string): NoteSeverity {
  return SEVERITY_BY_KIND[kind] ?? 'note';
}

/**
 * The label the design draws for a note kind: `SEVERITY · KIND`.
 *
 * A warning drops the second half and reads `WARNING` alone — the design
 * draws it that way eleven times, and it also colours the note's title,
 * which is what makes F/Warning a component of its own in M4.
 */
export function noteKindLabel(kind: string): string {
  const severity = noteSeverity(kind);
  if (severity === 'warning') return 'WARNING';
  const label = (NOTE_KIND_LABELS[kind] ?? kind).toUpperCase();
  return `${severity.toUpperCase()} · ${label}`;
}

/**
 * The F/Mark quiet tone for each severity. M4's F/Footnote reads this so
 * the eight kinds land on the three treatments the design draws.
 */
export const NOTE_SEVERITY_TONE: Record<NoteSeverity, MarkQuietTone> = {
  note: 'faint',
  caution: 'caution',
  warning: 'warn',
};
