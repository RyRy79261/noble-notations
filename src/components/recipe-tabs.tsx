'use client';

import { useState, type ReactNode } from 'react';

/**
 * Ingredients and method as tabs — on narrow screens only.
 *
 * On a phone the two columns stack, which means scrolling past the whole
 * ingredient list to reach step one and back up again every time you need
 * to check a quantity. Tabs make that a tap.
 *
 * On a wide screen the two-column layout is better than tabs, so the
 * stylesheet shows both panels and hides the tab strip above the
 * breakpoint. The state below is therefore only consulted on mobile: the
 * markup is identical at every width, and CSS decides what is visible.
 * That keeps one DOM and one set of links, so a deep link or a Ctrl-F
 * still finds the method on desktop.
 */
export function RecipeTabs({
  ingredients,
  method,
}: {
  ingredients: ReactNode;
  method: ReactNode;
}) {
  const [active, setActive] = useState<'ingredients' | 'method'>('ingredients');

  return (
    <div className="recipe-layout" data-active={active}>
      <div className="recipe-tabs" role="tablist" aria-label="Recipe">
        <button
          type="button"
          role="tab"
          id="tab-ingredients"
          aria-selected={active === 'ingredients'}
          aria-controls="panel-ingredients"
          onClick={() => setActive('ingredients')}
        >
          Ingredients
        </button>
        <button
          type="button"
          role="tab"
          id="tab-method"
          aria-selected={active === 'method'}
          aria-controls="panel-method"
          onClick={() => setActive('method')}
        >
          Method
        </button>
      </div>

      <aside
        className="recipe-aside"
        id="panel-ingredients"
        role="tabpanel"
        aria-labelledby="tab-ingredients"
        data-tab="ingredients"
      >
        {ingredients}
      </aside>

      <div
        id="panel-method"
        role="tabpanel"
        aria-labelledby="tab-method"
        data-tab="method"
      >
        {method}
      </div>
    </div>
  );
}
