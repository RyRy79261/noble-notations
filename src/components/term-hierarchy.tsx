/**
 * C-09 Term hierarchy, rebuilt onto M3's F/Tag hierarchy.
 *
 * The drawn component is `F/Tag hierarchy` —
 * `design/exports/foundations.html:3568`, on the page at
 * `classes-cuisines-1280.html:1869` and `m360-classes-ingredients.html:2846`
 * — and `src/components/f/tag.tsx` carries it: a recessed `f-desk` panel,
 * `p-[ 16px_18px ]`, two labelled rows twelve pixels apart, each a 90px mono
 * label beside a 16px row of F/Tag.
 *
 * This file adds only the two things the design cannot know: which of the
 * repository's fields feed which row, and where a term's page is.
 *
 * WHY TAGS ARE WORTH A PANEL AT ALL. A tag is only useful if you can widen
 * or narrow from it. Landing on Cajun should say that it is a regional
 * American cuisine and offer the step up, the same way Sicilian should sit
 * visibly under Italian. Without this the hierarchy exists in the database
 * and nowhere a reader can see it.
 *
 * R-CMP-05: nothing is drawn when a term has no parent and no children, and
 * a row is absent when its own list is empty. Most terms are flat, so that
 * is the common case and not an edge. `TagHierarchy` already returns null
 * for it; the guard here is kept so the rule is stated where C-09 is named.
 *
 * THE DESIGN DRAWS THE PARENT WITH ITS TYPE PREFIX AND THE CHILDREN
 * WITHOUT. `Broader > B1` is `('Prefix','Name')` — `PRESERVATION curing` —
 * and every `Narrower > Nn` is `('Name',)`. It is the one place in the
 * system that shows both forms of F/Tag side by side, and it earns its
 * keep: the parent may sit in another facet, the children never do.
 *
 * THE WORDS ARE THE DESIGN'S. `foundations.html:3576` and `:3599` draw
 * `BROADER` and `NARROWER`, and `classes-cuisines-1280.html:1869` draws the
 * same two on the page. The old build said `Part of` and `More specific`;
 * D-07 set the precedent that drawn copy replaces inherited copy, and the
 * two assertions in `e2e/classes.spec.ts` moved with it in the same change.
 * `TagHierarchy` already defaults to these two words, so there is nothing to
 * pass — the overrides are gone rather than reworded.
 *
 * A server component.
 */

import { TagHierarchy, type HierarchyTerm } from '@/components/f/tag';
import { termHref } from '@/components/tags';
import { CATEGORY_TYPE_LABELS } from '@/lib/site';
import type { TermView } from '@/lib/queries/read';

/**
 * One term in the panel. An explanation is only passed where there is a
 * term page to tap through to, which there always is — `HierarchyTerm`
 * pairs the two for R-ACC-10 and the type enforces it.
 */
function toTerm(term: TermView, withPrefix: boolean): HierarchyTerm {
  const prefix = withPrefix
    ? (CATEGORY_TYPE_LABELS[term.categoryType] ?? term.categoryType)
    : undefined;
  const href = termHref(term);
  const facet = CATEGORY_TYPE_LABELS[term.categoryType] ?? term.categoryType;
  return term.description
    ? {
        name: term.label,
        prefix,
        href,
        explanation: term.description,
        /* The narrower terms are drawn bare, so the panel is the only place
           they can say which facet they are in. `f/tag.tsx`, `TOOLTIP_LABEL`. */
        explanationLabel: facet,
      }
    : { name: term.label, prefix, href };
}

export function TermHierarchy({
  parent,
  narrower,
}: {
  parent: TermView | null;
  /** Not named `children`: that prop name is JSX's, and passing it
      explicitly reads as a mistake even where React allows it. */
  narrower: TermView[];
}) {
  if (!parent && narrower.length === 0) return null;

  return (
    <TagHierarchy
      /* The panel's own air while globals.css is still live. Every screen
         around it still spaces its blocks with the old `p { margin }`
         rules, which put 16px above this and nothing below it. M6 takes
         this off when the page owns its own column gap. */
      className="mb-4"
      broader={parent ? [toTerm(parent, true)] : []}
      narrower={narrower.map((term) => toTerm(term, false))}
    />
  );
}
