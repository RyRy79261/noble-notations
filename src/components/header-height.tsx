'use client';

import { useEffect } from 'react';

/**
 * Publish the sticky header's real height as `--header-h`.
 *
 * Three separate defects were all the same missing number. The header is
 * not a constant: `.site-header-inner` wraps, so it measures anywhere from
 * 60px to 160px depending on width and whether the basket pill is present.
 * Anything that has to sit clear of it was guessing, and guessing low:
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
 */
export function HeaderHeight() {
  useEffect(() => {
    const header = document.querySelector('.site-header');
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
