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

  const clear = useCallback(() => write([]), []);

  return { items, ready, add, remove, clear };
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

/** Header control: opens the basket, shows how much is in it. */
export function BasketButton() {
  const { items, ready, remove, clear } = useBasket();
  const [open, setOpen] = useState(false);

  // Escape closes it, because a dialog that traps you is worse than none.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!ready || items.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="basket-button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        Shopping list <span className="basket-count">{items.length}</span>
      </button>

      {open ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="basket-title"
          >
            <div className="section-head">
              <h2 id="basket-title">Shopping list</h2>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            <ul className="basket-list">
              {items.map((item) => (
                <li key={item.slug}>
                  <Link href={`/recipes/${item.slug}`}>{item.title}</Link>
                  <button
                    type="button"
                    className="basket-remove"
                    onClick={() => remove(item.slug)}
                    aria-label={`Remove ${item.title}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>

            <div className="modal-actions">
              <Link
                href={basketHref(items)}
                className="button-primary"
                onClick={() => setOpen(false)}
              >
                Build the list
              </Link>
              <button
                type="button"
                className="button-secondary"
                onClick={clear}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
