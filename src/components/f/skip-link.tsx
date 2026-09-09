/**
 * F/Skip link — the first control in the page.
 *
 * Read from `design/exports/foundations.html`, Plate II section F.1,
 * `data-pencil-name="F/Skip link"` at line 1749. It is drawn once, and it is
 * drawn IN ITS FOCUSED STATE — the only focus state in all eighteen exports.
 * Its own caption at line 1760 is the contract:
 *
 *   FIRST CONTROL IN THE PAGE · OFF SCREEN UNTIL IT TAKES KEYBOARD FOCUS ·
 *   MOVES FOCUS TO #MAIN
 *
 * Two details are easy to get wrong and both are followed here:
 *
 *   - The ring is `f-ink` at 2px, NOT `f-accent`. The design put the darkest
 *     ink around the accent block; that is 15.31:1 against the page.
 *   - The label tracks at 1.2px (`tracking-label`), where F/Button tracks at
 *     1.5px at the same 10px size.
 *
 * The hidden state is not drawn; the caption states it. It is built here
 * with a fixed position off the top of the viewport rather than `sr-only`,
 * because the screen-reader-only utility and the one that reveals it again
 * both set `position` and would fight
 * the offset in the same variant. Off-screen and not `display: none` is what
 * a skip link needs: it has to stay focusable and stay in the tab order.
 *
 * R-ACC-04 is the caller's half. `src/app/layout.tsx` must put `id="main"`
 * and `tabIndex={-1}` on `<main>`, or Safari moves the scroll and not the
 * focus.
 *
 * A server component. `:focus` does all the work in CSS.
 */

import type { AnchorHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type SkipLinkProps = AnchorHTMLAttributes<HTMLAnchorElement>;

/** F/Skip link — off screen until it takes the keyboard focus. */
export function SkipLink({
  href = '#main',
  children = 'Skip to content',
  className,
  ...props
}: SkipLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        /* Off the top of the viewport, and back to 8px on focus. `-top-16`
           is 64px up; the control is about 30px tall. */
        'fixed left-2 -top-16 z-50 focus:top-2',
        'inline-flex h-fit w-fit shrink-0 items-center',
        /* `8px 14px`. 14px is off the gap scale; `--spacing-section-360`
           also holds 14px but its name would be a lie here. See the note in
           `mark.tsx`. */
        'px-3.5 py-2',
        'rounded-none no-underline bg-accent',
        'text-10 font-mono tracking-label uppercase whitespace-nowrap text-on-accent',
        /* The design's own ring: 2px solid ink, flush against the block.
           `foundations.html:1750` writes `[ outline:2px_solid_#2B1F1C ]` and
           no offset at all, so flush is 0. The spaces inside the brackets
           are deliberate: Tailwind v4 scans raw source text, comments and
           all, so writing the class string closed would ship a real rule
           carrying a raw hex and break R-BLD-02. AGENTS.md names the trap.

           `outline-offset-0` is written and not left out. Until M7 the
           global `:focus-visible` rule in `globals.css` added 2px here;
           deleting that file did not take the offset to 0, it took it to
           Chromium's own `:focus-visible` default of 1px — measured, after
           one Tab on `/` at 1280. Nothing else in the build writes the
           property at 0, so the class is the only thing that makes the
           drawn ring match the drawing. */
        'focus:outline-2 focus:outline-offset-0 focus:outline-ink',
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}
