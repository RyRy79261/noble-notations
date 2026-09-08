'use client';

import Link from 'next/link';
import { formatQuantity } from '@/lib/domain/units';
import type { IngredientLineView, StepView } from '@/lib/queries/read';
import { scaleAmount, useScale } from './scale';

/**
 * What this step uses, as chips under the instruction.
 *
 * The link between a step and the ingredient lines it consumes has been in
 * the database since the rebuild — `recipe_step_ingredients`, written by
 * the `uses` field on every MCP call — and the page never showed it. Steps
 * carried badges for duration, temperature, technique and equipment while
 * the one thing you look up mid-step, the amount, stayed in a list you had
 * to scroll back to.
 *
 * The amounts scale with the batch multiplier, because a chip that says
 * "10 g" beside a list that says "30 g" is worse than no chip at all.
 *
 * Only lines that resolve are shown. A `uses` entry naming an ingredient
 * that is not in this revision is a write-time mistake, and inventing a
 * chip with no quantity would hide it rather than leave it visible in the
 * ingredient list where it can be corrected.
 */
export function StepIngredients({
  uses,
  lines,
}: {
  uses: StepView['uses'];
  lines: IngredientLineView[];
}) {
  const { scale } = useScale();
  if (uses.length === 0) return null;

  const byId = new Map(lines.map((line) => [line.id, line]));
  const resolved = uses
    .map((use) => byId.get(use.recipeIngredientId))
    .filter((line): line is IngredientLineView => line !== undefined);

  if (resolved.length === 0) return null;

  return (
    <ul className="step-uses">
      {resolved.map((line) => {
        const amount =
          line.quantity == null
            ? null
            : formatQuantity(
                scaleAmount(line.quantity, scale, line.unit),
                line.quantityMax == null
                  ? null
                  : scaleAmount(line.quantityMax, scale, line.unit),
              );
        const name = line.ingredient?.name ?? line.rawText;

        return (
          // The space between the amount and the name is a real text node,
          // not a flex gap. A gap is invisible to `textContent`, so a
          // screen reader reads "1 kgJalapeño" and a copied chip pastes the
          // same way — the layout looked right and the content was wrong.
          <li key={line.id}>
            {amount ? (
              <b>
                {amount}
                {line.unit ? ` ${line.unit}` : ''}
              </b>
            ) : null}{' '}
            {line.ingredient ? (
              <Link href={`/ingredients/${line.ingredient.slug}`}>{name}</Link>
            ) : (
              <span>{name}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
