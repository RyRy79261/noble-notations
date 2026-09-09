'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { buttonClasses } from '@/components/f/button';
import { Empty } from '@/components/f/notice';
import {
  basketHref,
  readBasket,
  type BasketRecipe,
} from '@/components/shopping-basket';

/**
 * What `/list` shows when the URL is bare but the basket is not.
 *
 * The selection lives in the URL and the basket lives in localStorage, and
 * the server can only see the first. So the permanent "List" nav link,
 * every bookmark, and the page's own canonical URL all pointed at an
 * address that answered "Nothing on the list yet. Open a recipe and press
 * Add to shopping list" — printed two inches under a header pill reading
 * "List 3", to someone who had just done exactly that three times.
 *
 * This bridges the two until the basket becomes the single source of
 * truth. Deliberately a link and not a redirect: replacing the URL here
 * traps the Back button bouncing forward off the bare address.
 *
 * THE DESIGN DRAWS NEITHER STATE. `/list` is drawn once, with four recipes
 * on it, at both widths and in both themes. So both are built from parts it
 * does draw and nothing is invented: `F/Empty`'s centred serif italic for
 * the sentence (R-STA-03) and `F/Button` for the way out. Recorded for the
 * designer with the rest of M6's gaps.
 */
export function BasketBridge() {
  const [items, setItems] = useState<BasketRecipe[] | null>(null);

  // Nothing renders until localStorage has actually been read, so the
  // "nothing here" copy cannot flash at someone whose list is full.
  useEffect(() => setItems(readBasket()), []);

  if (items === null) return null;

  if (items.length === 0) {
    return (
      <div className="flex w-full shrink-0 flex-col items-center gap-5">
        <Empty>
          Nothing on the list yet. Open a recipe and press Add to list, then
          come back here.
        </Empty>
        <Link href="/recipes" className={buttonClasses()}>
          Browse recipes
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full shrink-0 flex-col items-center gap-5">
      <Empty>
        {items.length} recipe{items.length === 1 ? '' : 's'} collected:{' '}
        {items.map((item) => item.title).join(', ')}.
      </Empty>
      <Link href={basketHref(items)} className={buttonClasses()}>
        Show the list
      </Link>
    </div>
  );
}
