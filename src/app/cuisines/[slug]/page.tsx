import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { Breadcrumb } from '@/components/f/breadcrumb';
import { citationDate } from '@/components/f/citation';
import { Mark, MarkQuiet } from '@/components/f/mark';
import { Empty, Notice } from '@/components/f/notice';
import { PageHead, PageHero } from '@/components/f/page-head';
import { RecipeCard } from '@/components/f/recipe-card';
import { SectionHead } from '@/components/f/section-label';
import { Stat } from '@/components/f/stat';
import { DatabaseNotice } from '@/components/database-notice';
import { TermHierarchy } from '@/components/term-hierarchy';
import { TermTag } from '@/components/tags';
import { getTerm, type RecipeSummaryView } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import {
  cardSummary,
  cardinal,
  revisionOrdinal,
  roman,
  site,
} from '@/lib/site';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/*
 * ─── WHAT THE DESIGN DRAWS ───────────────────────────────────────────────
 *
 * `design/exports/png/YVDSc.png` and `classes-cuisines-1280.html:2254`.
 * The cuisine page is the one screen in this family with a FULL-WIDTH hero
 * and a full-width statistics strip, rather than a hero beside a 200px
 * column:
 *
 *   Page head    NN · CUISINE · SOUTH AFRICAN   ONE RECIPE · SIXTH REVISION · 08 SEP 2026
 *   Breadcrumb   CATALOGUE · CUISINES · SOUTH AFRICAN
 *   Page hero    the 48px title over a 740px lede, `w-full`
 *   Counts       a `f-desk` strip, `p-[ 22px_26px ]`, equal columns
 *   Rule notice  F/Notice, accent: A CUISINE IS SET ONCE AND NEVER CHANGES
 *   Section I    The recipe  ·  ONE · BAUMY BILTONG
 *   The recipe   F/Recipe card in a growing column, beside a 300px aside
 *
 * At 360 (`m360-classes-ingredients.html:2026`, `png/W5v9j.png`) the strip
 * loses its ground entirely and becomes plain wrapped rows of statistics,
 * and the aside falls under the card.
 *
 * ─── WHAT THE DATA CAN AND CANNOT FILL ───────────────────────────────────
 *
 * D-12's ruling — a slot the design draws and the schema cannot fill is left
 * out, not invented — decides the strip. `getTerm` returns the term, its
 * parent, its children and a `RecipeSummaryView` for each recipe. So:
 *
 *   RECIPES              the count.                              DRAWN
 *   REVISIONS RECORDED   the current revision number of each,
 *                        added up. Every one of them was written. DRAWN
 *   INGREDIENTS          not in a summary, and there is no
 *                        cuisine-wide ingredient read.            LEFT OUT
 *   COOKING BATCH LOGS   same.                                    LEFT OUT
 *   FIRST RECORDED       a summary carries `updatedAt` and not
 *                        `createdAt`, so the earliest date this
 *                        screen can honestly state is the LAST
 *                        one anything here was touched. It is
 *                        drawn under its true name, LAST WORKED.  RENAMED
 *
 * `NN-04-02` in the card's `Code` run is the same missing catalogue number
 * `src/components/recipe-card.tsx` records; the run is the revision and the
 * date, which are both real.
 *
 * ─── WHY THE ASIDE IS A META RUN AND NOT A 300px COLUMN ──────────────────
 *
 * The design draws `ALSO FILED UNDER` as a 300px column of seven
 * label-and-name pairs beside ONE card, because South African has one
 * recipe. French has six. A 300px aside per card is a shape that only works
 * at n = 1, so the terms ride on the card itself, in F/Recipe card's own
 * `Tags` row — which is where every other screen in the system puts them,
 * and which is the row that component already draws.
 */

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await safeRead(() => getTerm('cuisine', slug), null);
  if (!data) return { title: 'Cuisine not found' };

  const description =
    data.term.description ??
    `${data.recipes.length} ${data.term.label} recipes in the ${site.name} repository.`;

  return {
    title: `${data.term.label} recipes`,
    description,
    alternates: { canonical: `/cuisines/${slug}` },
    openGraph: {
      type: 'website',
      title: `${data.term.label} recipes`,
      description,
      url: `/cuisines/${slug}`,
    },
  };
}

/** `ONE RECIPE`, `SIX RECIPES`, `NO RECIPES`. The count is a word. */
function recipeCount(count: number): string {
  if (count === 0) return 'no recipes';
  return `${cardinal(count)} ${count === 1 ? 'recipe' : 'recipes'}`;
}

/** The most recent `updatedAt` in a set, as `08 SEP 2026`. */
function lastWorked(recipes: RecipeSummaryView[]): string | undefined {
  const latest = recipes
    .map((recipe) => recipe.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  return latest ? citationDate(latest) : undefined;
}

/**
 * The statistics strip. A `f-desk` ground with equal columns at 1280 and no
 * ground at all at 360, where it becomes plain wrapped rows.
 */
function Counts({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex h-fit w-full shrink-0 flex-row flex-wrap items-start gap-x-5 gap-y-4',
        'shell:flex-nowrap shell:gap-0 shell:bg-desk shell:px-6.5 shell:py-5.5',
      )}
    >
      {children}
    </div>
  );
}

export default async function CuisinePage({ params }: Params) {
  const { slug } = await params;
  const { data, configured, failed } = await safeRead(
    () => getTerm('cuisine', slug),
    null,
  );

  if (!configured || failed) {
    // R-STA-01 and R-STA-02: the notice arrives on a page, not on a blank.
    return (
      <>
        <PageHead
          left={`NN · Cuisine · ${slug}`}
          leftNarrow={`NN · ${slug}`}
          right="Unavailable"
        />
        <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:gap-11 shell:px-15 shell:pt-8.5 shell:pb-18">
          <PageHero kicker="Classification · Cuisine" title={slug} />
          <DatabaseNotice failed={failed} />
        </div>
      </>
    );
  }
  if (!data) notFound();

  const recipes = data.recipes;
  const revisions = recipes.reduce(
    (sum, recipe) => sum + Math.max(0, recipe.revisionNumber || 0),
    0,
  );
  const worked = lastWorked(recipes);

  /*
   * The design draws TWO wordings of this kicker, not one.
   * `classes-cuisines-1280.html:2424` is `ONE RECIPE · SIXTH REVISION ·
   * 08 SEP 2026`; `m360-classes-ingredients.html:2103` is `ONE RECIPE ·
   * SIXTH REVISION` — the date is deleted at 360. Sending the 1280 string
   * to both widths put a 258px `shrink-0` slot in a 328px row, which
   * truncated the left kicker to `NN · SO…` and reported four major
   * text-overlap faults in `pnpm audit:ui` (R-ACC-11). `rightNarrow` is
   * `PageHead`'s prop for exactly this.
   */
  const kickerParts = [
    recipeCount(recipes.length),
    recipes.length === 1
      ? revisionOrdinal(recipes[0]!.revisionNumber)
      : undefined,
  ].filter(Boolean);
  const kickerNarrow = kickerParts.join(' · ');
  const kicker = [...kickerParts, worked].filter(Boolean).join(' · ');

  const meta =
    recipes.length === 1
      ? `${cardinal(1)} · ${recipes[0]!.title}`
      : cardinal(recipes.length);

  return (
    <>
      <PageHead
        left={`NN · Cuisine · ${data.term.label}`}
        leftNarrow={`NN · ${data.term.label}`}
        right={kicker}
        rightNarrow={kickerNarrow}
      />

      <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:gap-11 shell:px-15 shell:pt-8.5 shell:pb-18">
        {/* The design deletes the trail at 360 and draws two chips in the
            hero instead; the chips are in `PageHero`'s kicker below. */}
        <Breadcrumb
          className="hidden shell:block"
          items={[
            { label: 'Catalogue', href: '/' },
            { label: 'Cuisines', href: '/cuisines' },
            { label: data.term.label },
          ]}
        />

        <PageHero
          kicker={
            <>
              <span className="flex flex-row items-center gap-2 shell:hidden">
                <Mark>Classification</Mark>
                <MarkQuiet>Cuisine</MarkQuiet>
              </span>
              <span className="hidden shell:inline">
                Classification · Cuisine
              </span>
            </>
          }
          title={data.term.label}
          lede={data.term.description ?? undefined}
          ledeClassName="shell:max-w-185"
        />

        {recipes.length > 0 ? (
          <Counts>
            <Stat grow label="Recipes" value={recipes.length} sizeNarrow="sm" />
            <Stat
              grow
              label="Revisions recorded"
              value={revisions}
              sizeNarrow="sm"
            />
            {worked ? (
              /* The design's fifth column is FIRST RECORDED. A summary
                 carries `updatedAt` and not `createdAt`, so this is the last
                 date rather than the first, and it is drawn under the name
                 that is true. See the note in the header. */
              <Stat
                grow
                label="Last worked"
                value={<span className="uppercase">{worked}</span>}
                sizeNarrow="sm"
              />
            ) : null}
          </Counts>
        ) : null}

        <Notice title="A cuisine is set once and never changes">
          A recipe keeps its name and its cuisine for the whole of its life.
          Everything else — the wash, the dredge, the timings — belongs to a
          revision and may be revised. Nothing is edited in place; a new
          revision is written and the old one is kept.
        </Notice>

        {/* C-09 and R-CMP-05: nothing at all when the cuisine is flat.
            Cajun sits under American and has to say so. */}
        <TermHierarchy parent={data.parent} narrower={data.children} />

        <SectionHead
          ordinal={roman(1)}
          title={recipes.length === 1 ? 'The recipe' : 'The recipes'}
          meta={meta}
        />

        {recipes.length === 0 ? (
          <Empty>No recipes are filed under this cuisine yet.</Empty>
        ) : (
          <ul className="m-0 flex w-full list-none flex-col items-start gap-0 p-0">
            {recipes.map((recipe) => (
              <li
                key={recipe.slug}
                className={cn(
                  'flex w-full flex-col items-start pt-4 pb-4.5',
                  /* PATTERN C's rule, the same inversion the rest of this
                     family makes: quiet and beneath at 360, `f-hair` and
                     above at 1280. */
                  '[border-style:solid] [border-width:0px_0px_1px_0px] border-b-hair-2',
                  'shell:pt-4.5 shell:pb-5 shell:[border-width:1px_0px_0px_0px] shell:border-t-hair',
                )}
              >
                <RecipeCard
                  kind={recipe.kind}
                  code={
                    [
                      revisionOrdinal(recipe.revisionNumber),
                      recipe.updatedAt ? citationDate(recipe.updatedAt) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                  title={recipe.title}
                  href={`/recipes/${recipe.slug}`}
                  subtitle={recipe.subtitle}
                  summary={cardSummary(recipe.summary)}
                  terms={recipe.terms.map((term) => (
                    <TermTag key={term.id} term={term} showFacet />
                  ))}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
