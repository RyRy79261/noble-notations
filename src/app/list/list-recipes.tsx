'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOptimistic, useTransition } from 'react';
import { removeFromBasket } from '@/components/shopping-basket';

/**
 * The recipes this list came from, and the only way to drop one.
 *
 * This is not the picker that used to sit here. It names what is already on
 * the list — never the whole repository — so it stays the size of your
 * shop rather than the size of the archive. Adding happens on a recipe
 * page, which is where you decide to cook something.
 *
 * Removing has to live here as well as on the recipe. Making someone
 * navigate back into a recipe to take it off the list is the same mistake
 * as making them come here to put it on.
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

    // Mutate one entry. Writing the whole array back — which is what this
    // did first — destroys any recipe that is in the basket but not in the
    // current URL, and the two drift apart as soon as you press Back.
    removeFromBasket(slug);

    startTransition(() => {
      setShown(next);
      router.push(url.size > 0 ? `/list?${url}` : '/list');
    });
  }

  if (shown.length === 0) return null;

  /*
   * WCAG 1.4.3, and the one contrast fault M3's palette bridge introduced.
   *
   * `globals.css` draws the pending state as `opacity: 0.6` on the whole
   * section, which composites live text against the page: 4.66:1 before the
   * bridge, 4.23:1 after it, on links that stay focusable and clickable
   * throughout, so WCAG's relief for an inactive control does not apply.
   *
   * `globals.css` is history and is not edited (D-03). `opacity-100` is a
   * utility, and `@layer utilities` sits above `@layer legacy`, so it wins
   * over that rule without touching the file. The pending state is then
   * drawn the way the old stylesheet draws its other two pending controls —
   * with a colour. `f-ink-3` is 5.25:1 light and 5.60:1 dark, and it also
   * clears the remove control's own pre-existing 2.75:1.
   *
   * `aria-busy` says the same thing to a screen reader that the tint says
   * to a sighted reader.
   */
  const quiet = pending ? 'text-ink-3' : undefined;

  return (
    <section
      className="list-recipes opacity-100"
      data-pending={pending || undefined}
      aria-busy={pending || undefined}
    >
      <h2 className="visually-hidden">Recipes on this list</h2>
      <ul>
        {shown.map((recipe) => (
          <li key={recipe.slug}>
            <Link href={`/recipes/${recipe.slug}`} className={quiet}>
              {recipe.title}
            </Link>
            <button
              type="button"
              className={quiet}
              onClick={() => remove(recipe.slug)}
              aria-label={`Remove ${recipe.title} from the list`}
            >
              <span aria-hidden>×</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
