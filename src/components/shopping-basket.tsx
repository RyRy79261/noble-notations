'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

/**
 * A basket of recipes to shop for, collected as you browse.
 *
 * The `/shopping-list` page takes its selection from the URL, which makes a
 * list shareable but means you have to already know what you want before
 * you get there. This is the other direction: add a recipe while reading
 * it, then open the basket and build one list from everything collected.
 *
 * The basket lives in localStorage rather than the URL — it is a working
 * set, per browser, and putting six slugs in every link would be noise.
 * Handing off to `/shopping-list?r=…` at the end is what makes the result
 * shareable, so both properties are kept where each belongs.
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

export function basketHref(items: BasketRecipe[]): string {
  const params = new URLSearchParams();
  for (const item of items) params.append('r', item.slug);
  return `/shopping-list?${params}`;
}

/** "Add to shopping list", for a recipe page. */
export function AddToBasket({ slug, title }: BasketRecipe) {
  const { items, ready, add, remove } = useBasket();
  const inBasket = items.some((item) => item.slug === slug);

  // Rendering nothing until mounted keeps the server markup and the first
  // client render identical; the label depends on localStorage, which the
  // server cannot see.
  if (!ready) return null;

  return (
    <button
      type="button"
      className={inBasket ? 'button-secondary' : 'button-primary'}
      onClick={() => (inBasket ? remove(slug) : add({ slug, title }))}
    >
      {inBasket ? 'In shopping list ✓' : 'Add to shopping list'}
    </button>
  );
}

/**
 * Header control: how many recipes are collected, and the way to the list.
 *
 * This used to open a dialog listing the collected *recipes*, under the
 * heading "Shopping list". Opening something called a shopping list and
 * finding recipe titles with remove buttons is not a shopping list, and the
 * actual list was another click away behind "Build the list". So the
 * control is now a link straight to it. One tap, ingredients.
 *
 * It also lives outside the nav. The nav scrolls sideways on a phone and
 * this was its last child, which put it several hundred pixels off the
 * right edge of a 390px screen — present in the DOM, reachable by a
 * sideways drag nobody would guess to make.
 */
export function BasketButton() {
  const { items, ready } = useBasket();

  if (!ready || items.length === 0) return null;

  return (
    <Link href={basketHref(items)} className="basket-button">
      Shopping list <span className="basket-count">{items.length}</span>
    </Link>
  );
}

/**
 * Replace the basket wholesale.
 *
 * The shopping list page drives its selection from the URL, so changing the
 * recipes there has to write back here — otherwise the header count keeps
 * counting recipes the list no longer contains, and the basket only ever
 * grows.
 */
export function setBasket(items: BasketRecipe[]): void {
  write(items);
}
