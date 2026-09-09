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
 * ─── THE TEST HOOK ON THE LIST ───────────────────────────────────────────
 *
 * `data-list-recipes` is a TEST HOOK, not a style: `e2e/list.spec.ts` counts
 * `[data-list-recipes] li` and reads `[data-list-recipes] a`. It sits on the
 * `<ul>` and not on the bar around it, so the count is the chips and not
 * `PRINT THE LIST` beside them.
 *
 * It replaced the `list-recipes` class at M7. `globals.css` hung a rounded,
 * bordered, filled pill on that same name — `li`, `a` and `button` each got
 * a rule — and every reset that answered one of the three went with the file
 * that drew them.
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
   * `globals.css` drew the pending state as `opacity: 0.6` on the whole
   * section, which composited live text against the page at 4.23:1 on links
   * that stay focusable and clickable throughout, so WCAG's relief for an
   * inactive control did not apply. M3 answered it with an `opacity-100`
   * utility, which won on layer order without editing the file (D-03); M7
   * deleted the file and the utility went with it. The pending state is
   * drawn with colour alone now, and `aria-busy` says the same thing to a
   * screen reader. The note at the `<ul>` below records the two other
   * cancellations that went in the same pass.
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
            /* `[&_a]:text-13` is the only `[&_…]` variant left here, and it
               is a real style: F/List mark renders the anchor and this file
               cannot reach it any other way. Its three neighbours were
               cancellations of `globals.css` — a 44px round icon button, the
               marker and indent of a bare `<ul>`, and the `opacity: 0.6` the
               old rule put on `[data-pending]` — and all three went with the
               file that drew them. `data-pending` is still written: it is
               read by `aria-busy` beside it. */
            className={cn(
              'flex flex-row flex-wrap items-center gap-2',
              '[&_a]:text-13',
            )}
            data-list-recipes=""
            data-pending={pending || undefined}
            aria-busy={pending || undefined}
          >
            {shown.map((recipe) => (
              <li key={recipe.slug} className="flex">
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
