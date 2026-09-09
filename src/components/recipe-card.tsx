/**
 * C-05 the recipe card and C-06 the recipe grid, §9.2 of the specification.
 *
 * This file is the DATA layer. It takes a `RecipeSummaryView` and fills the
 * drawn shapes in `src/components/f/recipe-card.tsx`; it holds no geometry
 * and no colour of its own. `RecipeCard` and `RecipeGrid` keep the names and
 * the prop shapes the seven calling screens already pass, so no page needed
 * an edit for this milestone.
 *
 * FOUR PLACES WHERE THE DESIGN OVERRULES C-05, all recorded in the M4
 * report. R-BLD-03 makes the design the source of truth for how a screen
 * reads, and each of these is a measurement rather than a preference.
 *
 * 1. THE REVISION IS NOT A BADGE. C-05 asks for "a kind badge, a revision
 *    badge". The design draws no F/Mark quiet on a card at all: the revision
 *    is the second segment of the mono `Code` run, `NN-04-02 · SIXTH
 *    REVISION`, in 9px `f-ink-3` beside the kind. Two solid blocks where the
 *    design draws one would break F.2's rule that exactly one of the four
 *    species of mark carries a fill. The old `<span class="badge">rev 6
 *    </span>` is gone.
 *
 *    We have no catalogue number to put in the first segment — nothing in
 *    the schema holds one — so the run is the revision alone. R-STA-05: the
 *    absent segment is dropped, not filled with a placeholder.
 *
 *    THE OLD `revisionNumber > 1` GUARD IS ALSO GONE, and that is the
 *    design's doing rather than an oversight. Five of the six cards on `/`
 *    and `/recipes` read `NN-05-02 · FIRST REVISION`, `NN-09-03 · FIRST
 *    REVISION`, `NN-07-01 · FIRST REVISION`, `NN-02-07 · FIRST REVISION`
 *    (`home-recipes-1280.html:774`, `:696`, `:607`, `:523`) and only the
 *    biltong is deeper. The design states the revision on every card because
 *    the point of the repository is that everything has one; hiding it on the
 *    unrevised card is what would make the number look like an exception.
 *    The string itself is `revisionOrdinal` in `src/lib/site.ts`, which
 *    returns `undefined` below revision one so the segment is still dropped
 *    for a number that is not a revision at all.
 *
 * 2. THE BADGE IS DRAWN ON EVERY CARD, INCLUDING A PLAIN RECIPE. The old
 *    build hid it when `kind === 'recipe'`; `home-recipes-1280.html:417`
 *    draws RECIPE, and `:585` and `:2253` draw PREPARATION and RESEARCH in
 *    the same solid `f-accent` block. The word tells them apart (R-CMP-07),
 *    so hiding the commonest word is what would make the kinds hard to tell
 *    apart, not what makes them easy.
 *
 * 3. THE SUMMARY IS NOT CUT. C-05 cuts it at 160 characters. The design
 *    draws a card summary of 181 characters on `/cuisines/[slug]`
 *    (`classes-cuisines-1280.html`) and of 245 on the same card in
 *    `dark-screens.html` and `m360-batch-search-list.html`, both uncut, and
 *    there is not one `line-clamp`, `text-overflow` or `truncate` in the
 *    eighteen exports. A 160-character cut would visibly cut the design's
 *    own cards, so the cut is a rule about the DATA and not about the card.
 *    The card renders what it is given and wraps freely. Recorded as D-11 in
 *    `design/DECISIONS.md`, because it is a departure from §9.2 and not a
 *    reading of it.
 *
 * 4. THREE TERMS, AND NO `+n` CHIP. C-05 allows four. Twenty-six cards in
 *    the exports draw exactly three, one draws two, seventeen draw none, and
 *    `+[0-9]` does not occur anywhere. `TermList`'s overflow chip has no
 *    drawn counterpart, so the card drops the extras silently the way the
 *    design does.
 *
 * The terms are C-07's `TermTag`, drawn with no type prefix — the design
 * puts the prefix on the recipe hero and the classification trail and never
 * on a card. They are handed to the card as children rather than as C-08's
 * `TermList`, because `F/Recipe card > Tags` IS that row: one 16px
 * `items-center` row, and nesting a second inside it would draw the same
 * geometry twice. The slice happens here rather than through `TermList`'s
 * `limit` for the reason in point 4 — `limit` draws the `+n` chip, and the
 * design draws no overflow mark on a card.
 *
 * A server component. `F/Tag` becomes a client island only where it is given
 * an explanation, which is C-07's own decision and not this file's.
 */

import type { ReactNode } from 'react';

import { revisionOrdinal } from '@/lib/site';
import type { RecipeSummaryView } from '@/lib/queries/read';

import { Empty } from './f/notice';
/* `RecipeCard` is the design's name for both the shape and the data
   component (D-06), so the drawn one is aliased at the one place the two
   meet rather than renamed away from the design. */
import { CardGrid, RecipeCard as Card } from './f/recipe-card';
import { TermTag } from './tags';

/** The design's count. See point 4 in the header. */
const TERMS_ON_A_CARD = 3;

export function RecipeCard({ recipe }: { recipe: RecipeSummaryView }) {
  const terms = (recipe.terms ?? []).slice(0, TERMS_ON_A_CARD);

  return (
    <Card
      kind={recipe.kind}
      code={revisionOrdinal(recipe.revisionNumber)}
      title={recipe.title}
      href={`/recipes/${recipe.slug}`}
      subtitle={recipe.subtitle}
      summary={recipe.summary}
      terms={terms.map((term) => (
        <TermTag key={term.id} term={term} />
      ))}
    />
  );
}

export type RecipeGridProps = {
  recipes: RecipeSummaryView[];
  /**
   * Cells to a row above 1080px. The design draws three on `/` and on a
   * cuisine page and two on `/recipes`, where 130px of the width goes to a
   * right rail that M6 builds. Three is the default because that is what
   * every screen without a rail draws.
   */
  columns?: number;
  /** R-STA-03. One sentence in the design's voice, set in F/Empty. */
  empty?: ReactNode;
};

export function RecipeGrid({
  recipes,
  columns,
  empty = 'Nothing here yet.',
}: RecipeGridProps) {
  if (recipes.length === 0) return <Empty>{empty}</Empty>;

  return (
    <CardGrid columns={columns}>
      {recipes.map((recipe) => (
        <RecipeCard key={recipe.slug} recipe={recipe} />
      ))}
    </CardGrid>
  );
}
