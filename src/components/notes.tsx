/**
 * C-10 — the note block, rebuilt onto the design's note apparatus.
 *
 * R-CMP-06 asks each of the eight note kinds for a different visual
 * treatment. The design's own answer is Plate II section F.4, whose caption
 * is the ruling: "The severity ranking is D's and it stays: WARNING means a
 * person can be hurt, CAUTION means the work can be spoiled, NOTE is
 * information. The delivery is E's: numbered, referenced from the step,
 * collected at the foot. Six of the eight kinds carry no colour at all."
 *
 * So the eight kinds are not eight colours. They are eight distinct labels
 * riding on three drawn treatments, plus a whole component of their own for
 * the eighth:
 *
 *   | Kind         | Component    | Treatment                        |
 *   | ------------ | ------------ | -------------------------------- |
 *   | observation  | F/Footnote   | note     — `NOTE · OBSERVATION`  |
 *   | research     | F/Footnote   | note     — `NOTE · RESEARCH`     |
 *   | result       | F/Footnote   | note     — `NOTE · RESULT`       |
 *   | substitution | F/Footnote   | caution  — `CAUTION · …`         |
 *   | idea         | F/Footnote   | caution  — `CAUTION · IDEA`      |
 *   | correction   | F/Footnote   | caution  — `CAUTION · CORRECTION`|
 *   | warning      | F/Warning    | warning  — `WARNING` alone       |
 *   | science      | F/Mechanism  | accent   — a different block     |
 *
 * Five of those eight are drawn in the exports; `research`, `correction` and
 * `science` are read off the ranking in the caption. The labels come from
 * `noteKindLabel` in `./f/mark`, which reads `NOTE_KIND_LABELS` in
 * `src/lib/site.ts`. There is no second list of kinds in this file.
 *
 * WHY SCIENCE IS NOT A FOOTNOTE. §10.2.3 of the specification says the Notes
 * block "holds all note kinds except science", and the design draws a
 * science note as F/Mechanism on `/science` — an accent `Mn` code, a serif
 * name at weight 400, and a body set in the serif. Routing it here also
 * closes a live bug: `noteKindLabel('science')` returns `NOTE · SCIENCE`, a
 * string the design never draws. It is never rendered now, because a science
 * note never reaches a footnote.
 *
 * THE NUMBERS. The apparatus is numbered — that is the whole of "E's
 * footnote apparatus" — so `NoteList` supplies the ordinal rather than each
 * caller. Notes count `1, 2, 3…` across the note and caution and warning
 * tiers together, exactly as Plate II draws them; science notes count
 * `M1, M2…`, which is a position within the recipe (D-05).
 *
 * THE SOURCES. The design draws no source under a footnote — `note_sources`
 * is drawn as F/Citation, and only on `/science`. They are kept here, in
 * that same F/Citation row, because R-SCR-42 asks for the work, the part and
 * the date wherever a citation is shown, and dropping them would take
 * recorded data off three live screens. `science-1280.html:1495` proves the
 * two families compose in one flat block, so this invents no treatment.
 *
 * Server components.
 */

import type { HTMLAttributes } from 'react';

import type { NoteView } from '@/lib/queries/read';
import { cn } from '@/lib/utils';

import { Citation } from './f/citation';
import { noteKindLabel, noteSeverity } from './f/mark';
import { Mechanism } from './f/mechanism';
import { Footnote, Warning } from './f/note';
import { Markdown } from './markdown';

export type NoteBlockProps = HTMLAttributes<HTMLElement> & {
  note: NoteView;
  /**
   * The gutter. `NoteList` numbers the apparatus; a lone note passes its own
   * or nothing at all, and the gutter then collapses rather than drawing an
   * empty 26px column.
   */
  marker?: string;
};

/** One note, in whichever of the three components its kind belongs to. */
export function NoteBlock({
  note,
  marker,
  className,
  ...props
}: NoteBlockProps) {
  const science = note.kind === 'science';
  const severity = noteSeverity(note.kind);

  /* `inherit`, not `note` or `science`: F/Footnote and F/Mechanism each set
     the body role on the slot this lands in, and F/Mechanism's steps from
     14px to 15px at `shell:`. Writing the tone again here would pin the
     narrow value at every width. */
  const body = <Markdown tone="inherit">{note.body}</Markdown>;

  return (
    <article
      /* `data-kind` is not decoration: it is the one hook that says which of
         the eight kinds a row is, for a test and for a reader inspecting the
         page. The old build carried it and it stays. */
      data-kind={note.kind}
      className={cn('flex w-full flex-col gap-4', className)}
      {...props}
    >
      {science ? (
        /* `conditions` is R-SCR-41 and it is not decoration. `NoteView`
           carries it from all four note-reading queries, `add_note` accepts
           it alongside `ingredientSlug` and `experimentSlug`, and this
           block is the renderer for /ingredients/[slug] and
           /batch-logs/[log] — so dropping the prop here loses a value an
           agent was told to send and shown a success for. F/Mechanism draws
           nothing for an empty list, which is every note on the other seven
           kinds and every science note nobody has described yet. */
        <Mechanism code={marker} name={note.title} conditions={note.conditions}>
          {body}
        </Mechanism>
      ) : severity === 'warning' ? (
        <Warning marker={marker} title={note.title}>
          {body}
        </Warning>
      ) : (
        <Footnote
          severity={severity}
          marker={marker}
          kind={noteKindLabel(note.kind)}
          title={note.title}
        >
          {body}
        </Footnote>
      )}

      {note.sources.length > 0 ? (
        /* The design's REFERENCES block sets its citations twenty pixels
           apart, at the same left edge as the footnote above them. */
        <div className="flex w-full flex-col gap-5">
          {note.sources.map((source, index) => (
            <Citation
              key={index}
              code={`[${index + 1}]`}
              work={source.title}
              part={source.citation}
              accessedAt={source.accessedAt}
              url={source.url}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export type NoteListProps = HTMLAttributes<HTMLDivElement> & {
  notes: NoteView[];
};

/**
 * C-10 — the numbered apparatus. Sixteen pixels between entries, which is
 * the gap Plate II's `Body` and the recipe screen's `Centre` both draw.
 *
 * Renders nothing when there is nothing to render; a caller that wants a
 * sentence instead uses `F/Empty` (R-STA-03).
 */
export function NoteList({ notes, className, ...props }: NoteListProps) {
  if (notes.length === 0) return null;

  let ordinal = 0;
  let mechanism = 0;

  return (
    <div className={cn('flex w-full flex-col gap-4', className)} {...props}>
      {notes.map((note) => {
        let marker: string;
        if (note.kind === 'science') {
          mechanism += 1;
          marker = `M${mechanism}`;
        } else {
          ordinal += 1;
          marker = String(ordinal);
        }
        return <NoteBlock key={note.id} marker={marker} note={note} />;
      })}
    </div>
  );
}
