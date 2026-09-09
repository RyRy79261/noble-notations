/**
 * F/Mass flow — FIG. 1, the weight of the food at each stage.
 *
 * Read from `design/exports/recipe-1280.html`,
 * `data-pencil-name="Figure 1 — Mass flow"` at line 393, and corroborated
 * against `recipe-revision-1280.html:434` and `recipe-1280-dark.html:404`.
 * The picture is `design/exports/png/zMdv1.png`, band 3 of the recipe
 * screen — between the hero and the control bar.
 *
 * Three children, and the design names all three: `Head` is the band label,
 * a hairline and a right-hand meta; `Flow` is the strip of stages with a
 * four-dot leader between each pair; `Guide` is the summary caption, held
 * between two rules that are ticked at each end.
 *
 * R-SCR-39 makes the figure a MAY, and scopes it to "a recipe that loses or
 * gains weight in a way the reader must plan for". Absence is therefore the
 * ordinary case, not a failure, and this component draws NOTHING at all
 * rather than a frame with no numbers in it — the same answer F/Mechanism
 * gives its own conditions row and `recipe-detail.tsx` gives the literature
 * block (R-SCR-38).
 *
 * ── WHY THE VALUE IS A FORMATTED STRING ────────────────────────────────
 *
 * The strip holds a mass (`10 kg`), a count (`25–30 pieces`) and two waits
 * (`24–48 h`, `13–15 d`) in one row. No `{ quantity, unit }` pair covers all
 * four, and a range does not fit in one of them at all. `read.ts` formats
 * each stage once — `formatStageValue` — so this figure and the control-bar
 * readout that restates it cannot disagree. It follows that nothing here is
 * scaled: the figure is the record of one weighed batch, and R-SCR-06 says a
 * wait never scales either.
 *
 * ── HOW THE STRIP FOLDS, AND WHY IT IS NOT HIDDEN AT 360 ───────────────
 *
 * The strip is a fixed 1002px at seven stages — 7 × 126 + 6 × 20 — and the
 * cells do not shrink; `w-[ 126px ] shrink-0` is what makes the strip sit
 * INSET from the two rules that bracket it, which is the first thing
 * `zMdv1.png` shows. That width fits the 1160px content column at 1280 and
 * fits nothing below about 1128, so `Flow` gets its own `overflow-x-auto`
 * box: R-STA-08 says a wide thing scrolls inside its own container, and
 * R-STA-09 says the page body never scrolls sideways. Both hold at every
 * width, and the audit's `page-overflow` check ignores a child of a
 * sideways scroller for exactly this reason.
 *
 * `justify-center` is on the INNER row and never on the scroll box itself.
 * That distinction is the whole of the audit's UNREACHABLE check: centring
 * overflow on the scroller puts the first cells off the START edge, where
 * `scrollWidth === clientWidth` and no scroll can reach them. `w-fit
 * min-w-full` sizes the row to its content when it overflows — so there is
 * no free space to centre and nothing moves — and to the full box when it
 * fits, so the strip centres exactly as drawn.
 *
 * The design draws no figure at 360 (`grep "MASS FLOW" recipe-360.html`
 * returns nothing) and puts the same fact in the control bar instead, as
 * `MAKES 4.5 KG DRIED FROM 10 KG RAW` — `recipe-360.html:298`, and the same
 * sentence again at 1280 in `recipe-1280.html:855`. That readout is
 * `src/components/scale.tsx:665`, which this milestone does not own, and it
 * still draws the short `Makes 4.5 kg`. Hiding the figure below `recipe:`
 * would therefore take the mass flow off a phone entirely rather than fold
 * it, so it is drawn at every width and scrolls. When scale.tsx grows the
 * readout, hiding this below 901 is one class.
 *
 * A server component. Presentation only — no state, no client boundary.
 */

import { Fragment } from 'react';
import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

import { FOCUS_RING } from './button';

export type MassFlowStage = {
  /**
   * `Raw`, `Cut`, `Dried`. Stored as written and uppercased by the
   * drawing, the same rule `Mark` follows for a kind and `Mechanism` for a
   * condition. R-STA-05: it can be absent, and the number and the value
   * then carry the cell on their own.
   */
  label?: string | null;
  /**
   * `10 kg`, `25–30 pieces`, `24–48 h`. Already formatted and already
   * carrying its unit — see the note above. Drawn verbatim and NEVER
   * uppercased: the labels are `RAW` and `CUT`, but `uppercase` on a value
   * would draw `10 KG` and `24–48 H`.
   */
  value?: string | null;
  /**
   * The stage that matters: the accent ground, the accent border and the
   * accent label. The design puts it on DRIED, the last stage, and it is
   * read from the row rather than derived from the position because
   * R-SCR-39 covers a dish that GAINS weight too, and that dish emphasises
   * a stage in the middle. `MassFlowStageView.emphasis` carries it.
   */
  emphasis?: boolean;
};

export type MassFlowProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  /**
   * The stages, in order, first to last. Fewer than two draws nothing:
   * R-SCR-39 describes the figure as "the weight of the food at each stage,
   * for example 10 kg raw to 4.5 kg dried", and a flow needs a from and a
   * to. One box centred in 1160px of paper is not that figure.
   */
  stages: MassFlowStage[];
  /**
   * The `Guide` caption, as separate values — `Net weight loss −55%`,
   * `Rate 4.21% per day`. The component draws the middle dot between them,
   * so a single figure gets no separator and an empty list drops the whole
   * row: the ticks and the rules exist only to bracket the caption, and
   * without it they are a bare hairline the design draws nowhere.
   */
  summary?: string[];
};

/* The band label and the right-hand meta. Both are the component's OWN
   words, not data, so `whitespace-nowrap` is safe here in a way it is not
   on a stage label: neither string can grow. */
const HEAD_LABEL = cn(
  'text-09 leading-normal font-mono tracking-spine uppercase',
  'whitespace-nowrap text-accent',
);

const HEAD_META = cn(
  'text-09 leading-normal font-mono tracking-label tabular-nums uppercase',
  'whitespace-nowrap text-ink-3',
);

/* The `Guide` caption. The same role as HEAD_META and one difference: no
   `whitespace-nowrap`, because this run IS data. Two summary figures at 360
   are 291px of a 328px column, and a third would push the page sideways
   (R-STA-09). Wrapping costs nothing — the chip is `w-fit` between two
   rules that give up their width first. */
const GUIDE_TEXT = cn(
  'text-09 leading-normal font-mono tracking-label tabular-nums uppercase',
  'text-ink-3',
);

/* `border border-solid` and not the four-value form: all four sides are
   1px, so `border` sets every width and `border-solid` every style with no
   side left holding the CSS initial `medium`. `border-solid` was forced
   while the preflight was off, because nothing then set a global
   `border-style` and a lone `border` drew nothing; since M7 the preflight's
   `* { border: 0 solid }` supplies the style, and the class stays because
   it is what the export writes — `ingredient-row.tsx:289` records the same.
   `box-border` is Tailwind's
   default, so the 126px is the border box and the strip arithmetic is
   exact. */
const CELL = cn(
  'flex w-31.5 shrink-0 flex-col items-start gap-2',
  'border border-solid px-2.75 py-3',
);

/* 9px, no tracking, and quiet. The ordinal is derived from the position and
   is never data. */
const CELL_NUMBER = cn(
  'shrink-0 text-09 leading-normal font-mono tracking-flat tabular-nums',
  'text-ink-3',
);

/* No `whitespace-nowrap` on either of the two data slots. The design
   carries one on every text node in the export and it is an artefact — the
   cell is a fixed 126px, so a two-word stage name with nowrap would run
   over the leader beside it. `items-stretch` on the strip is what makes a
   wrapped cell keep the band's height instead of breaking the row. */
const CELL_LABEL = cn(
  'min-w-0 text-10 leading-normal font-mono tracking-label uppercase',
);

const CELL_VALUE = cn(
  'w-full text-14 leading-normal font-mono tracking-flat tabular-nums',
  'text-ink',
);

/* One dot of the four-dot leader: 2px square in the quiet ink. It is a real
   element and not a `·` glyph and not a dashed border, because that is what
   the design draws. */
const DOT = 'h-0.5 w-0.5 shrink-0 bg-ink-3';

const RULE = 'h-px flex-1 basis-0 bg-hair';

const TICK = 'h-2.5 w-px shrink-0 bg-hair';

/**
 * F/Mass flow — a band label, a strip of numbered stages and a summary
 * caption held between two rules.
 */
export function MassFlow({
  stages,
  summary,
  className,
  ...props
}: MassFlowProps) {
  /* A stage with neither a name nor a figure is dropped before the strip is
     numbered, not drawn as an empty box. An empty box is a hole that says
     nothing, and the leaders on each side would then join two stages across
     a gap that is not one. This is the only case where the data is filtered
     rather than drawn; a stage that has ONE of the two keeps its cell. */
  const drawn = stages.filter(
    (stage) =>
      (stage.label != null && stage.label !== '') ||
      (stage.value != null && stage.value !== ''),
  );

  if (drawn.length < 2) return null;

  const figures = summary?.filter((entry) => entry !== '') ?? [];

  return (
    /* `m-0` is belt-and-braces since M7. The user agent gives a <figure> its
       own `1em 40px` margin and the preflight was off until then, so the
       class was load-bearing when it was written; the preflight's
       `* { margin: 0 }` now zeroes it as well. Kept, not deleted: every
       other box in this file writes its own spacing and a reader should not
       have to know which reset is doing the work. */
    <figure
      className={cn(
        'm-0 flex w-full shrink-0 flex-col items-start gap-4',
        className,
      )}
      {...props}
    >
      <figcaption className="flex w-full shrink-0 flex-row items-center gap-4">
        <span className={HEAD_LABEL}>Fig. 1 · Mass flow</span>{' '}
        {/* The rule between the label and the meta. It is decorative — §7 of
            TOKEN-MAP: a plain rule between two blocks carries no meaning, so
            WCAG 1.4.11 does not reach it. */}
        <span aria-hidden="true" className={RULE} />
        {/* There is no sheet count in the data and there is no requirement
            for one. The figure is one strip on one page, so "1 of 1" is
            always true and inventing a `sheets` concept would be a schema
            field with no reader. */}
        <span className={HEAD_META}>Sheet 1 of 1</span>
      </figcaption>{' '}
      {/* Three real spaces in this component sit between BLOCKS rather than
          inside a row, and they are the same R-CMP-14 fault one level out.
          `textContent` and a copy-paste ignore the box tree completely, so
          without them the figure reads `Sheet 1 of 101 Raw 10 kg02 Cut` —
          the meta's `1` and the first stage's `01` fused into `101`, which
          is not a number anybody wrote. A whitespace-only anonymous flex
          item is not rendered (CSS Flexbox §4), and inter-element
          whitespace is legal inside an <ol>, so all three cost no pixel:
          the strip still starts 79px in at 1280, measured. */}
      {/* The scroll box. See the header: `justify-center` is on the row
          INSIDE this, never on this element.

          IT TAKES `FOCUS_RING`, and it is the one element in the app that
          needs the ring without being a control. The strip is 1002px and
          the box is 328px at 360, so Chromium makes an overflowing scroll
          container keyboard-focusable on its own — measured, it is tab stop
          13 on `/recipes/baumy-biltong` at that width, and `:focus-visible`
          matches it. Until M7 the global `:focus-visible` rule in
          `globals.css` drew the accent ring on it; with that rule gone and
          no utility here it fell through to Chromium's own black-and-white
          `outline-style: auto`. A keyboard sweep of the whole app finds no
          other element in that state, which is why TOKEN-MAP §10.3's
          "every rebuilt control writes its own ring" was so nearly true. */}
      <div className={cn('w-full overflow-x-auto', FOCUS_RING)}>
        {/* `items-stretch` where the export draws `items-center`, and it is
            the one deliberate change to the drawing. With complete data
            every cell is the same height and the two are identical, so the
            1280 form is unchanged; with a stage that has no value, or one
            whose name wrapped, `items-center` floats the short box in the
            middle of the band with its top and bottom borders out of line
            with every box beside it, and the strip visibly breaks. R-STA-05
            says the design must not assume a field is present.

            `list-none m-0 p-0` is belt-and-braces since M7, for the same
            reason as the `m-0` on the <figure> above: the preflight's
            `ol, ul, menu { list-style: none }` and its `* { margin: 0;
            padding: 0 }` now zero the user agent's marker and indent. It
            was load-bearing while the preflight was off. */}
        <ol className="m-0 flex w-fit min-w-full list-none flex-row items-stretch justify-center gap-0 p-0">
          {drawn.map((stage, index) => (
            /* The leader belongs to the stage that follows it, so the list
               holds exactly one item per stage and a screen reader counts
               seven stages rather than thirteen things. */
            <Fragment key={index}>
              {index > 0 ? ' ' : null}
              <li className="flex shrink-0 flex-row items-stretch">
                {index > 0 ? (
                  <span
                    aria-hidden="true"
                    className="flex w-fit shrink-0 flex-row items-center gap-1"
                  >
                    <span className={DOT} />
                    <span className={DOT} />
                    <span className={DOT} />
                    <span className={DOT} />
                  </span>
                ) : null}
                <div
                  className={cn(
                    CELL,
                    stage.emphasis
                      ? 'border-accent bg-accent-wash'
                      : 'border-hair bg-transparent',
                  )}
                >
                  <span className="flex w-full shrink-0 flex-row items-center gap-2">
                    {/* R-CMP-14's real space. A flex gap is invisible to
                      `textContent`, so without it the cell reads
                      "01RAW10 kg" to a screen reader and to a copy-paste —
                      the same fault the step chip recorded. */}
                    <span className={CELL_NUMBER}>
                      {String(index + 1).padStart(2, '0')}
                    </span>{' '}
                    {stage.label ? (
                      <span
                        className={cn(
                          CELL_LABEL,
                          stage.emphasis ? 'text-accent' : 'text-ink-2',
                        )}
                      >
                        {stage.label}
                      </span>
                    ) : null}
                  </span>{' '}
                  {/* A cell with no figure keeps its border, its number and
                    its name and draws no third line — not a dash, not an
                    em dash, not an empty span. `mechanism.tsx` says the
                    same of its conditions row. */}
                  {stage.value ? (
                    <span className={CELL_VALUE}>{stage.value}</span>
                  ) : null}
                </div>
              </li>
            </Fragment>
          ))}
        </ol>
      </div>{' '}
      {figures.length > 0 ? (
        <div className="flex w-full shrink-0 flex-row items-center pt-1">
          <span aria-hidden="true" className={TICK} />
          <span aria-hidden="true" className={RULE} />
          {/* `bg-paper` is the page ground, so the caption knocks the rule
              out behind it rather than sitting on a second colour. It is a
              clean token swap in the dark theme, which is why there is not
              one `dark:` utility on this component. */}
          <div className="flex w-fit flex-row bg-paper px-2.5 py-0.75">
            <span className={GUIDE_TEXT}>
              {figures.map((entry, index) => (
                <Fragment key={index}>
                  {/* The middle dot is `aria-hidden` and the spaces around
                      it are NOT. The drawing is one run to the eye; the
                      accessibility tree and a copy-paste get two separate
                      figures with a space between them, never
                      "−55%RATE 4.21% PER DAY". */}
                  {index > 0 ? (
                    <>
                      {' '}
                      <span aria-hidden="true">·</span>{' '}
                    </>
                  ) : null}
                  <span>{entry}</span>
                </Fragment>
              ))}
            </span>
          </div>
          <span aria-hidden="true" className={RULE} />
          <span aria-hidden="true" className={TICK} />
        </div>
      ) : null}
    </figure>
  );
}
