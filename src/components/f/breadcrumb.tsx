/**
 * F/Breadcrumb — the trail above the hero.
 *
 * Read from `design/exports/foundations.html`, Plate II section F.6,
 * `data-pencil-name="F/Breadcrumb"` at line 2822. Corroborated on twenty
 * screens, for instance `recipe-1280.html:206` (RECIPES · BAUMY BILTONG),
 * `classes-cuisines-1280.html:1748` (CLASSIFICATION · PRESERVATION · CURING)
 * and `batch-logs-1280.html:2202` (BAUMY BILTONG · BATCH LOGS · BATCH FOUR).
 *
 * THE FIRST CRUMB IS THE QUIET ONE. Every trail in the exports draws `L1` in
 * `f-ink-3` and every crumb after it in `f-ink`, whether the trail has two
 * levels or three. That is the design's rule, not the usual "the last one is
 * the current page", and it is followed here as drawn. The separator is a
 * middle dot in `f-hair` with no tracking.
 *
 * `aria-current="page"` on the last crumb, a `<nav>` with a name and an
 * ordered list are this build's: the design draws the picture and says
 * nothing about the markup, and a trail of bare `<div>`s reads as one run-on
 * line. `list-none`, `m-0` and `p-0` were needed while Tailwind's preflight
 * was OFF, up to M7, because the user agent then drew its own markers and
 * indent. The preflight's `ol, ul, menu { list-style: none }` and its
 * `* { margin: 0; padding: 0 }` answer all three since M7, so they are
 * belt-and-braces here — kept for the reason `markdown.tsx` gives on its
 * own list.
 *
 * A server component.
 */

import Link from 'next/link';
import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

import { FOCUS_RING } from './button';

export type Crumb = {
  label: string;
  /** The address. The last crumb usually has none — it is this page. */
  href?: string;
};

export type BreadcrumbProps = HTMLAttributes<HTMLElement> & {
  items: Crumb[];
  /** The accessible name of the navigation landmark. */
  label?: string;
};

/* 9px Geist Mono at 1.2px. No `whitespace-nowrap`: a long recipe title in a
   three-level trail has to be free to wrap at 360 (R-STA-09). */
const CRUMB = 'text-09 font-mono tracking-label uppercase';

/** F/Breadcrumb — a trail of mono micro-labels, eight pixels apart. */
export function Breadcrumb({
  items,
  label = 'Breadcrumb',
  className,
  ...props
}: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label={label} className={cn('w-fit', className)} {...props}>
      <ol className="m-0 flex h-fit w-fit list-none flex-row flex-wrap items-center gap-2 p-0">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          const tone = index === 0 ? 'text-ink-3' : 'text-ink';

          return (
            <li
              key={`${item.label}-${index}`}
              className="flex flex-row items-center gap-2"
            >
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className="text-09 font-mono text-hair"
                >
                  ·
                </span>
              ) : null}
              {item.href ? (
                <Link
                  href={item.href}
                  aria-current={last ? 'page' : undefined}
                  className={cn(CRUMB, tone, 'no-underline', FOCUS_RING)}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={cn(CRUMB, tone)}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
