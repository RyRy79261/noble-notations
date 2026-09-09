'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { announce } from '@/lib/announce';
import { cn } from '@/lib/utils';

/**
 * A basket of recipes to shop for, collected as you browse.
 *
 * The `/list` page takes its selection from the URL, which makes a list
 * shareable but means you have to already know what you want before you
 * get there. This is the other direction: add a recipe while reading it,
 * then open the basket and build one list from everything collected.
 *
 * The basket lives in localStorage rather than the URL — it is a working
 * set, per browser, and putting six slugs in every link would be noise.
 * Handing off to `/list?r=…` at the end is what makes the result shareable,
 * so both properties are kept where each belongs.
 *
 * `storage` events keep two tabs in step; a custom event does the same for
 * two components in *this* tab, which the storage event does not cover.
 */
const KEY = 'nn:basket';
const CHANGED = 'nn:basket-changed';

export interface BasketRecipe {
  slug: string;
  title: string;
}

function read(): BasketRecipe[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is BasketRecipe =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as BasketRecipe).slug === 'string' &&
        typeof (item as BasketRecipe).title === 'string',
    );
  } catch {
    return [];
  }
}

function write(items: BasketRecipe[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage blocked. The basket still works for this page view.
  }
  window.dispatchEvent(new CustomEvent(CHANGED));
}

function useBasket() {
  const [items, setItems] = useState<BasketRecipe[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setItems(read());
    sync();
    setReady(true);
    window.addEventListener('storage', sync);
    window.addEventListener(CHANGED, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CHANGED, sync);
    };
  }, []);

  const add = useCallback((recipe: BasketRecipe) => {
    const next = read().filter((item) => item.slug !== recipe.slug);
    write([...next, recipe]);
  }, []);

  const remove = useCallback((slug: string) => {
    write(read().filter((item) => item.slug !== slug));
  }, []);

  return { items, ready, add, remove };
}

/** The basket, for code outside a component. */
export function readBasket(): BasketRecipe[] {
  return read();
}

export function basketHref(items: BasketRecipe[]): string {
  const params = new URLSearchParams();
  for (const item of items) params.append('r', item.slug);
  return `/list?${params}`;
}

/** "Add to list", for a recipe page. */
export function AddToBasket({ slug, title }: BasketRecipe) {
  const { items, add, remove } = useBasket();
  const inBasket = items.some((item) => item.slug === slug);

  // Rendered from the server in its default state, not withheld until
  // mounted. Withholding it meant the only entry point to the shopping
  // flow was absent from the served HTML entirely — `curl` found no trace
  // of it, and with JavaScript off the recipe page offered no way to shop
  // at all. The sibling checklist in the same panel has the same
  // localStorage dependency and renders fine, so the hydration argument
  // was never a constraint this codebase accepted. The label corrects
  // itself the moment the effect runs.
  return (
    <button
      type="button"
      className={inBasket ? 'button-secondary' : 'button-primary'}
      onClick={() => (inBasket ? remove(slug) : add({ slug, title }))}
    >
      {inBasket ? 'In list ✓' : 'Add to list'}
    </button>
  );
}

/**
 * C-03, and the design's `List control` — how many recipes are collected,
 * and the way to the list.
 *
 * This used to open a dialog listing the collected *recipes*, under the
 * heading "Shopping list". Opening something called a shopping list and
 * finding recipe titles with remove buttons is not a shopping list, and the
 * actual list was another click away behind "Build the list". So the
 * control is now a link straight to it. One tap, ingredients.
 *
 * It also lives outside the nav, and now outside the 360 drawer as well —
 * R-CMP-02 and R-NAV-06. The nav used to scroll sideways on a phone and
 * this was its last child, which put it several hundred pixels off the
 * right edge of a 390px screen: present in the DOM, reachable by a sideways
 * drag nobody would guess to make. M3 replaced that nav with a drawer.
 *
 * M3 RESTYLED IT AND CHANGED NOTHING ABOUT HOW IT STORES. §12 and R-STO-01
 * to R-STO-05 govern the storage, `useBasket` is untouched, and the
 * `null` below is still R-CMP-01: the design draws no zero state anywhere —
 * the count is 2 or 4 in all eighteen exports and no frame hides or empties
 * it — so hiding the word and the badge together and letting the header's
 * `justify-between` reflow is the build's own answer.
 *
 * The design draws a bare 10px mono word and a square accent-filled count.
 * No border, no pill, no radius, no button box. The word is `f-ink` and not
 * `f-ink-3`, so it is louder than a nav item beside it.
 *
 * TWO ADDITIONS TO THE DRAWING:
 *
 * - R-ACC-06. The count changes while the page is up, so each change is
 *   announced. The announcement does NOT come from a region inside this
 *   control: this control unmounts itself at zero (R-CMP-01), and a live
 *   region that arrives with its first value announces nothing, so the
 *   0 → 1 change — the one the add button produces — would be silent. It
 *   also has to sit outside the shell or it defeats the 360 drawer's modal
 *   boundary. `src/lib/announce.ts` explains both; the region itself is in
 *   `src/app/announcer.tsx`.
 * - G-5. It is drawn 56.8 × 17 at 1280 and 48.8 × 16 at 360, both under the
 *   24px WCAG 2.5.8 minimum. `min-h-6` with a negative block margin gives
 *   it a 24px hit box and leaves the row it sits in exactly where it was.
 *
 * The space after "List" is a real character, not a flex gap. R-CMP-14
 * exists because a gap is invisible to `textContent`, and the accessible
 * name of this control is "LIST 2" only while the space is in the text.
 */
export function BasketButton() {
  const { items, ready } = useBasket();
  const announced = useRef<number | null>(null);

  // The count read back from storage on arrival is the baseline, not news.
  useEffect(() => {
    if (!ready) return;
    const count = items.length;
    if (announced.current === null || announced.current === count) {
      announced.current = count;
      return;
    }
    announced.current = count;
    announce(
      count === 0
        ? 'The list is empty.'
        : `${count} recipe${count === 1 ? '' : 's'} in the list.`,
    );
  }, [ready, items.length]);

  if (!ready || items.length === 0) return null;

  return (
    <Link
      href={basketHref(items)}
      className={cn(
        /* `basket-button` is a test hook, not a style: `e2e/shopping-journey`
           measures this box by that class. `globals.css` still styles it as
           a bordered accent pill pushed right by `margin-left: auto`, so the
           four resets below undo it. Both go at M7 with that file. */
        'basket-button ml-0 rounded-none border-0 bg-transparent p-0',
        '-my-1 flex min-h-6 w-fit shrink-0 flex-row items-center gap-list-360 no-underline',
        'shell:gap-2',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      )}
    >
      <span className="text-09 leading-normal font-mono tracking-label whitespace-nowrap text-ink uppercase shell:text-10">
        {'List '}
      </span>
      <span className="flex shrink-0 flex-row items-center rounded-none bg-accent px-1.5 py-0.5 text-09 leading-normal font-mono tracking-flat text-on-accent shell:px-1.75 shell:text-10">
        {items.length}
      </span>
    </Link>
  );
}

/**
 * Take one recipe out of the basket, from outside a component.
 *
 * This replaced a `setBasket(items)` that wrote a whole array, and the
 * difference is data loss. The shopping list rebuilt that array from the
 * URL, so any recipe in the basket but not in the current `?r=` was
 * destroyed by a removal it had nothing to do with — and the two stores
 * drift apart the moment you add a recipe and then press Back. Measured:
 * add three recipes, go back one page, remove one chip, and the third
 * recipe added seconds earlier through the app's own button is gone, with
 * no warning and no undo.
 *
 * Removal mutates. There is deliberately no way to replace the basket
 * wholesale from here any more.
 */
export function removeFromBasket(slug: string): void {
  write(read().filter((item) => item.slug !== slug));
}

/** Empty the basket. One decision, one call — used by "Clear the list". */
export function clearBasket(): void {
  write([]);
}
