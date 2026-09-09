/**
 * F/Footnote, F/Warning and F/Note reference — the note apparatus.
 *
 * Read from `design/exports/foundations.html`, Plate II section F.4, "Notes —
 * D's three tiers, E's footnote apparatus":
 *   F/Footnote        line 2248
 *   Caution           line 2288  (NOT a separate component — see below)
 *   F/Warning         line 2330
 *   F/Note reference  line 2371
 * Corroborated on the recipe screen (`recipe-1280.html:3155`, `:3197`,
 * `:3221`), on `/science` (`science-1280.html:1495`), on the batch log
 * (`batch-logs-1280.html:2501`, `:2544`) and on Plate III's two database
 * states (`plates-3-4.html:1047`).
 *
 * R-CMP-06 AND WHAT THE DESIGN ACTUALLY DRAWS. F.4's caption is the ruling:
 * "The severity ranking is D's and it stays: WARNING means a person can be
 * hurt, CAUTION means the work can be spoiled, NOTE is information. The
 * delivery is E's: numbered, referenced from the step, collected at the
 * foot. Six of the eight kinds carry no colour at all."
 *
 * So the eight kinds are NOT eight colours. The design draws THREE severity
 * treatments and lets a two-part text run, `SEVERITY · KIND`, carry the
 * kind. `noteKindLabel` and `noteSeverity` in `./mark.tsx` are that map, and
 * they read `NOTE_KIND_LABELS` in `src/lib/site.ts`, which is the one list
 * of kinds. Nothing here holds a second one.
 *
 * THE CAUTION TIER IS A TONE, NOT A COMPONENT. `Caution` at line 2288 is
 * byte-identical to `F/Footnote` in geometry. Exactly two colours move: the
 * `Num` and the `Kind` go `f-caution`. The title stays `f-ink` and the body
 * stays `f-ink-2`. F/Footnote therefore takes a `severity`, the same shape
 * `Notice` and `MarkQuiet` already use.
 *
 * F/WARNING IS A COMPONENT. Three things separate it from the other two
 * tiers, and all three are structural rather than a colour swap: it is the
 * only tier with a ground and a 3px rule; its kind label tracks at 1.5px
 * where every other kind label in the system tracks at 1.2px; and it is the
 * only tier that colours its title. It also drops the second half of the
 * label and reads `WARNING` alone, eleven times.
 *
 * THE `Num` IS NOT ALWAYS A NUMBER. Three instances carry a literal `!`
 * where the note has no ordinal — `access-1280.html:748`,
 * `plates-3-4.html:1053` (R-STA-02) and `science-1280.html:1502`. The marker
 * is therefore a `ReactNode`, and F/Warning defaults it to `!`.
 *
 * A BESPOKE KIND STRING IS LEGAL. `batch-logs-1280.html:2544` draws the
 * warning tier with the kind label `WHAT WENT WRONG`. Neither component
 * validates the label against the eight kinds.
 *
 * Server components. Nothing here has state or touches a browser API.
 */

import { Fragment } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import type { NoteSeverity } from './mark';

/*
 * The row every tier shares: a 26px gutter, a 16px gap and a flowing column.
 * `w-6.5` is 26px — off BUILD-PLAN §2.3's gap scale, so it is written as a
 * fractional multiple of `--spacing`, which is pinned to 4px. See the note
 * in `mark.tsx` and TOKEN-MAP §8.1.
 */
const ROW = 'flex h-fit w-full shrink-0 flex-row items-start gap-4';

/** The 26px gutter. 12px Geist Mono; R-CON-06 wants tabular figures on it. */
const MARKER = 'w-6.5 shrink-0 text-12 leading-normal font-mono tabular-nums';

const COL = 'flex h-fit flex-1 basis-0 flex-col items-start gap-1';

/*
 * The head is a ROW at 1280 and a COLUMN at 360.
 * `m360-access-science.html:2992` draws `flex flex-col gap-[ 4px ]`, so the
 * kind stacks above the title on a phone. The narrow form is the default and
 * `shell:` (1080px, TOKEN-MAP §8.2) opens it out.
 */
const HEAD = cn(
  'flex h-fit w-full shrink-0 flex-col gap-1',
  'shell:flex-row shell:items-center shell:gap-3',
);

/*
 * 9px Geist Mono. The tracking differs by tier and is passed in.
 *
 * The design carries `[ white-space:nowrap ]` on this node and on the title.
 * It is an export artefact and it is NOT shipped: a kind label and a title
 * have to be free to wrap at 360 rather than push the page sideways
 * (R-STA-09). M3 made the same call in `notice.tsx` and `breadcrumb.tsx`.
 */
const KIND = 'text-09 leading-normal font-mono uppercase';

/*
 * 16px Newsreader at weight 500. `text-[ 16px ]/[ normal ]` at 1280 and
 * `text-[ 16px ]/[ 21px ]` at 360, which is 1.31 and therefore `leading-130`.
 *
 * The size and its leading are in ONE argument. tailwind-merge groups a
 * leading with the font size, so a later size deletes an earlier leading,
 * and every `--text-NN--line-height` in this theme is the keyword `normal` —
 * the fallback is the face, not a value in the table. TOKEN-MAP §4.3.
 */
/*
 * `w-full` only below the breakpoint. The head stacks there, so the title
 * has to claim the row. Above it the head is a flex row, and `w-full` made
 * the title's flex base the whole head width; that squeezed the kind label
 * below its own max-content and wrapped `NOTE · OBSERVATION` onto two
 * lines. The design draws it on one — `Kind` carries `white-space: nowrap`
 * and its `Title` declares no width at all. `table-row.tsx` solves the same
 * shape the same way.
 */
const TITLE =
  'w-full shell:w-auto text-16 leading-130 shell:leading-normal font-serif font-medium';

/** 14px over 24px Geist. The body NEVER takes the tier's tone colour. */
const TEXT = 'w-full text-14 leading-170 font-sans text-ink-2';

/* ── F/Footnote ────────────────────────────────────────────────────────── */

/**
 * The two tiers this component draws. `warning` is F/Warning below; it is
 * excluded here rather than silently rendered as a note.
 */
export type FootnoteSeverity = Exclude<NoteSeverity, 'warning'>;

const FOOTNOTE_TONES = {
  /** `NOTE · OBSERVATION`. `#2B1F1C` marker, `#79655F` kind. */
  note: { marker: 'text-ink', kind: 'tracking-label text-ink-3' },
  /** `CAUTION · SUBSTITUTION`. Both go `#8A5A12`; the title does not move. */
  caution: { marker: 'text-caution', kind: 'tracking-label text-caution' },
} as const satisfies Record<FootnoteSeverity, { marker: string; kind: string }>;

export type FootnoteProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  severity?: FootnoteSeverity;
  /** The 26px gutter: an ordinal, or the literal `!` where there is none. */
  marker?: ReactNode;
  /** `NOTE · OBSERVATION`. Pass `noteKindLabel(kind)` from `./mark`. */
  kind?: ReactNode;
  /** R-STA-05: `notes.title` is nullable, and the head then holds the kind
   *  alone. The design draws no title-less footnote; this is the fallback. */
  title?: ReactNode;
  /** The body. A string takes the design's 14/24 Geist; a `Markdown` sets
   *  its own type per element and this wrapper leaves it alone. */
  children?: ReactNode;
};

/**
 * F/Footnote — the NOTE and CAUTION tiers. No ground, no rule, no radius.
 */
export function Footnote({
  severity = 'note',
  marker,
  kind,
  title,
  children,
  className,
  ...props
}: FootnoteProps) {
  const tone = FOOTNOTE_TONES[severity];
  const hasMarker = marker !== undefined && marker !== null && marker !== '';

  return (
    <div className={cn(ROW, 'py-2.5', className)} {...props}>
      {hasMarker ? (
        <span className={cn(MARKER, tone.marker)}>{marker}</span>
      ) : null}
      {/* The same real space R-CMP-14 asks for between the kind and the
          title below: a flex gap is invisible to `textContent`, so the
          gutter would otherwise read "1NOTE · OBSERVATION" as one word. */}
      {hasMarker ? ' ' : null}
      <div className={COL}>
        {kind || title ? (
          <span className={HEAD}>
            {kind ? <span className={cn(KIND, tone.kind)}>{kind}</span> : null}
            {/* A flex gap is invisible to `textContent`, which is what
                R-CMP-14 exists for: without this space the head reads
                "NOTE · OBSERVATIONEquipment and expected yield" to a screen
                reader and to a copy-paste. A whitespace-only text node is
                not rendered as a flex item, so nothing moves. */}
            {kind && title ? ' ' : null}
            {title ? (
              <span className={cn(TITLE, 'text-ink')}>{title}</span>
            ) : null}
          </span>
        ) : null}
        {children ? <div className={TEXT}>{children}</div> : null}
      </div>
    </div>
  );
}

/* ── F/Warning ─────────────────────────────────────────────────────────── */

/*
 * One four-value `border-width` and an explicit `border-style`, exactly as
 * the design writes it and exactly as `notice.tsx` does. The form was also
 * forced while Tailwind's preflight was OFF, up to M7: nothing then set a
 * global border style, so a lone `border-l-3` drew nothing at all and
 * `border-solid` beside it gave the other three sides the CSS initial
 * `medium` width. The preflight's `* { border: 0 solid }` closes that trap
 * since M7 and the form stays, because it is the one the export draws.
 */
const WARNING_RULE = '[border-style:solid] [border-width:0px_0px_0px_3px]';

export type WarningProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  /** Defaults to `!`, which is what the design draws on an unnumbered one. */
  marker?: ReactNode;
  /** Defaults to `WARNING`. `WHAT WENT WRONG` is drawn on a batch log. */
  kind?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
};

/**
 * F/Warning — the WARNING tier, and C-12's "read failed" state (R-STA-02).
 *
 * The only tier with a ground and a rule, the only one whose kind label
 * tracks at 1.5px, and the only one that colours its title.
 */
export function Warning({
  marker = '!',
  kind = 'WARNING',
  title,
  children,
  className,
  ...props
}: WarningProps) {
  const hasMarker = marker !== undefined && marker !== null && marker !== '';

  return (
    <div
      className={cn(
        ROW,
        /* `14px 16px`. 14px is off the gap scale; see the note above. */
        'px-4 py-3.5',
        'bg-warn-wash border-l-warn',
        WARNING_RULE,
        className,
      )}
      {...props}
    >
      {hasMarker ? (
        <span className={cn(MARKER, 'text-warn')}>{marker}</span>
      ) : null}
      {hasMarker ? ' ' : null}
      <div className={COL}>
        {kind || title ? (
          <span className={HEAD}>
            {kind ? (
              <span className={cn(KIND, 'tracking-spine text-warn')}>
                {kind}
              </span>
            ) : null}
            {kind && title ? ' ' : null}
            {title ? (
              <span className={cn(TITLE, 'text-warn')}>{title}</span>
            ) : null}
          </span>
        ) : null}
        {children ? <div className={TEXT}>{children}</div> : null}
      </div>
    </div>
  );
}

/* ── F/Note reference ──────────────────────────────────────────────────── */

export type NoteReferenceProps = Omit<
  HTMLAttributes<HTMLSpanElement>,
  'children'
> & {
  /** The design draws the literal word `NOTES`, thirteen times out of
   *  thirteen. */
  label?: ReactNode;
  /** The ordinals this step points at. Drawn as `1`, or as `1 · 3`. */
  numbers: ReactNode[];
};

/**
 * F/Note reference — the step-level pointer into the apparatus.
 *
 * An 8px `f-ink-3` label and a 10px accent run, eight pixels apart. The `·`
 * between two ordinals lives INSIDE the accent run and takes the accent
 * colour; it is not F/Breadcrumb's `f-hair` hairline dot, which is 1.20:1
 * and legal only between two labelled crumbs.
 *
 * Renders nothing when it points at nothing (R-STA-05).
 */
export function NoteReference({
  label = 'NOTES',
  numbers,
  className,
  ...props
}: NoteReferenceProps) {
  if (numbers.length === 0) return null;

  return (
    <span
      className={cn(
        'inline-flex h-fit w-fit shrink-0 flex-row items-center gap-2',
        className,
      )}
      {...props}
    >
      {label ? (
        <span className="text-08 leading-normal font-mono tracking-label uppercase text-ink-3">
          {label}
        </span>
      ) : null}
      {/* R-CMP-14's rule again: a real space, so `textContent` does not read
          "NOTES1 · 3". */}
      {label ? ' ' : null}
      {/* No tracking on this run. The design draws none, and it is the one
          mono run in the apparatus that carries none. */}
      <span className="text-10 leading-normal font-mono tabular-nums text-accent">
        {numbers.map((number, index) => (
          <Fragment key={index}>
            {index > 0 ? <span aria-hidden="true">{' · '}</span> : null}
            <span>{number}</span>
          </Fragment>
        ))}
      </span>
    </span>
  );
}
