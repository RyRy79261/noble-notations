'use client';

import { formatQuantity, unresolvedLineNeeds } from '@/lib/domain/units';
import type { IngredientLineView, StepView } from '@/lib/queries/read';
import { IngredientCallout } from './f/ingredient-row';
import { scaleAmount, useScale } from './scale';

/**
 * C-19 — what this step uses, as chips under the instruction.
 *
 * The link between a step and the ingredient lines it consumes has been in
 * the database since the rebuild — `recipe_step_ingredients`, written by
 * the `uses` field on every MCP call — and the page never showed it. Steps
 * carried badges for duration, temperature, technique and equipment while
 * the one thing you look up mid-step, the amount, stayed in a list you had
 * to scroll back to.
 *
 * M5 keeps every rule this component already met and moves the drawing onto
 * M4's `F/Ingredient callout`. Read from `design/exports/recipe-1280.html`
 * line 2020: `Uses` (a `gap-[ 8px ]` column) holds `Callout row`s (a
 * `gap-[ 8px ]` row) which hold the chips. The export draws several rows
 * because a still drawing cannot show a wrap — step 2 has two of them at
 * `:2153` and `:2243` — so this writes ONE row with `flex-wrap` and the
 * same 8px on both axes.
 *
 * THE ROW IS NOT A LIST. The design draws `Uses` and `Callout row` as plain
 * boxes, and the chips are links, not list items. The `<ul>`/`<li>` this
 * replaced also cost a layer: an `<li>` between the wrapping row and a
 * `w-fit shrink-0` chip gives the chip a second shrink boundary to squeeze
 * through at 360. `data-step-uses` is the hook in its place, and it carries
 * no stylesheet. `.step-uses` in `globals.css` drew a 999px pill on
 * `--surface-2` — the shape the design replaced (R-CMP-16) — and the
 * attribute was chosen so this row could not pick it up. M7 deleted that
 * file; the attribute stays, because AGENTS.md's rule is that a hook a test
 * needs is a `data-` attribute and never a class name.
 *
 * R-SCR-33 — the chips and the meta row are told apart by the design and
 * not by anything added here. The chip is the only fully bordered thing in
 * M4, and it is two-celled: a wash ground under a mono amount in the
 * accent, then a sans name on no ground. The meta row beside it is bare
 * `F/Measure` label/value pairs on nothing at all.
 */

/**
 * NO TOP MARGIN. The 8px here is the design's gap INSIDE `Uses`, between one
 * chip and the next; the space above the row belongs to the step body, which
 * `recipe-detail.tsx` rebuilt in this same milestone as a `gap-3` flex column
 * — the design's own `flex flex-col gap-[ 12px ]` at `recipe-1280.html:2008`,
 * where `Uses` at `:2020` carries no margin of its own. An earlier draft
 * added `mt-2` because the body was then `.step-body` from `globals.css`
 * with no gap to inherit; margins do not collapse in a flex container, so
 * once the column was rebuilt that put the chips 20px under the instruction
 * where the design draws 12.
 */
const USES = 'flex w-full flex-row flex-wrap items-start gap-2';

/**
 * `max-w-full` is the one class this call site adds to the chip.
 *
 * `F/Ingredient callout` is `w-fit shrink-0` — correct in the drawing, where
 * every chip fits. In a wrapping row a `shrink-0` item wider than the line
 * does not shrink and does not wrap the row: it overflows it, and at 360
 * that is R-STA-09's sideways scroll and a `page-overflow` major fault in
 * `pnpm audit:ui`. `max-w-full` caps the chip at the row, and `CALLOUT_NAME`
 * is already `min-w-0` with no `whitespace-nowrap`, so the name wraps inside
 * the box rather than being cut off by its `overflow-hidden`.
 */
const CHIP = 'max-w-full';

export function StepIngredients({
  uses,
  lines,
}: {
  uses: StepView['uses'];
  lines: IngredientLineView[];
}) {
  const { scale } = useScale();
  if (uses.length === 0) return null;

  /*
   * R-CMP-15 — only a line that is in THIS revision gets a chip.
   *
   * `uses` is written by name on the way in, so a typo there points at
   * nothing, and `byId.get` returns `undefined`. Inventing a chip with no
   * quantity would hide the mistake; dropping the chip leaves it visible in
   * the ingredient list where it can be corrected. `f/ingredient-row.tsx`
   * says this stays the caller's job, because the design draws all 55 chips
   * identically and supplies no unresolved treatment.
   */
  const byId = new Map(lines.map((line) => [line.id, line]));
  const resolved = uses
    .map((use) => byId.get(use.recipeIngredientId))
    .filter((line): line is IngredientLineView => line !== undefined);

  if (resolved.length === 0) return null;

  return (
    <div data-step-uses="" className={USES}>
      {resolved.map((line) => {
        /*
         * R-SCR-31 — the SCALED amount, by the same arithmetic the
         * checklist uses. A chip that says "138.5 g" beside a list that
         * says "277 g" is worse than no chip at all, and the chips and the
         * list read the same `ScaleProvider` (R-CMP-11), so they cannot
         * disagree.
         */
        /*
         * A LINE THAT NAMES NO CANONICAL INGREDIENT DRAWS ITS OWN TEXT AND
         * NOTHING ELSE — the same rule `ingredient-checklist.tsx` states at
         * length, and for the same reason: `raw_text` is the line as it was
         * written, amount and unit included, so an amount half beside it
         * reads `10 pod` `10 pod Star anise`. Soft delete makes the state
         * reachable, because deleting an ingredient leaves every line that
         * named it on its revision.
         */
        const named = line.ingredient !== null;
        /* WHICH of the parts `raw_text` already carries is asked of the text
           rather than inferred; `unresolvedLineNeeds` carries the reasoning.
           A chip draws the measure only. */
        const needs = named ? { measure: true } : unresolvedLineNeeds(line);
        const quantity =
          !needs.measure || line.quantity == null
            ? null
            : formatQuantity(
                scaleAmount(line.quantity, scale, line.unit),
                line.quantityMax == null
                  ? null
                  : scaleAmount(line.quantityMax, scale, line.unit),
              );
        /* One string, `138.5 g`, and not two cells: the callout's amount
           half is a single box in the design, and `formatQuantity` renders
           the range without its unit. */
        const amount =
          quantity === null
            ? undefined
            : `${quantity}${line.unit ? ` ${line.unit}` : ''}`;
        const name = line.ingredient?.name ?? line.rawText;

        return (
          /*
           * R-CMP-14 — the space between the amount and the name is a real
           * text node. It is INSIDE `IngredientCallout`, between the two
           * cells, and CSS Flexbox §4 drops a white-space-only run from the
           * rendering while `textContent`, the accessibility tree and the
           * clipboard all keep it. So this chip's `textContent` reads
           * `138.5 g Salt` and never `138.5 gSalt`. Do NOT add a `gap-` to
           * the callout: a flex gap draws the same pixels and reads as
           * "1 kgJalapeño".
           *
           * R-SCR-32 — `href` only when the line resolves to a row in the
           * ingredient list. The callout puts the link on the whole chip,
           * so the target is the 1px box and not just the word.
           *
           * `data-chip-name` is a hook with no stylesheet, the same shape
           * as `data-site-header`. It names the half of the chip that has
           * to match a line in the ingredient list, which is R-CMP-15 seen
           * from the test's side.
           */
          <IngredientCallout
            key={line.id}
            className={CHIP}
            amount={amount}
            name={<span data-chip-name="">{name}</span>}
            href={
              line.ingredient
                ? `/ingredients/${line.ingredient.slug}`
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
