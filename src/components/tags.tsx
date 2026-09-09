/**
 * C-07 Term tag and C-08 Term list, rebuilt onto M3's F/Tag.
 *
 * The drawn component is `F/Tag` — `design/exports/foundations.html`, Plate
 * II section F.2, line 2022 — and `src/components/f/tag.tsx` already carries
 * it: no ground, no border, no radius, no padding, a 9px mono prefix and a
 * 13px sans name eight pixels apart. This file holds only the two things
 * that are about the repository's own data rather than about the mark: the
 * address a term lives at, and the row a list of them makes.
 *
 * THE ROW. `F/Recipe card > Tags` is `flex flex-row gap-[ 16px ] items-center`
 * (`home-recipes-1280.html:498`), and `F/Tag hierarchy > Narrower` is the
 * same 16px row. That is `gap-4`, and it is the whole of C-08's geometry.
 *
 * ─── R-CMP-08, held at arm's length ──────────────────────────────────────
 *
 * A reader meets four marks and has to tell them apart without reading
 * them. Plate II section F.2 lines all four up in one row and its caption
 * gives the rule: "F takes E's method and lets exactly one of them — the
 * mark — stay solid, because a kind badge has to shout a little."
 *
 *   THE BADGE (F/Mark) is the only solid block of colour: `f-accent`
 *     ground, `f-on-accent` text, 9px letterspaced mono CAPITALS, 4px over
 *     9px of padding.
 *   THE TERM TAG (this file) has no chrome whatsoever — no ground, no
 *     border, no radius, no padding at all — and sets its name in 13px
 *     Geist in the term's own case. It is running text with a link on it.
 *   THE STEP CHIP (F/Ingredient callout) is the only thing in the system
 *     with a border on all four sides: one 1px `f-hair` box holding two
 *     cells at `gap-0`, an `f-accent-wash` mono amount butted against an
 *     unfilled sans name.
 *   THE SHOP CHIP (F/List mark) is the only one with a marker glyph: an
 *     8×8 solid `f-accent` square on an `f-desk` ground, then the name.
 *
 * Six axes separate them — ground, border, marker, face, size and case —
 * and no two share more than three. The term tag is the one with nothing:
 * if it has a ground, a box or a dot, it has become one of the other three.
 *
 * ─── The `/classes` pill is NOT this component with a ground ─────────────
 *
 * `classes-cuisines-1280.html:389` draws the terms on the classification
 * index as `p-[ 4px_9px_4px_10px ] bg-[ #F3EDE5 ]` with an 8px accent square —
 * a screen-level treatment on that one index, 52 uses. It is F/Tag given a
 * ground by the page, not a second tag component, and it belongs to M6 with
 * the rest of that screen. `className` passes through here for exactly that.
 *
 * ─── R-CMP-03, R-CMP-04, R-ACC-03 and the sixteen duplicate identifiers ──
 *
 * The explanation is the vendored Radix tooltip, through `F/Tag`. It opens
 * on pointer hover AND on keyboard focus (R-CMP-03, R-ACC-02), Radix writes
 * `aria-describedby` on the trigger (R-ACC-03), and the `title` attribute is
 * never used (R-CMP-04). `src/components/f/tag.tsx` has the long note; do
 * not reimplement any of it here.
 *
 * That is also the fix for the sixteen `duplicate-id` faults `pnpm audit:ui`
 * has reported since M2, every one of them from this file. The old build
 * derived the tooltip's identifier from the term —
 * `term-blurb-${categoryType}-${slug}` — which is unique per TERM and not
 * per OCCURRENCE. Every page that draws one term twice therefore emitted
 * the same `id` twice: a recipe grid where two cards share a cuisine, or
 * the home page, where a term can appear both on a card and in the
 * classification block below it. Radix takes its identifier from React's
 * own `useId`, which is unique per mounted instance, and it renders the
 * panel only while it is open — so this file now emits no `id` at all, and
 * the count cannot come back by rendering the same term twice.
 *
 * A server component. The browser half is the tooltip, inside F/Tag.
 */

import { Tag } from '@/components/f/tag';
import { CATEGORY_TYPE_LABELS } from '@/lib/site';
import { cn } from '@/lib/utils';
import type { TermView } from '@/lib/queries/read';

/**
 * Where a term lives. A cuisine has a short address of its own; every other
 * facet sits under its type. Exported because `TermHierarchy` needs the
 * same answer and two copies of this would drift.
 */
export function termHref(term: Pick<TermView, 'categoryType' | 'slug'>) {
  return term.categoryType === 'cuisine'
    ? `/cuisines/${term.slug}`
    : `/classes/${term.categoryType}/${term.slug}`;
}

export type TermTagProps = {
  term: TermView;
  /** Draw the category type ahead of the name, in 9px mono. */
  showFacet?: boolean;
  /**
   * The `/classes` drawing — an `f-desk` ground and an 8px accent square.
   * Forwarded to F/Tag, which owns it; see the `TAG_PILL` note there and
   * BUILD-PLAN §4.1. It is a prop rather than a `className` because the
   * square is a DOM node and a ground alone cannot draw it, which is what
   * the header above anticipated. Defaults to the bare tag, so the recipe
   * card, the recipe hero and the hierarchy are unchanged.
   */
  pill?: boolean;
  className?: string;
};

/**
 * C-07 — one term, as a link to its own page, explaining itself.
 *
 * A term with no explanation is a plain link and not an error state: every
 * term is created on demand when a recipe is tagged, so an undescribed term
 * is normal (R-STA-05).
 *
 * `tag-wrap` is a SELECTOR, not a style. `e2e/filtering.spec.ts` counts
 * `.tag-wrap` to prove that filtering `/classes` hides rows, and that suite
 * belongs to M7. The two declarations globals.css hangs on the name —
 * `position: relative` and `display: inline-flex` — are what F/Tag draws
 * anyway, so the class changes nothing on the page. It goes when M7 deletes
 * globals.css and rewrites the assertion.
 */
export function TermTag({
  term,
  showFacet = false,
  pill = false,
  className,
}: TermTagProps) {
  const facet = CATEGORY_TYPE_LABELS[term.categoryType] ?? term.categoryType;

  const shared = {
    name: term.label,
    prefix: showFacet ? facet : undefined,
    primary: term.isPrimary,
    pill,
    className: cn('tag-wrap', className),
  };

  /* The two shapes are written out rather than spread, because `TagProps`
     pairs `explanation` with `href` in a union: an explanation is only
     legal where there is a term page for a coarse pointer to tap through
     to (R-ACC-10). Both branches have one, so nothing is lost. */
  return term.description ? (
    <Tag
      {...shared}
      href={termHref(term)}
      explanation={term.description}
      /* The facet goes in the panel on EVERY described term, whether or not
         the tag itself draws the prefix. The old build did the same, and it
         matters: the same word lives in two facets. `f/tag.tsx` has the
         reasoning at `TOOLTIP_LABEL`. */
      explanationLabel={facet}
    />
  ) : (
    <Tag {...shared} href={termHref(term)} />
  );
}

/*
 * The `+n` chip is NOT DRAWN. Grepped for `+[0-9]` across all eighteen
 * exports: nothing. The design draws exactly three terms on a recipe card
 * and no overflow mark of any kind. C-08 asks for one, so it ships, and it
 * is built from the quietest things already in the palette rather than from
 * an invented treatment: 13px to sit on the name's own line, the mono face
 * with tabular figures because it is a number (R-CON-06), `f-ink-3` because
 * it is the least of the row. No ground and no border — a `+n` with a box
 * would read as the step chip (R-CMP-08). Open item for the designer.
 */
const OVERFLOW = cn(
  'inline-flex h-fit w-fit shrink-0 items-center',
  'text-13 font-mono tabular-nums text-ink-3',
);

export type TermListProps = {
  terms: TermView[];
  showFacet?: boolean;
  /** Show at most this many, then a `+n` chip. */
  limit?: number;
  className?: string;
};

/** C-08 — a row of terms, wrapping, with a `+n` chip for the rest. */
export function TermList({
  terms,
  showFacet = false,
  limit,
  className,
}: TermListProps) {
  if (terms.length === 0) return null;
  const shown = limit ? terms.slice(0, limit) : terms;
  const hidden = terms.length - shown.length;

  return (
    <div
      className={cn(
        /* `flex-wrap` is this build's and not the design's: the design draws
           three terms on a 286px card at 1280 and the same three have to go
           somewhere at 360 (R-STA-09). */
        'flex w-full flex-row flex-wrap items-center gap-4',
        className,
      )}
    >
      {shown.map((term) => (
        <TermTag key={term.id} term={term} showFacet={showFacet} />
      ))}
      {hidden > 0 ? (
        <span className={OVERFLOW}>
          +{hidden}
          {/* "+2" alone is a glyph and a digit. Screen readers get the
              noun. */}
          <span className="sr-only"> more terms</span>
        </span>
      ) : null}
    </div>
  );
}
