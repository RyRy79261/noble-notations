/**
 * F/Button — the one filled control.
 *
 * Read from `design/exports/foundations.html`, Plate II section F.6,
 * `data-pencil-name="F/Button"` at line 2849 and its `Quiet` sibling at
 * line 2860.
 *
 * There is exactly one size. Every accent-filled padded box in the eighteen
 * exports was enumerated: 11px over 18px of padding, with a 10px Geist Mono
 * label at 1.5px tracking, is the only button shape — 36 times, at both 1280
 * and 360, in both themes. ADD TO LIST, PRINT THE LIST, SEARCH, COPY
 * ADDRESS, SIGN IN, BACK TO THE CATALOGUE, SEE ALL SCIENCE, BROWSE, ALL
 * RECIPES, GO TO THE SIXTH REVISION. There is no small, no large, no
 * icon-only, no destructive, no ghost and no link variant. F.6's caption is
 * the intent: "One filled control per view. Everything else is a hairline or
 * nothing at all."
 *
 * Two things that look like a button are not one, and M4 and M5 must not
 * reuse this file for them: the bare text control (CLEAR ALL SIX FIELDS,
 * 10px mono on no ground at all) and the batch preset chip (7px over 11px on
 * paper, 12px mono, the selected one filled).
 *
 * A server component. The design draws no hover, focus, disabled or pressed
 * state, so there is nothing here that needs the browser.
 */

import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * The focus ring this build invents, and the reason it has to.
 *
 * The design draws exactly ONE focus state in eighteen files: F/Skip link's
 * `outline: 2px solid #2B1F1C`. No field, no filter, no button, no tag and
 * no pill carries a focus ring, a focus ground or a focus border anywhere.
 * R-ACC-05 says each control MUST show a visible focus state, so there is no
 * drawn answer to copy and this milestone has to invent one.
 *
 * It follows the only precedent the design gives — a solid outline, 2px, no
 * radius — and takes its colour from `ring`, which TOKEN-MAP.md already maps
 * to `f-accent` for this purpose. That is 8.06:1 on the light page and
 * 6.92:1 on the dark page, so it clears WCAG 1.4.11's 3:1 with room. The
 * offset keeps the ring clear of a filled ground.
 *
 * This is the second deliberate departure from the design file, after
 * TOKEN-MAP.md §5 item 5's `input` boundary. Both are recorded in the M3
 * report for DECISIONS.md.
 *
 * It lives in this file because F/Button is the control primitive; F/Field,
 * F/Filter and F/Tag import it rather than each repeating the string, so a
 * change to the ring is one edit and not four.
 */
export const FOCUS_RING = cn(
  'focus-visible:outline-2 focus-visible:outline-offset-2',
  'focus-visible:outline-ring',
);

/**
 * The body link, and why it is an underline. D-10 in `design/DECISIONS.md`.
 *
 * There are ZERO underlines and zero in-body links in the eighteen exports,
 * so there is nothing to copy. Colour alone cannot carry it: `f-accent`
 * measures 1.90:1 against `f-ink` (8.06 against 15.31 on the paper), well
 * under the 3:1 that WCAG 1.4.1 asks of a link distinguished from its
 * surrounding text by colour only. An underline is the only cue available
 * that the design does not already spend on something else.
 *
 * `text-cta-line` must never be used here. TOKEN-MAP.md §7 forbids it as
 * text: it is 3.11:1 at best, against the 4.5:1 R-ACC-01 asks for.
 *
 * It lives beside `FOCUS_RING` for the same reason `FOCUS_RING` lives here:
 * both are treatments this build invented, both compose, and this file is
 * the leaf every component can reach. It was in `markdown.tsx` until
 * `database-notice.tsx` wanted it too — and that pulled `react-markdown` and
 * `remark-gfm` into the server module graph of all eighteen routes that can
 * draw the notice, for four class names.
 */
export const PROSE_LINK = cn(
  'text-accent underline decoration-1 underline-offset-2',
  FOCUS_RING,
);

/**
 * The same ring for a control whose focusable element is a child — the
 * select box, where the chevron shares the frame with the `<select>`.
 * `focus-within` rather than `focus-visible-within`, which no browser has.
 */
export const FOCUS_RING_WITHIN = cn(
  'focus-within:outline-2 focus-within:outline-offset-2',
  'focus-within:outline-ring',
);

/*
 * `appearance-none`, `border-0` and `rounded-none` are not decoration. The
 * Tailwind preflight is OFF until M7 (BUILD-PLAN §3.1), so a bare <button>
 * still carries the user agent's own border, ground, radius and font. Each
 * one has to be turned off by hand.
 *
 * 18px and 11px are both off BUILD-PLAN §2.3's gap scale. See the note
 * in `mark.tsx` on why every off-scale padding in M3 is an arbitrary value.
 */
const BUTTON_BASE = cn(
  'inline-flex h-fit w-fit shrink-0 items-center justify-center',
  'appearance-none rounded-none border-0 no-underline',
  'px-4.5 py-2.75',
  'text-10 font-mono tracking-spine uppercase whitespace-nowrap',
  FOCUS_RING,
);

const VARIANTS = {
  /** 36 instances. `#8E2A1E` ground, `#FCFAF6` label. 8.06:1 / 6.92:1. */
  primary: 'bg-accent text-on-accent',
  /**
   * 3 instances. No ground at all — the design writes a fully transparent
   * fill — and a 1px `f-hair` outline at a half-pixel inward offset. An
   * outline, not a border: it must not take part in the box.
   */
  quiet: cn(
    'bg-transparent text-ink',
    'outline-1 outline-offset-[-0.5px] outline-hair',
  ),
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

/**
 * The class string for F/Button, for a caller that has to draw the control
 * on an element this file does not render — most often a `next/link`
 * `<Link>`, which a design primitive should not import.
 */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  className?: string,
): string {
  return cn(BUTTON_BASE, VARIANTS[variant], className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

/** F/Button on a `<button>`. `type` defaults to `button`, not `submit`. */
export function Button({
  variant = 'primary',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, className)}
      {...props}
    />
  );
}

export type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
};

/**
 * F/Button on an `<a>`. Use it for an address that leaves the app. Inside
 * the app, put `buttonClasses()` on a `<Link>` so the navigation stays
 * client side.
 */
export function ButtonLink({
  variant = 'primary',
  className,
  ...props
}: ButtonLinkProps) {
  return <a className={buttonClasses(variant, className)} {...props} />;
}
