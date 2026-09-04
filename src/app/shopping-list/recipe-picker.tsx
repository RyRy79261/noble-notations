'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useOptimistic, useState, useTransition } from 'react';

/**
 * Picks which recipes the list is built from.
 *
 * Selection lives in the URL rather than in component state, so a list is a
 * link: it can be sent to a phone, bookmarked for a weekly shop, or pasted
 * into a message. That is worth more here than avoiding a round trip.
 */
export function RecipePicker({
  recipes,
  selected,
}: {
  recipes: { slug: string; title: string }[];
  selected: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(selected.length === 0);
  const [pending, startTransition] = useTransition();

  // The checkboxes are driven by the URL, which only updates once the
  // server has re-rendered the list. Without an optimistic copy a tap
  // leaves the box visibly unchecked until the round trip lands, which
  // reads as a dropped tap and invites a second one.
  const [chosenSlugs, setChosenSlugs] = useOptimistic(selected);
  const chosen = new Set(chosenSlugs);

  function apply(next: Set<string>) {
    const url = new URLSearchParams(params.toString());
    url.delete('r');
    for (const slug of next) url.append('r', slug);
    startTransition(() => {
      setChosenSlugs([...next]);
      router.push(url.size > 0 ? `/shopping-list?${url}` : '/shopping-list');
    });
  }

  function toggle(slug: string) {
    const next = new Set(chosen);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    apply(next);
  }

  return (
    <section
      className="panel picker"
      data-open={open}
      data-pending={pending || undefined}
    >
      <div className="section-head">
        <h2>Recipes</h2>
        <button
          type="button"
          className="button-secondary"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? 'Hide' : `Choose (${chosen.size})`}
        </button>
      </div>

      {open ? (
        <>
          <ul className="picker-list">
            {recipes.map((recipe) => (
              <li key={recipe.slug}>
                <label className="picker-item">
                  <input
                    type="checkbox"
                    checked={chosen.has(recipe.slug)}
                    onChange={() => toggle(recipe.slug)}
                  />
                  <span>{recipe.title}</span>
                </label>
              </li>
            ))}
          </ul>
          {chosen.size > 0 ? (
            <button
              type="button"
              className="button-secondary"
              onClick={() => apply(new Set())}
            >
              Clear all
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
