'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  basketHref,
  readBasket,
  type BasketRecipe,
} from '@/components/shopping-basket';

/**
 * What `/shopping-list` shows when the URL is bare but the basket is not.
 *
 * The selection lives in the URL and the basket lives in localStorage, and
 * the server can only see the first. So the permanent "Shopping" nav link,
 * every bookmark, and the page's own canonical URL all pointed at an
 * address that answered "Nothing on the list yet. Open a recipe and press
 * Add to shopping list" — printed two inches under a header pill reading
 * "Shopping list 3", to someone who had just done exactly that three
 * times.
 *
 * This bridges the two until the basket becomes the single source of
 * truth. Deliberately a link and not a redirect: replacing the URL here
 * traps the Back button bouncing forward off the bare address.
 */
export function BasketBridge() {
  const [items, setItems] = useState<BasketRecipe[] | null>(null);

  // Nothing renders until localStorage has actually been read, so the
  // "nothing here" copy cannot flash at someone whose list is full.
  useEffect(() => setItems(readBasket()), []);

  if (items === null) return null;

  if (items.length === 0) {
    return (
      <>
        <p className="empty">
          Nothing on the list yet. Open a recipe and press{' '}
          <strong>Add to shopping list</strong>, then come back here.
        </p>
        <p>
          <Link href="/recipes" className="button-primary">
            Browse recipes
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <p>
        {items.length} recipe{items.length === 1 ? '' : 's'} collected:{' '}
        {items.map((item) => item.title).join(', ')}.
      </p>
      <p>
        <Link href={basketHref(items)} className="button-primary">
          Show the list
        </Link>
      </p>
    </>
  );
}
