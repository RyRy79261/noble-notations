/**
 * `/recipes` — the list of effective recipes. §10.4, and
 * `design/exports/png/WI55J.png`.
 *
 * A hero with a total, a filter bar, then ONE BAND PER KIND — Recipe,
 * Preparation, Process, Research — each with its rail label on the left, a
 * two-up card grid in the middle and its count on the right. Same spine as
 * `/`; `src/components/f/band.tsx` draws it.
 *
 *   RECIPE       Baumy Biltong · Berlin Boil · Pickled Jalapeños   THREE
 *   PREPARATION  Demi-Glace                                          ONE
 *   PROCESS      "No processes recorded yet."                   NONE YET
 *   RESEARCH     Beef Wellington, then a cross-reference           ONE
 *
 * TWO CELLS TO A ROW, NOT THREE. The 130px right margin takes the third
 * column back, and `CardGrid` draws explicit rows rather than a CSS grid, so
 * the last row's single card spans the whole column — visible on Pickled
 * Jalapeños and on Demi-Glace in the drawing (C-06).
 *
 * ALL FOUR BANDS ARE DRAWN, EMPTY OR NOT. §10.4 asks for one section per
 * kind, and the design draws PROCESS with nothing in it and `NONE YET` in
 * the right margin. A kind that reads NONE YET is telling the reader
 * something; a kind that has silently vanished is not. This is the opposite
 * of R-SCR-01 on `/`, and deliberately: home shows what the repository has,
 * this screen shows what the repository is made of.
 *
 * ─── THE FILTER IS A PLAIN GET FORM ──────────────────────────────────────
 *
 * The design draws the same `F/Filter` bar here that it draws on
 * `/ingredients` and `/cuisines`, count and all. Those two spend
 * `FilterableGroups`, which is C-17 and one of §9.3's client components; it
 * cannot carry this screen, because it renders each group as a COLUMN of
 * heading-then-items and this screen's group is a ROW with a rail and a
 * right margin, and because it drops a group with no matches — which would
 * delete the PROCESS band the design draws.
 *
 * Extending it to do both is a change to a shared client component in the
 * middle of a five-way parallel rebuild, so this screen takes the other
 * house pattern instead: the same plain GET form `/search` runs on, which
 * R-CON-03 already requires there. It works with no JavaScript, adds no
 * tenth client component, and puts the query in the address so a filtered
 * list can be linked. `pnpm audit:ui` and `e2e/filtering.spec.ts` both cover
 * the client filter on the screens that use it; neither touches this one.
 *
 * A server component. Every read goes through `src/lib/queries/`.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { Band, numberWord } from '@/components/f/band';
import { buttonClasses } from '@/components/f/button';
import { Filter } from '@/components/f/field';
import { PageHead, PageHero } from '@/components/f/page-head';
import { DatabaseNotice } from '@/components/database-notice';
import { RecipeGrid } from '@/components/recipe-card';
import type { RecipeSummaryView } from '@/lib/queries/read';
import { listRecipes } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { KIND_LABELS, site } from '@/lib/site';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Recipes',
  description:
    'Every recipe, preparation, process and research note in the repository.',
  alternates: { canonical: '/recipes' },
};

/* The design's `Main`. No breadcrumb on this screen, so 40px of top padding
   rather than the 34 a breadcrumbed index takes. */
const MAIN = cn(
  'flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12',
  'shell:gap-11 shell:px-15 shell:pt-10 shell:pb-18',
);

/** The design's lede measure on this screen, `w-[740px]`. See `PageHero`. */
const LEDE = 'shell:max-w-185';

/**
 * The four kinds, in the design's order, each with the sentence the design
 * writes when it has nothing in it (`home-recipes-1280.html:2364` for
 * PROCESS; the others are this build's, in the same voice, because the
 * design never draws them empty).
 */
const KINDS = [
  { kind: 'recipe', empty: 'No recipes recorded yet.' },
  { kind: 'preparation', empty: 'No preparations recorded yet.' },
  { kind: 'process', empty: 'No processes recorded yet.' },
  { kind: 'research', empty: 'No research recorded yet.' },
] as const;

/** What the filter matches. Everything worth searching, whether the card
 *  draws it or not — the placeholder promises title, summary, tag and
 *  catalogue number, and the catalogue number lives in the revision run. */
function haystack(recipe: RecipeSummaryView): string {
  return [
    recipe.title,
    recipe.subtitle ?? '',
    recipe.summary ?? '',
    recipe.slug,
    KIND_LABELS[recipe.kind] ?? recipe.kind,
    ...recipe.terms.map((term) => term.label),
  ]
    .join(' ')
    .toLowerCase();
}

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
  const needle = query.toLowerCase();

  const { data, configured, failed } = await safeRead(
    () => listRecipes({ limit: 500 }),
    [] as RecipeSummaryView[],
  );

  if (!configured || failed) {
    /* R-STA-01 and R-STA-02. The document kicker and the title still name
       the screen, so the notice arrives on a page and not on a blank. Same
       shape as `src/app/recipes/[slug]/page.tsx:58`. */
    return (
      <>
        <PageHead
          left="NN-00-01 · List of effective recipes"
          leftNarrow="NN-00-01"
          right="Unavailable"
        />
        <div className={MAIN}>
          <PageHero title="Recipes" />
          <DatabaseNotice failed={failed} />
        </div>
      </>
    );
  }

  const matching = needle
    ? data.filter((recipe) => haystack(recipe).includes(needle))
    : data;

  return (
    <>
      <PageHead
        left="NN-00-01 · List of effective recipes"
        leftNarrow="NN-00-01"
        right={site.issue}
      />

      <div className={MAIN}>
        <PageHero
          kicker={`All recipes · ${numberWord(data.length)}`}
          title="Recipes"
          lede="Everything you can cook from, grouped by kind. A preparation is pulled into other recipes; a process is a technique with no dish attached. Research write-ups are kept here too, but the mechanisms drawn out of them live under Science."
          ledeClassName={LEDE}
        />

        {/* One input, no submit control: a form with a single text field
            submits on Enter, which is what the design draws — there is no
            button in the bar. `placeholder:uppercase` sets the case the
            design draws WITHOUT touching what a reader types; `uppercase` on
            the input itself would shout the query back at them. */}
        <form method="get" action="/recipes" className="w-full">
          <Filter
            name="q"
            defaultValue={query}
            placeholder="Filter by title, summary, tag or catalogue number"
            aria-label="Filter recipes by title, summary, tag or catalogue number"
            inputClassName="placeholder:uppercase"
            count={
              <span className="uppercase">
                {matching.length} of {data.length}
              </span>
            }
          />
        </form>

        {KINDS.map(({ kind, empty }) => {
          const recipes = matching.filter((recipe) => recipe.kind === kind);

          return (
            <Band
              key={kind}
              label={KIND_LABELS[kind] ?? kind}
              /* The count of what this band actually holds. `NONE YET` is
                 the design's own wording for the empty one, and it is the
                 one meta in the set that is not a bare number. */
              meta={
                recipes.length === 0 ? 'None yet' : numberWord(recipes.length)
              }
            >
              <RecipeGrid
                recipes={recipes}
                columns={2}
                empty={needle ? <>Nothing matches “{query}”.</> : empty}
              />

              {/* The design closes the RESEARCH band with a sentence and one
                  control, inside the centre column and after the cards
                  (`home-recipes-1280.html:2476`). It is the bridge between
                  this screen and `/science`, so it is drawn only where there
                  is research to bridge from. The drawn sentence counts the
                  mechanisms; this one does not, because a count here would
                  cost the whole science read on a screen that shows no
                  mechanisms. */}
              {kind === 'research' && recipes.length > 0 ? (
                <>
                  <p className="m-0 w-full text-15 leading-170 font-serif tracking-flat text-ink-2">
                    The mechanisms lifted out of this and the other studies are
                    written down once under Science and cited from every method
                    that leans on them.
                  </p>
                  <Link href="/science" className={buttonClasses('primary')}>
                    See all science
                  </Link>
                </>
              ) : null}
            </Band>
          );
        })}
      </div>
    </>
  );
}
