'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useOptimistic, useTransition } from 'react';

import { Button } from '@/components/f/button';
import { ListMark } from '@/components/f/list-row';
import { removeFromBasket } from '@/components/shopping-basket';
import { cn } from '@/lib/utils';

/**
 * `Control bar` — the recipes this list came from, and the two controls.
 *
 * `list-search-archive-1280.html:255` and `m360-batch-search-list.html:5439`.
 * One `f-desk` bar, `14px 16px` of padding, no rule and no radius:
 *
 *   1280  one row, `justify-between`. Left is `DRAWN FROM` and the chips at
 *         8px; right is `ORDERED BY AISLE` and `PRINT THE LIST` at 16px.
 *   360   a `gap-[ 12px ]` column: the label, then the chips, then a
 *         `justify-between` row holding the sort note and the button.
 *
 * The chip is `F/List mark` in its `control` form — `p-[ 5px_8px_5px_10px ]`,
 * an 8px accent square, a 13px name and a mono `×`. It is the same component
 * the rows below use for their source chips, at the other padding.
 *
 * ─── WHY REMOVING LIVES HERE ─────────────────────────────────────────────
 *
 * This is not the picker that used to sit here. It names what is already on
 * the list — never the whole repository — so it stays the size of your shop
 * rather than the size of the archive. Adding happens on a recipe page,
 * which is where you decide to cook something. Removing has to be here as
 * well as on the recipe: making someone navigate back into a recipe to take
 * it off the list is the same mistake as making them come here to put it on.
 *
 * ─── WHAT `globals.css` STILL DRAWS ON THESE ELEMENTS ────────────────────
 *
 * `.list-recipes` is a TEST HOOK, not a style: `e2e/list.spec.ts` counts
 * `.list-recipes li` and reads `.list-recipes a`. The old stylesheet hangs a
 * rounded, bordered, filled pill on that same selector — `li`, `a` and
 * `button` each get a rule — so every one of them has to be answered.
 *
 * It sits on the `<ul>` rather than on the bar, which keeps
 * `.list-recipes button` — a 44px round icon button — off `PRINT THE LIST`
 * and on the chip's × where the tests need the list. The `<li>` answers its
 * rule with utilities of its own; the `<a>` and the `<button>` are elements
 * F/List mark renders and this file cannot reach, so they are answered with
 * descendant variants. `@layer utilities` sits above `@layer legacy`, so a
 * utility wins at equal specificity. All of it goes with `globals.css` at M7.
 */
export function ListRecipes({
  recipes,
}: {
  recipes: { slug: string; title: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  // The chips are driven by the URL, which only updates once the server has
  // rebuilt the list. Without an optimistic copy a tap leaves the chip in
  // place until the round trip lands, which reads as a dropped tap.
  const [shown, setShown] = useOptimistic(recipes);

  function remove(slug: string) {
    const next = shown.filter((recipe) => recipe.slug !== slug);
    const url = new URLSearchParams(params.toString());
    url.delete('r');
    for (const recipe of next) url.append('r', recipe.slug);

    // R-STO-05. Mutate one entry. Writing the whole array back — which is
    // what this did first — destroys any recipe that is in the basket but
    // not in the current URL, and the two drift apart as soon as you press
    // Back.
    removeFromBasket(slug);

    startTransition(() => {
      setShown(next);
      router.push(url.size > 0 ? `/list?${url}` : '/list');
    });
  }

  /*
   * WCAG 1.4.3, and the one contrast fault M3's palette bridge introduced.
   * `globals.css` draws the pending state as `opacity: 0.6` on the whole
   * section, which composites live text against the page at 4.23:1 on links
   * that stay focusable and clickable throughout, so WCAG's relief for an
   * inactive control does not apply. `opacity-100` is a utility and wins
   * over the old rule without editing the file (D-03); the pending state is
   * drawn with a colour instead, the way the old stylesheet draws its other
   * two. `aria-busy` says the same thing to a screen reader.
   */
  const quiet = 'text-09 font-mono tracking-label uppercase text-ink-3';

  return (
    <section
      className={cn(
        'flex w-full shrink-0 flex-col items-start gap-3 bg-desk p-3.5',
        'shell:flex-row shell:items-center shell:justify-between shell:gap-4 shell:px-4 shell:py-3.5',
      )}
    >
      <div
        className={cn(
          'flex w-full min-w-0 flex-col items-start gap-3',
          'shell:w-auto shell:flex-row shell:items-center shell:gap-2',
        )}
      >
        <h2 className={cn('m-0 shrink-0 font-normal', quiet)}>Drawn from</h2>
        {shown.length > 0 ? (
          <ul
            /* `list-recipes` sits on the LIST and not on the bar around it,
               so the old `.list-recipes button` rule — a 44px round icon
               button — reaches the chip's × and not F/Button beside it. The
               two `[&_…]` variants answer what is left of it: `@layer
               utilities` sits above `@layer legacy`, so a utility wins at
               equal specificity, and a descendant variant is the only way to
               reach an element F/List mark renders. All of it goes with
               `globals.css` at M7. */
            className={cn(
              'list-recipes opacity-100',
              'm-0 flex list-none flex-row flex-wrap items-center gap-2 p-0',
              '[&_a]:text-13',
              '[&_button]:h-auto [&_button]:w-auto',
            )}
            data-pending={pending || undefined}
            aria-busy={pending || undefined}
          >
            {shown.map((recipe) => (
              <li
                key={recipe.slug}
                className="m-0 flex min-h-0 rounded-none border-0 bg-transparent p-0"
              >
                <ListMark
                  form="control"
                  name={recipe.title}
                  href={`/recipes/${recipe.slug}`}
                  onRemove={() => remove(recipe.slug)}
                  removeLabel={`Remove ${recipe.title} from the list`}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div
        className={cn(
          'flex w-full flex-row items-center justify-between gap-3',
          'shell:w-auto shell:shrink-0 shell:justify-end shell:gap-4',
        )}
      >
        <span className={cn(quiet, 'shrink-0')}>Ordered by aisle</span>
        {/* The design's one filled control on this screen. Printing is the
            reason the list is a document rather than an app: it is the form
            it takes into a shop with no signal. */}
        <Button onClick={() => window.print()}>Print the list</Button>
      </div>
    </section>
  );
}
