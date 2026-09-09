import type { Metadata } from 'next';

import { Breadcrumb } from '@/components/f/breadcrumb';
import { Mark, MarkQuiet } from '@/components/f/mark';
import { Empty } from '@/components/f/notice';
import { PageHead, PageHero } from '@/components/f/page-head';
import { IndexCard } from '@/components/f/recipe-card';
import { SectionHead } from '@/components/f/section-label';
import { Stat } from '@/components/f/stat';
import { DatabaseNotice } from '@/components/database-notice';
import { FilterableGroups } from '@/components/filterable-groups';
import { listCategories } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { cardinal, roman } from '@/lib/site';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cuisines',
  description:
    'Every cuisine represented in the repository, with the number of recipes filed under each.',
  alternates: { canonical: '/cuisines' },
};

/*
 * ─── WHAT THE DESIGN DRAWS ───────────────────────────────────────────────
 *
 * `design/exports/png/uZNHc.png` and `classes-cuisines-1280.html:2951`.
 *
 *   Page head    NN · CUISINES        SIX CUISINES · TWENTY-TWO RECIPES
 *   Breadcrumb   CATALOGUE · CUISINES
 *   Hero row     the 48px title beside a 200px column of three statistics
 *   Filter       one `f-desk` bar, `FILTER CUISINES` and a bare count
 *   Section      I  All cuisines  ·  SIX · ALPHABETICAL BY REGION
 *   Cuisine grid three F/Index cards to a row, each in a ruled cell
 *
 * A CELL, NOT A CARD, CARRIES THE RULE. `:3282` draws the cell as
 * `[ flex:1_1_0 ] p-[ 18px_0_0_0 ]` on a 1px `f-hair` TOP rule, and the card
 * inside it has no ground, no border, no radius and no padding at all —
 * `gap-[ 8px ]`, an accent kicker, a 24/28 title, a 14/24 description and a
 * 9px mono count. That is `F/Index card` and `CardGrid ruled` exactly, and
 * `f/recipe-card.tsx` already says so in its own header.
 *
 * At 360 (`m360-classes-ingredients.html:262`, `png/bOhtT.png`) the cells
 * stack one to a row 16px apart, and the rule moves to the BOTTOM and
 * quietens to `f-hair-2` — the same inversion `/classes` makes.
 *
 * ─── WHY THIS IS NOT `CardGrid` ──────────────────────────────────────────
 *
 * The design draws a filter on this screen and C-17 is the only component
 * that may hold a query (R-CON-01 fixes the client components at eight, and
 * §9.3 names them). C-17 renders the bar and the surviving items together
 * and gives the page no way to style either wrapper, so `CardGrid` cannot be
 * the body: `listClassName` is the one hook, and it carries the grid.
 *
 * ─── AND WHY IT IS A GRID AND NOT A WRAPPING ROW ─────────────────────────
 *
 * It was `flex-wrap` with `grow basis-[30%]` on the cell, on the argument
 * that a lone cell on the last line should grow to the width of the line.
 * The picture says otherwise. `png/uZNHc.png` draws six cells in two rows
 * of three, every cell 360px, and every hairline starting and ending on the
 * same two column edges down the whole page — the rule ABOVE a cell is the
 * cell's own top border, so a cell that grows takes its rule with it. With
 * eight cuisines seeded the last row held two, they grew to 560px each, and
 * the rule over `South African` ran 60→620 where the rule over `German` ran
 * 60→419. Three fixed tracks keep every rule on the design's two edges
 * whatever the count is, which is what the drawing shows; `gap-x-10` makes
 * each track exactly the drawn 360px in a 1160px column.
 *
 * The `shell:` prefix is what keeps the 360 drawing: below it the list is
 * the base `flex-col` and each cell is `w-full`, one to a row 16px apart.
 *
 * ─── THE KICKER THE DATA CANNOT FILL ─────────────────────────────────────
 *
 * The design draws a region above each title — `SOUTHERN AFRICA`,
 * `GULF COAST`, `MESOAMERICA`. Nothing in the schema holds a region, and
 * `listCategories` returns no parent term either. D-12 ruled on exactly this
 * shape: a slot the design draws and the data cannot fill is left out rather
 * than invented. R-STA-05 says the same. The card is a three-part column
 * here and a four-part one in the drawing.
 */

/** `ONE RECIPE`, `SIX RECIPES`, `NO RECIPES`. The count is a word. */
function recipeCount(count: number): string {
  if (count === 0) return 'no recipes';
  return `${cardinal(count)} ${count === 1 ? 'recipe' : 'recipes'}`;
}

/** The design's `Cuisine grid > Row > South African`: the ruled cell. */
const CELL = cn(
  'flex w-full min-w-0 flex-col items-start pb-5',
  '[border-style:solid] [border-width:0px_0px_1px_0px] border-b-hair-2',
  'shell:w-auto shell:pt-4.5 shell:pb-0',
  'shell:[border-width:1px_0px_0px_0px] shell:border-t-hair',
);

export default async function CuisinesPage() {
  const { data, configured, failed } = await safeRead(
    () => listCategories('cuisine'),
    [],
  );

  const unavailable = !configured || failed;

  /* `listCategories` orders by recipe count and then by label, so the first
     row is the largest. The design's meta says ALPHABETICAL BY REGION; the
     meta below states the order this screen is actually in, because a meta
     that names the wrong order is worse than one that names none. */
  const recipes = data.reduce((sum, term) => sum + term.recipeCount, 0);
  const largest = data[0];

  const kicker = `${cardinal(data.length)} ${
    data.length === 1 ? 'cuisine' : 'cuisines'
  } · ${recipeCount(recipes)}`;

  const groups = [
    {
      key: 'all',
      heading: (
        <SectionHead
          ordinal={roman(1)}
          title="All cuisines"
          meta={`${cardinal(data.length)} · most recipes first`}
          /* C-17 puts 16px between a heading and its body; the design puts
             44px between the section head and the grid, because there they
             are siblings of `Main`. 16 + 28 is the difference. At 360 the
             drawn gap is F/Section 360's own 14px, so nothing is added. */
          className="shell:mb-7"
        />
      ),
      items: data.map((term) => ({
        key: term.id,
        text: [term.label, term.description ?? ''].join(' '),
        node: (
          <li key={term.id} className={CELL}>
            <IndexCard
              title={term.label}
              href={`/cuisines/${term.slug}`}
              description={term.description}
              meta={recipeCount(term.recipeCount)}
            />
          </li>
        ),
      })),
      layout: 'list' as const,
      listClassName:
        'gap-y-4 shell:grid shell:grid-cols-3 shell:gap-x-10 shell:gap-y-8',
    },
  ];

  return (
    <>
      <PageHead
        left="NN · Cuisines"
        right={unavailable ? 'Unavailable' : kicker}
      />

      <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:gap-11 shell:px-15 shell:pt-8.5 shell:pb-18">
        <Breadcrumb
          className="hidden shell:block"
          items={[{ label: 'Catalogue', href: '/' }, { label: 'Cuisines' }]}
        />

        <div className="flex w-full shrink-0 flex-col items-start gap-6 shell:flex-row shell:items-start shell:gap-15">
          <div className="w-full min-w-0 shell:flex-1">
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
              title="Cuisines"
              lede="Where a dish comes from. Every recipe carries exactly one cuisine, and it keeps that cuisine through every revision it passes into — the name and the origin outlive any single revision."
              ledeClassName="shell:max-w-160"
            />
          </div>

          {unavailable ? null : (
            <div className="flex w-full shrink-0 flex-row gap-5 shell:w-50 shell:flex-col shell:gap-6 shell:pt-2">
              <Stat grow label="Cuisines" value={data.length} sizeNarrow="sm" />
              <Stat grow label="Recipes" value={recipes} sizeNarrow="sm" />
              {largest ? (
                <Stat
                  grow
                  label="Largest"
                  value={largest.label}
                  sizeNarrow="sm"
                />
              ) : null}
            </div>
          )}
        </div>

        {unavailable ? (
          <DatabaseNotice failed={failed} />
        ) : data.length === 0 ? (
          <Empty>No cuisines recorded yet.</Empty>
        ) : (
          <FilterableGroups
            groups={groups}
            label="Filter the cuisines"
            /* The design's own string, in its own case: F/Filter draws the
               placeholder in capitals and does not set `uppercase`
               (`classes-cuisines-1280.html:3241`). The accessible name is
               `label` above, in sentence case. */
            placeholder="FILTER CUISINES"
            countNoun="cuisine"
          />
        )}
      </div>
    </>
  );
}
