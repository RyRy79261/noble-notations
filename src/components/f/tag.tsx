/**
 * F/Tag, F/Tag CTA and F/Tag hierarchy — the three term shapes.
 *
 * Read from `design/exports/foundations.html`, Plate II:
 *   F/Tag           section F.2, line 2022
 *   F/Tag CTA       section F.2, line 2087
 *   F/Tag hierarchy section F.8, line 3568
 * Corroborated in `recipe-1280.html`, `recipe-360.html`,
 * `classes-cuisines-1280.html` and `m360-classes-ingredients.html`.
 *
 * F/Tag has no chrome at all: no ground, no border, no radius, no padding.
 * It is a 9px mono prefix and a 13px sans name, eight pixels apart. That is
 * the whole component, and it is drawn one way — 187 light and 69 dark
 * instances of the name run, every one of them `f-ink`. There is no primary
 * form and no hover form; see the note on `primary` below.
 *
 * F/Tag CTA is the ONLY shipping component in this system with a radius.
 * Everything else is square.
 *
 * These are server components. The explanation is the one part that needs
 * the browser, and it needs it only on a tag that has one: the Radix trigger
 * and panel are the client boundary, and the tag itself renders on the
 * server either way (R-CON-01).
 */

import Link from 'next/link';
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { FOCUS_RING } from './button';

const TAG_ROW = 'inline-flex h-fit w-fit shrink-0 items-center gap-2';

const TAG_PREFIX = cn(
  'text-09 font-mono tracking-label uppercase whitespace-nowrap',
  'text-ink-3',
);

/* No `whitespace-nowrap` here on purpose. The exports carry it on nearly
   every text node, including whole sentences; it is a design-file artefact.
   A term name can be long, and this one has to be free to wrap at 360 or
   `pnpm audit:ui` reports the overflow (R-STA-09). */
const TAG_NAME = 'text-13 font-sans text-ink';

/**
 * R-ACC-10 — WHY AN EXPLANATION REQUIRES AN `href`.
 *
 * The explanation is shown in a tooltip, and a tooltip has no coarse-pointer
 * story. Radix never opens one for touch: `onPointerMove` returns early when
 * `pointerType === 'touch'`, `onPointerDown` closes it and sets a flag, and
 * the `onFocus` that follows the tap is suppressed by that flag. So a tap
 * cannot reveal it and no amount of styling here changes that.
 *
 * The old build's answer, recorded at `globals.css` line 752, is that a tap
 * NAVIGATES: "Coarse pointers have no hover … Tapping the tag navigates to
 * the term page, which shows the same blurb as body text." That answer only
 * exists while the tag has somewhere to go, and the shape it does not cover
 * — an explanation on a `<span>` with no `href` — is a focusable element
 * with no role, no destination and no route to its own text on a phone.
 *
 * The type makes that shape unrepresentable rather than documenting it. C-07
 * describes the same pairing ("It links to the term page. It shows the term
 * explanation"), so nothing the design draws is lost.
 */
export type TagProps = Omit<HTMLAttributes<HTMLElement>, 'prefix'> & {
  /** The term. Drawn as written — the design does not change its case. */
  name: string;
  /**
   * The category type, drawn ahead of the name in 9px mono. Optional: the
   * recipe card's tags and F/Tag hierarchy's narrower terms drop it, and the
   * recipe hero and the classification trail keep it. F/Tag hierarchy is the
   * one place the design shows both forms side by side.
   */
  prefix?: string;
  /**
   * C-07 lists a primary state. The design does not draw one: on
   * `recipe-1280.html` the cuisine is the primary term and it is drawn
   * identically to the four beside it. This prop therefore sets
   * `data-primary` and changes nothing visually, so the distinction survives
   * in the DOM until the designer rules on a treatment for it.
   */
  primary?: boolean;
} & (
    | {
        /** The term explanation. Shown on hover and on focus (R-CMP-03). */
        explanation: string;
        /** The term page. Required beside an explanation — see above. */
        href: string;
      }
    | {
        explanation?: undefined;
        /** The term page. A tag without one is drawn on a `<span>`. */
        href?: string;
      }
  );

/**
 * F/Tag — one term.
 *
 * How R-CMP-03, R-CMP-04 and R-ACC-03 are met:
 *
 *   - The explanation goes in the vendored `Tooltip` from
 *     `src/components/ui/`. Radix opens it on pointer hover AND on keyboard
 *     focus, which is R-CMP-03 and R-ACC-02.
 *   - Radix writes `aria-describedby` on the trigger and points it at the
 *     panel, which is R-ACC-03.
 *   - The `title` attribute is never used. R-CMP-04 forbids it: it cannot be
 *     styled, it delays, and it never appears on keyboard focus.
 *   - R-ACC-10 is met by the `href` the type demands beside an explanation:
 *     a tap on a coarse pointer navigates to the term page, which sets the
 *     same blurb as body text. The note on `TagProps` has the measurement.
 *
 * R-CMP-08 — how this differs from the other three marks a reader meets:
 * F/Mark is a solid accent block of 9px letterspaced mono capitals; F/Tag
 * has no ground, no border and no padding at all and sets its name in 13px
 * Geist at the term's own case; F/Tag CTA is the one rounded pill, 15px
 * Newsreader on the accent wash inside a hairline outline. The step chip
 * (F/Ingredient callout) and the shop chip (F/List mark) are M4's, and the
 * design separates them the same way — a full 1px border box and an 11.5px
 * mono source chip.
 */
export function Tag({
  name,
  prefix,
  href,
  explanation,
  primary,
  className,
  ...props
}: TagProps) {
  const body = (
    <>
      {prefix ? <span className={TAG_PREFIX}>{prefix}</span> : null}
      <span className={TAG_NAME}>{name}</span>
    </>
  );

  const term = href ? (
    <Link
      href={href}
      data-primary={primary ? 'true' : undefined}
      className={cn(TAG_ROW, 'no-underline', FOCUS_RING, className)}
      {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
    >
      {body}
    </Link>
  ) : (
    <span
      data-primary={primary ? 'true' : undefined}
      className={cn(TAG_ROW, className)}
      {...props}
    >
      {body}
    </span>
  );

  if (!explanation) return term;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{term}</TooltipTrigger>
      <TooltipContent>{explanation}</TooltipContent>
    </Tooltip>
  );
}

/* ── F/Tag CTA ─────────────────────────────────────────────────────────── */

/*
 * The one rounded thing in the system, and the one with the least contrast
 * margin in the palette. `f-cta-line` clears WCAG 1.4.11's 3:1 by 0.11 in
 * the light theme. On `f-desk` it is 2.79:1 and on `f-accent-wash` it is
 * 2.72:1, and both fail — so this pill goes on the page ground and nowhere
 * else. TOKEN-MAP.md §7.
 *
 * The outline is an outline, not a border: it must not take part in the box,
 * and the design offsets it half a pixel inwards so the corner stays clean.
 */
const TAG_CTA_BASE = cn(
  'inline-flex h-fit w-fit shrink-0 items-center gap-3 no-underline',
  'rounded-chip bg-accent-wash',
  'outline-1 outline-offset-[-0.5px] outline-cta-line',
  'px-3.5 py-2.5',
);

export type TagCTAProps = Omit<HTMLAttributes<HTMLElement>, 'prefix'> & {
  name: string;
  /** The recipe count. Optional — the design draws the pill both ways. */
  count?: ReactNode;
  href?: string;
};

/** F/Tag CTA — the pill on the classification and cuisine indexes. */
export function TagCTA({
  name,
  count,
  href,
  className,
  ...props
}: TagCTAProps) {
  const body = (
    <>
      <span className="text-15 font-serif text-ink">{name}</span>
      {count === undefined || count === null ? null : (
        <span className="text-10 font-mono tracking-micro tabular-nums text-accent whitespace-nowrap">
          {count}
        </span>
      )}
    </>
  );

  if (!href) {
    return (
      <span className={cn(TAG_CTA_BASE, className)} {...props}>
        {body}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(TAG_CTA_BASE, FOCUS_RING, className)}
      {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
    >
      {body}
    </Link>
  );
}

/* ── F/Tag hierarchy ───────────────────────────────────────────────────── */

/** One term in the hierarchy. It carries the same pairing `TagProps` does:
 *  an explanation only where there is a term page to tap through to. */
export type HierarchyTerm = { name: string; prefix?: string } & (
  | { explanation: string; href: string }
  | { explanation?: undefined; href?: string }
);

export type TagHierarchyProps = HTMLAttributes<HTMLDivElement> & {
  /** The parent terms. The design draws these WITH their type prefix. */
  broader?: HierarchyTerm[];
  /** The more specific terms. The design draws these bare. */
  narrower?: HierarchyTerm[];
  broaderLabel?: string;
  narrowerLabel?: string;
};

const HIERARCHY_LABEL = cn(
  'w-col-narrow shrink-0',
  'text-09 font-mono tracking-label uppercase text-ink-3',
);

/**
 * F/Tag hierarchy — a recessed panel of two labelled rows.
 *
 * R-CMP-05: it renders nothing when the term has no parent and no children,
 * and a row is absent when its own list is empty. Most terms are flat, so
 * this is the common case and not an edge.
 *
 * The label column is a fixed 90px, which is `f-gap-90` — a width in this
 * system and never a gap, so it is `w-col-narrow` and not a raw 90px width
 * (TOKEN-MAP.md §4.4).
 *
 * `flex-wrap` on the term group is this build's and not the design's: the
 * design draws four narrower terms on one 1160px row, and the same four need
 * somewhere to go at 360 (R-STA-09).
 */
export function TagHierarchy({
  broader = [],
  narrower = [],
  broaderLabel = 'Broader',
  narrowerLabel = 'Narrower',
  className,
  ...props
}: TagHierarchyProps) {
  if (broader.length === 0 && narrower.length === 0) return null;

  const row = (label: string, terms: HierarchyTerm[]) =>
    terms.length === 0 ? null : (
      <div className="flex w-full flex-row items-start gap-4">
        <span className={HIERARCHY_LABEL}>{label}</span>
        <div className="flex flex-1 flex-row flex-wrap items-center gap-4">
          {terms.map((term) => (
            <Tag
              key={`${term.prefix ?? ''}:${term.name}`}
              name={term.name}
              prefix={term.prefix}
              {...(term.explanation === undefined
                ? { href: term.href }
                : { href: term.href, explanation: term.explanation })}
            />
          ))}
        </div>
      </div>
    );

  return (
    <div
      className={cn(
        'flex h-fit w-full shrink-0 flex-col items-start gap-3',
        'bg-desk px-4.5 py-4',
        className,
      )}
      {...props}
    >
      {row(broaderLabel, broader)}
      {row(narrowerLabel, narrower)}
    </div>
  );
}
