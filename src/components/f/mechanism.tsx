/**
 * F/Mechanism — one science note: what happens in the food, and why.
 *
 * Read from `design/exports/foundations.html`, Plate II section F.4,
 * `data-pencil-name="F/Mechanism"` at line 2388. Drawn on the page at
 * `science-1280.html:322` and `:1022`, at 360 in
 * `m360-access-science.html:1773`, and in the dark theme at
 * `dark-screens.html:2069`.
 *
 * R-SCR-11 — HOW THE SCIENCE BLOCK DIFFERS FROM THE NOTES BLOCK. The notes
 * block is a numbered apparatus set in the sans. This is not:
 *
 *   - the gutter is an ACCENT code, `M1`, not an arabic ordinal in `f-ink`;
 *   - the name is Newsreader at weight 400, not 500, and 19px rather than 16;
 *   - the body is set in the SERIF, 15 over 26, where every note body in the
 *     system is Geist 14 over 24;
 *   - the row has no vertical padding, and it ends in a mono conditions run
 *     that no footnote has.
 *
 * Nothing is shared with F/Footnote but the section frame around it.
 *
 * THE EIGHTH NOTE KIND. §10.2.3 of the specification says the Notes block
 * "holds all note kinds except science". R-CMP-06 asks each of the eight
 * kinds for a different visual treatment, and science's is that it is a
 * different component: this one. `src/components/notes.tsx` routes it here
 * rather than through `noteKindLabel`, which would otherwise render
 * `NOTE · SCIENCE` — a string the design never draws.
 *
 * A server component.
 */

import { Fragment } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type MechanismProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  /** The accent code in the gutter: `M1`, `M2`. A position within its
   *  recipe — see D-05 in `design/DECISIONS.md` on why it is not global. */
  code?: ReactNode;
  /** The claim. `notes.title`, which R-STA-05 says can be null. */
  name?: ReactNode;
  /**
   * R-SCR-41. Separate values — `232 °C`, `45 MIN`, `SINGLE LAYER ON A RACK`
   * — never one sentence.
   *
   * Read from `notes.conditions`, the `text[]` column D-02 settled and
   * M5.5 added. It is empty on the other seven note kinds and on a science
   * note nobody has described yet, and the row is then absent — not an
   * empty span, not a placeholder, not a dash. `Col` is an 8px column, so
   * an absent third child leaves the name over the body and nothing else
   * moves.
   *
   * A one-element list is real and is drawn with no separator: the design
   * gives `DRY DUXELLES + SEALED WRAP` as one condition, and `+` and `→`
   * live INSIDE a value. The middle dot is the only split, so `4 °C → 71
   * °C` is one condition and must never be broken at the arrow.
   */
  conditions?: ReactNode[];
  /** The explanation. Set in the serif, not the sans. */
  children?: ReactNode;
};

/**
 * F/Mechanism — an accent code, a serif claim, a serif explanation and a
 * mono run of conditions. No ground, no rule, no radius, no padding.
 */
export function Mechanism({
  code,
  name,
  conditions,
  children,
  className,
  ...props
}: MechanismProps) {
  return (
    <div
      className={cn(
        'flex h-fit w-full shrink-0 flex-row items-start gap-3 shell:gap-4',
        className,
      )}
      {...props}
    >
      {code !== undefined && code !== null && code !== '' ? (
        /* 26px at 360, 34px at 1280. Both are off BUILD-PLAN §2.3's gap
           scale and are written as fractional multiples of `--spacing`,
           which is pinned to 4px. TOKEN-MAP §8.1.
           The size and its leading go in one argument — TOKEN-MAP §4.3. */
        <span className="w-6.5 shell:w-8.5 shrink-0 text-10 leading-170 shell:leading-180 font-mono tracking-micro tabular-nums text-accent">
          {code}
        </span>
      ) : null}
      {/* R-CMP-14's real space: without it the block reads "M1Maillard
          browning…" to a screen reader and to a copy-paste. */}
      {code !== undefined && code !== null && code !== '' ? ' ' : null}
      <div className="flex h-fit flex-1 basis-0 flex-col items-start gap-2">
        {name ? (
          /* Newsreader at WEIGHT 400. The footnote title is 500; this one is
             not, and that is half of what tells the two blocks apart.
             17/22 at 360 and 19/25 at 1280 are both `leading-130`. */
          <span className="w-full text-17 leading-130 shell:text-19 font-serif text-ink">
            {name}
          </span>
        ) : null}
        {/* The same real space again, between the three children of `Col`
            this time. R-CMP-14 is about `textContent` and not about boxes,
            and it does not stop at a flex ROW: an 8px column gap is just as
            invisible, so without these two the block reads
            "…flavour layerMushrooms are 80–90% water" and
            "…into the pastry.25–30 min". A whitespace-only anonymous flex
            item is not rendered (CSS Flexbox §4), so neither costs a pixel
            and the 8px gaps are untouched. */}
        {name ? ' ' : null}
        {children ? (
          /* 14/24 at 360 and 15/26 at 1280 — both `leading-170`, and both in
             the SERIF. This is the only body copy in the system that is. */
          <div className="w-full text-14 leading-170 shell:text-15 font-serif text-ink-2">
            {children}
          </div>
        ) : null}
        {children ? ' ' : null}
        {conditions && conditions.length > 0 ? (
          /*
           * R-SCR-41 — separate values, not a sentence.
           *
           * The design draws one text run, `232 °C · 45 MIN · SINGLE LAYER
           * ON A RACK`, so the requirement is about structure rather than
           * pixels. Each condition gets its own element and the separators
           * are `aria-hidden`, exactly the way `breadcrumb.tsx` does it: the
           * drawing is identical to the export, and the accessibility tree
           * and a copy-paste carry separate values.
           *
           * The glyph is U+00B7 MIDDLE DOT with one space each side, and it
           * inherits `f-ink-3` from the run. It is NOT the breadcrumb's
           * `f-hair` dot, which is 1.20:1 on the paper and is legal only
           * because it sits between two labelled crumbs.
           *
           * THE DOT IS HIDDEN AND THE SPACES ARE NOT, and that split is the
           * half of R-SCR-41 a screen reader hears. `aria-hidden` on the
           * whole ` · ` takes the spaces with it, and the accessibility tree
           * then holds `232 °C` immediately followed by `45 MIN` with
           * nothing between them — R-CMP-14's run-on fault one level up from
           * the step chip, and the same one M4 closed on four row
           * components. Two real space text nodes carry the separation and
           * only the glyph is hidden, so `textContent` reads
           * `232 °C · 45 MIN · SINGLE LAYER ON A RACK` and the reading order
           * reads `232 °C 45 MIN SINGLE LAYER ON A RACK`. Neither is a
           * sentence and neither is one word.
           *
           * `uppercase` belongs to the component, not to the data. The
           * design draws `SINGLE LAYER ON A RACK`; the store holds sentence
           * case, the same way `Mark` treats a kind label. It is safe on
           * this run in a way it is not on a mass-flow value: a condition
           * carries `°C`, `MIN` and `WHITES`, and none of those has a case
           * that has to survive.
           */
          <span className="w-full text-09 leading-170 shell:leading-normal font-mono tracking-label uppercase text-ink-3">
            {conditions.map((condition, index) => (
              <Fragment key={index}>
                {index > 0 ? (
                  <>
                    {' '}
                    <span aria-hidden="true">·</span>{' '}
                  </>
                ) : null}
                <span>{condition}</span>
              </Fragment>
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}
