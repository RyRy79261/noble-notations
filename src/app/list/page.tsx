import type { Metadata } from 'next';

import { Breadcrumb } from '@/components/f/breadcrumb';
import { Empty, Notice } from '@/components/f/notice';
import { PageHead, PageHero } from '@/components/f/page-head';
import { Stat } from '@/components/f/stat';
import { DatabaseNotice } from '@/components/database-notice';
import { ShoppingChecklist } from '@/components/shopping-checklist';
import { Cardinal, cardinal } from '@/lib/site';
import { cn } from '@/lib/utils';

import { BasketBridge } from './basket-redirect';
import { ListRecipes } from './list-recipes';
import { readShoppingList, selectionKey } from './shopping-list';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Shopping list',
  description:
    'The ingredients of the recipes you are cooking, in one list, grouped by where they sit in a shop.',
  alternates: { canonical: '/list' },
};

/**
 * `Main` — the page frame of a screen that draws a breadcrumb.
 *
 * `list-search-archive-1280.html:203`: `p-[ 34px_60px_72px_60px ]` with a
 * 40px column gap, and `m360-batch-search-list.html:5387`:
 * `p-[ 22px_16px_48px_16px ]` at 28px. Both are whole multiples of the 4px
 * `--spacing`, so every one of them is a scale utility and not an escape.
 */
const MAIN = cn(
  'flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12',
  'shell:gap-10 shell:px-15 shell:pt-8.5 shell:pb-18',
);

function asArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * `/list` — §10.6, and `design/exports/png/N8MQ9.png`.
 *
 * The shopping list shows what is on the shopping list. Nothing else.
 *
 * This page used to open with a checkbox for every recipe in the
 * repository — a picker, above the list, so you could add recipes from
 * here. That is the wrong place for it twice over. It does not scale: at
 * eight hundred recipes it is eight hundred checkboxes over the thing you
 * came to read. And it is redundant: you decide to cook something while
 * reading it, so the recipe page is where the decision belongs, and its
 * "Add to shopping list" button is where it is made.
 *
 * What the design draws, in order: the document kicker, the breadcrumb
 * `LIST · CONSOLIDATED`, the hero, the `DRAWN FROM` control bar, five
 * statistics, the notice that explains the arithmetic, the tick-all bar and
 * the aisles. There is no rule anywhere above the first aisle head — the
 * bands are separated by 40px of air and a change of type.
 *
 * THE URL HOLDS THE SELECTION, which is what makes a list shareable. With
 * nothing in it the server cannot tell an empty list from someone following
 * the permanent nav link, so `BasketBridge` — a browser component — decides
 * between the two.
 */
export default async function ShoppingListPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string | string[] }>;
}) {
  const params = await searchParams;
  const selected = asArray(params.r);

  const listResult = await readShoppingList(selectionKey(selected));

  if (!listResult.configured || listResult.failed) {
    // R-STA-01 and R-STA-02. The document kicker still names the screen the
    // reader asked for, so the notice arrives on a page and not on a blank.
    return (
      <>
        <PageHead left="NN · Shopping list" right="Unavailable" />
        <div className={MAIN}>
          <Breadcrumb items={[{ label: 'List' }, { label: 'Consolidated' }]} />
          <PageHero kicker="Section VI · List" title="Shopping list" />
          <DatabaseNotice failed={listResult.failed} />
        </div>
      </>
    );
  }

  const list = listResult.data;

  // Plain data, not JSX: the list is ticked client-side, and a server
  // component cannot hand a click handler across the boundary.
  const groups = (list?.groups ?? []).map((group) => ({
    category: group.category,
    entries: group.entries.map((entry) => ({
      key: entry.slug ?? entry.name,
      slug: entry.slug,
      name: entry.name,
      category: entry.category,
      amounts: entry.amounts,
      unquantified: entry.unquantified,
      optional: entry.optional,
      from: entry.from,
    })),
  }));

  if (selected.length === 0) {
    return (
      <>
        <PageHead left="NN · Shopping list" right="Nothing selected" />
        <div className={MAIN}>
          <Breadcrumb items={[{ label: 'List' }, { label: 'Consolidated' }]} />
          <PageHero
            kicker="Section VI · List"
            title="Shopping list"
            lede="The recipes you are cooking, gathered into the order of a supermarket. The address holds the selection, so a list is a link you can keep, send or print."
            ledeClassName="shell:max-w-210"
          />
          <BasketBridge />
        </div>
      </>
    );
  }

  const recipeCount = list?.recipes.length ?? 0;
  const entries = groups.flatMap((group) => group.entries);
  /* The design's own two ledger figures beside the three obvious ones.
     `IN TWO RECIPES` counts the rows two or more recipes both asked for —
     the rows the arithmetic actually had to do something to. `KEPT APART`
     is R-SCR-19's count: a row showing more than one measure because no
     conversion between them exists. */
  const shared = entries.filter((entry) => entry.from.length > 1).length;
  const keptApart = entries.filter(
    (entry) =>
      entry.amounts.length > 1 ||
      (entry.amounts.length > 0 && entry.unquantified),
  ).length;

  const totals = `${list?.totalEntries ?? 0} ingredients · ${groups.length} aisles`;

  return (
    <>
      <PageHead
        left="NN · Shopping list"
        right={`${cardinal(recipeCount)} recipe${
          recipeCount === 1 ? '' : 's'
        } · ${totals}`}
        rightNarrow={totals}
      />

      <div className={MAIN}>
        <Breadcrumb items={[{ label: 'List' }, { label: 'Consolidated' }]} />

        {/* The counts are numerals here and words in the kicker above,
            because §10.6 puts them in the hero and `e2e/list.spec.ts:91`
            reads them there. The design spells both; it is writing one
            fixed sentence about one fixed list, and this one is generated
            from whatever is in the address. */}
        <PageHero
          kicker="Section VI · List"
          title="Shopping list"
          lede={
            <>
              {list?.totalEntries ?? 0} ingredient
              {list?.totalEntries === 1 ? '' : 's'} drawn from {recipeCount}{' '}
              recipe{recipeCount === 1 ? '' : 's'} and gathered into the order
              of a supermarket. Amounts are added together only where the two
              units are the same kind of thing; everything else is kept side by
              side so nothing is quietly rounded away.
            </>
          }
          ledeClassName="shell:max-w-210"
        />

        {list && list.missing.length > 0 ? (
          <Notice tone="warn" title="No recipe at that address">
            Nothing on the list came from {list.missing.join(', ')}. The rest of
            the selection is below.
          </Notice>
        ) : null}

        {list ? <ListRecipes recipes={list.recipes} /> : null}

        <div
          className={cn(
            'flex w-full shrink-0 flex-row flex-wrap items-start gap-x-3 gap-y-4',
            'shell:flex-nowrap shell:gap-15',
          )}
        >
          {/* `min-w-22` is what folds five statistics into the design's
              3 + 2 at 360 without a second breakpoint: three 88px minimums
              and two 12px gaps fit a 328px column and four do not, so the
              row breaks exactly where the drawing breaks it. */}
          <Ledger label="Recipes" value={recipeCount} />
          <Ledger label="Ingredients" value={list?.totalEntries ?? 0} />
          <Ledger label="Aisles" value={groups.length} />
          <Ledger label="In two recipes" value={shared} />
          <Ledger label="Kept apart" value={keptApart} />
        </div>

        {groups.length > 0 ? (
          <Notice title="How two amounts become one">
            Two amounts are added only when one unit converts into the other, so
            800&nbsp;g and 1&nbsp;kg become 1.8&nbsp;kg. Two cloves of garlic
            and ten heads of garlic are not the same measure of anything, so
            they are kept apart on one line rather than guessed at.{' '}
            {keptApart === 0
              ? 'Nothing on this list is held apart that way.'
              : `${Cardinal(keptApart)} ingredient${keptApart === 1 ? ' is' : 's are'} held apart this way.`}{' '}
            Where a recipe gives no quantity at all the amount reads
            &ldquo;some&rdquo;, and the original words are printed beside it.
          </Notice>
        ) : null}

        {groups.length === 0 ? (
          <Empty>These recipes have no ingredients yet.</Empty>
        ) : (
          <ShoppingChecklist groups={groups} selection={selected} />
        )}
      </div>
    </>
  );
}

/** One of the five figures in the ledger row. 19px at 1280, 15px at 360. */
function Ledger({ label, value }: { label: string; value: number }) {
  return (
    <Stat
      grow
      size="lg"
      sizeNarrow="sm"
      label={label}
      value={value}
      className="min-w-22 shell:w-fit shell:min-w-0 shell:flex-none shell:shrink-0"
    />
  );
}
