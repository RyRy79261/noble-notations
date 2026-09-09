'use client';

import { useEffect } from 'react';

/**
 * Publish the sticky header's real height as `--header-h`.
 *
 * Three separate defects were all the same missing number. The header is
 * not a constant: it measured anywhere from 60px to 160px depending on
 * width and whether the basket pill was present. Anything that has to sit
 * clear of it was guessing, and guessing low:
 *
 * - The Ingredients/Method tab strip pinned at `top: 0.5rem`, which put it
 *   *inside* the header band once it stuck. Hit-testing its centre returned
 *   the header, so on a phone — where the inactive panel is `display:none`
 *   — the only route to the method was a button that ate the tap, or worse,
 *   passed it through to a nav link and left the recipe entirely.
 * - The ingredient aside pinned at `top: 5rem` (80px), under a header that
 *   is 107.7px at 390 and 144.1px at 768.
 * - "Skip to content" scrolled the heading it was skipping to underneath
 *   the header.
 *
 * A `ResizeObserver` rather than a media query because the height depends
 * on content, not only on width: the same 390px viewport is 107.7px with
 * an empty basket and 115.2px with a full one.
 *
 * M3 rebuilt the header and the number is smaller now — 57px at 360 with a
 * list, 54 without, 66 at 1280 — but it is still not a constant, so
 * R-NAV-05 still needs this.
 *
 * The selector is `[data-site-header]` and not a class. The rebuilt header
 * deliberately never carried `globals.css`'s own name for itself, which drew
 * a blur, a `color-mix` ground and its own padding — none of the three in the
 * design. That file went at M7 and the attribute is what it always was: a
 * hook with no stylesheet attached to it.
 */
export function HeaderHeight() {
  useEffect(() => {
    const header = document.querySelector('[data-site-header]');
    if (!header) return;

    const publish = () => {
      document.documentElement.style.setProperty(
        '--header-h',
        `${Math.round(header.getBoundingClientRect().height)}px`,
      );
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return null;
}
