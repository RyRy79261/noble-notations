import type { Metadata } from 'next';
import { listIngredients } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { DatabaseNotice } from '@/components/database-notice';
import { FilterableGroups } from '@/components/filterable-groups';
import type { FilterableGroup } from '@/components/filterable-groups';
import { Breadcrumb } from '@/components/f/breadcrumb';
import { Mark, MarkQuiet } from '@/components/f/mark';
import { Empty } from '@/components/f/notice';
import { PageHead, PageHero } from '@/components/f/page-head';
import { SectionHead } from '@/components/f/section-label';
import { Stat } from '@/components/f/stat';
import { TableGroup, TableHead, TableRow } from '@/components/f/table-row';
import {
  CATEGORY_LABELS,
  cardinal,
  categoryRank,
  roman,
  shopOrder,
} from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ingredients',
  description:
    'The canonical ingredient list — every ingredient the repository knows about, with the recipes that use it.',
  alternates: { canonical: '/ingredients' },
};

/**
 * `/ingredients` — PATTERN B, the ruled table.
 *
 * One row is one record with the same four fields every time and the reader
 * scans a column, so this screen is a table and not a card grid and not a
 * spine. `ingredients-1280.html:315` onwards: a filter bar, ONE column head
 * for the whole index, then an aisle group per category — F/Section label,
 * then rows at `gap-0` separated by their own hairline.
 *
 * THE ROWS ARE `F/Table row`, NOT A `<table>`. The design's row is a flex
 * layout at 1280 and a two-line block at 360, and `display: flex` on a `<tr>`
 * is the change that strips a real table of its semantics. `f/table-row.tsx`
 * carries the whole fold and the ARIA roles; `FilterableGroups` grew a
 * `rows` layout and a `tableLabel` so the roles have the `role="table"` they
 * are only legal under. See the note in that file.
 *
 * R-SCR-22 — THE FILTER MATCHES AN ALIAS. Each item's `text` carries the
 * name, every alias and the aisle label, so "cilantro" finds coriander even
 * though the row shows the alias in a quieter register (R-SCR-23) and the
 * placeholder never mentions them.
 *
 * R-STA-08 AND R-STA-09. Nothing here scrolls sideways at any width: the row
 * folds rather than overflowing, so there is no scroller to trap and no
 * chance of the page moving with it.
 *
 * THE NUMBERS ARE THE DOCUMENT'S, NOT THE AISLE'S. `01` to `30` run straight
 * down the page across every aisle, and `/ingredients/[slug]` prints the
 * same figure as `INGREDIENT 16`. `shopOrder` in `src/lib/site.ts` is that
 * one ordering, so the two screens cannot drift.
 */
export default async function IngredientsPage() {
  const { data, configured, failed } = await safeRead(listIngredients, []);

  const ordered = shopOrder(data);
  /* The catalogue number is a position in this list, so it is assigned once
     here and read from the map. It is 1-based and zero-padded to two, which
     is what the design draws in the 34px `Ref` column. */
  const numbers = new Map(
    ordered.map((ingredient, index) => [ingredient.slug, index + 1]),
  );

  const byCategory = new Map<string, typeof ordered>();
  for (const ingredient of ordered) {
    const list = byCategory.get(ingredient.category) ?? [];
    list.push(ingredient);
    byCategory.set(ingredient.category, list);
  }
  // Shop order rather than A–Z, matching the shopping list.
  const aisles = [...byCategory.entries()].sort(
    ([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b),
  );

  const groups: FilterableGroup[] = aisles.map(([category, list], index) => {
    const label = CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');

    return {
      key: category,
      heading: (
        <SectionHead
          ordinal={roman(index + 1)}
          title={label}
          meta={`${cardinal(list.length)} ingredient${list.length === 1 ? '' : 's'}`}
        />
      ),
      items: list.map((ingredient) => ({
        key: ingredient.slug,
        // R-SCR-22. Aliases are searchable even though the filter box does
        // not mention them — typing "cilantro" should find coriander.
        text: [ingredient.name, ...ingredient.aliases, label].join(' '),
        node: (
          <TableRow
            key={ingredient.slug}
            reference={String(numbers.get(ingredient.slug) ?? '').padStart(
              2,
              '0',
            )}
            name={ingredient.name}
            href={`/ingredients/${ingredient.slug}`}
            /* The design joins them with a middle dot rather than a comma —
               `knoflook · ail`, `piri-piri · peri-peri`. F/Table row draws an
               em dash for an empty cell (R-STA-05), so nothing is passed
               when there are none. */
            alias={
              ingredient.aliases.length > 0
                ? ingredient.aliases.join(' · ')
                : undefined
            }
            count={ingredient.recipeCount}
          />
        ),
      })),
      layout: 'rows',
    };
  });

  /*
   * TWO WORDINGS. The design's own 360 kicker is `THIRTY INGREDIENTS · SIX
   * AISLES` (`m360-classes-ingredients.html:3332`) and both slots fit
   * because both counts are short words. This repository holds forty-two in
   * thirteen aisles, and `FORTY-TWO INGREDIENTS · THIRTEEN AISLES` is a
   * 258px `shrink-0` slot in a 328px row — it clipped the left slot to
   * `NN · INGR…` and took the screen's own name off it. The aisle count is
   * the half that goes at 360; it is drawn again in the ledger below.
   */
  const kickerRightNarrow = `${cardinal(ordered.length)} ingredient${
    ordered.length === 1 ? '' : 's'
  }`;
  const kickerRight = `${kickerRightNarrow} · ${cardinal(aisles.length)} aisle${
    aisles.length === 1 ? '' : 's'
  }`;

  /* The design's third statistic. `listIngredients` orders by how many
     recipes call for a thing, so the head of the list is the answer, and
     R-STA-05 drops the slot rather than drawing an empty one. */
  const mostUsed = ordered.length > 0 ? data[0] : undefined;

  return (
    <>
      <PageHead
        left="NN · Ingredients"
        right={configured && !failed ? kickerRight : 'Unavailable'}
        rightNarrow={configured && !failed ? kickerRightNarrow : 'Unavailable'}
      />

      <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:gap-11 shell:px-15 shell:pt-8.5 shell:pb-18">
        {/* §1.3. At 1280 the eyebrow is a trail; at 360 the design deletes
            the trail and draws two chips instead
            (`m360-classes-ingredients.html:580`). Two elements, because they
            are two different drawings and not one at two sizes — the trail
            is a `<nav>` landmark and the chips are not. */}
        <div className="flex flex-row items-center gap-2 shell:hidden">
          <Mark>Ingredients</Mark>
          <MarkQuiet>Index</MarkQuiet>
        </div>
        <Breadcrumb
          className="hidden shell:block"
          items={[{ label: 'Catalogue' }, { label: 'Ingredients' }]}
        />

        {/* The hero row: the hero grows, a 220px column of counts sits
            beside it, and at 360 the counts become a full-width row of
            statistics one notch smaller. */}
        <div className="flex w-full flex-col items-start gap-6 shell:flex-row shell:gap-15">
          <div className="w-full shell:min-w-0 shell:flex-1 shell:basis-0">
            <PageHero
              kicker="Ingredients · Index"
              title="Ingredients"
              ledeClassName="shell:max-w-160"
              lede="Every ingredient the catalogue has ever called for, listed once and numbered. They are grouped the way a supermarket is laid out."
            />
          </div>

          {configured && !failed && ordered.length > 0 ? (
            <div className="flex w-full flex-row flex-wrap items-start gap-5 shell:w-55 shell:shrink-0 shell:flex-col shell:gap-6 shell:pt-2">
              {/* `min-w-25` is what makes the row WRAP at 360, where the
                  design draws INGREDIENTS and AISLES on one line and MOST
                  USED beneath them (`m360-classes-ingredients.html`). Three
                  `[flex:1 1 0]` statistics with no minimum share one line at
                  any width and would squeeze a name into a column. */}
              <Stat
                grow
                size="lg"
                sizeNarrow="sm"
                className="min-w-25 shell:min-w-0"
                label="Ingredients"
                value={ordered.length}
              />
              <Stat
                grow
                size="lg"
                sizeNarrow="sm"
                className="min-w-25 shell:min-w-0"
                label="Aisles"
                value={aisles.length}
              />
              {mostUsed ? (
                <Stat
                  grow
                  size="lg"
                  sizeNarrow="sm"
                  className="min-w-25 shell:min-w-0"
                  label="Most used"
                  value={mostUsed.name}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        {!configured || failed ? (
          <DatabaseNotice failed={failed} />
        ) : ordered.length === 0 ? (
          <Empty>No ingredients recorded yet.</Empty>
        ) : (
          <FilterableGroups
            groups={groups}
            label="Filter ingredients"
            /* The placeholder is drawn in capitals and CANNOT get them from
               CSS: `text-transform` on an `<input>` transforms the value the
               reader types as well as the placeholder. So the capitals are
               in the string, and the accessible name is the sentence beside
               it — `Filter` gives `aria-label` precedence over the
               placeholder, so nothing is read out letter by letter. */
            placeholder="FILTER INGREDIENTS"
            countNoun="ingredient"
            tableLabel="Ingredient index"
            head={
              <TableGroup>
                <TableHead />
              </TableGroup>
            }
          />
        )}
      </div>
    </>
  );
}
