'use client';

import { useState, type ReactNode } from 'react';

/**
 * The panels of a recipe: what goes in, what you do, why it works, and what
 * changed.
 *
 * Two of these are always present and two are not, so the strip is built
 * from the panels this recipe actually has. A tab with nothing behind it is
 * a dead control, and most recipes carry neither a science note nor a
 * second revision.
 *
 * The layout differs by width, and deliberately:
 *
 * - On a phone every panel is a tab. Stacking them means scrolling past the
 *   whole ingredient list to reach step one and back up again every time
 *   you need a quantity.
 * - On a wide screen the ingredient list is an aside that stays put, and
 *   the tabs switch the main column between method, science and revisions.
 *   Side by side beats tabs when there is room for both: you can read an
 *   amount without leaving step four.
 *
 * The markup is identical at every width and CSS decides what is visible,
 * so there is one DOM, one set of links, and a deep link or a Ctrl-F still
 * finds the method on a desktop.
 */

const LABELS = {
  ingredients: 'Ingredients',
  method: 'Method',
  science: 'Science',
  revisions: 'Revisions',
} as const;

type TabKey = keyof typeof LABELS;

export function RecipeTabs({
  ingredients,
  method,
  science,
  revisions,
}: {
  /**
   * Omitted by a recipe with nothing to put in the aside — a research
   * write-up carries no ingredients and no yield. It used to render the
   * aside anyway, which left a third of a desktop screen blank beside the
   * only column that had anything in it.
   */
  ingredients?: ReactNode;
  method: ReactNode;
  science?: ReactNode;
  revisions?: ReactNode;
}) {
  const [active, setActive] = useState<TabKey>(
    ingredients ? 'ingredients' : 'method',
  );

  const panels: { key: TabKey; content: ReactNode }[] = [];
  if (ingredients) panels.push({ key: 'ingredients', content: ingredients });
  panels.push({ key: 'method', content: method });
  if (science) panels.push({ key: 'science', content: science });
  if (revisions) panels.push({ key: 'revisions', content: revisions });

  // On a desktop the ingredient tab is not offered — the aside is always on
  // screen — so an ingredients selection there must still leave the main
  // column showing something. The stylesheet resolves it to the method.
  return (
    <div
      className="recipe-layout"
      data-active={active}
      data-panels={panels.length}
      data-aside={ingredients ? 'yes' : 'no'}
    >
      {/* The strip and the panels it switches share one column, rather than
        sitting in two rows of the page grid. As two rows they were siblings
        of the aside, and a spanning aside taller than the active panel grew
        the row the strip was in: on Baumy Biltong the Revisions panel
        started 2185px down the page, under an empty screen. */}
      <div className="recipe-column">
        <div className="recipe-tabs" role="tablist" aria-label="Recipe">
          {panels.map((panel) => (
            <button
              key={panel.key}
              type="button"
              role="tab"
              id={`tab-${panel.key}`}
              aria-selected={active === panel.key}
              aria-controls={`panel-${panel.key}`}
              data-tab-button={panel.key}
              onClick={() => setActive(panel.key)}
            >
              {LABELS[panel.key]}
            </button>
          ))}
        </div>

        {/* Hidden, not unmounted: ticked checkboxes, the chosen ordering and
        the batch multiplier all survive switching tabs. */}
        <div className="recipe-main">
          {panels
            .filter((panel) => panel.key !== 'ingredients')
            .map((panel) => (
              <div
                key={panel.key}
                id={`panel-${panel.key}`}
                role="tabpanel"
                aria-labelledby={`tab-${panel.key}`}
                data-tab={panel.key}
              >
                {panel.content}
              </div>
            ))}
        </div>
      </div>

      {ingredients ? (
        <aside
          className="recipe-aside"
          id="panel-ingredients"
          role="tabpanel"
          aria-labelledby="tab-ingredients"
          data-tab="ingredients"
        >
          {ingredients}
        </aside>
      ) : null}
    </div>
  );
}
