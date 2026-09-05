import type { Metadata } from 'next';
import { buildShoppingList } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { DatabaseNotice } from '@/components/database-notice';
import { ShoppingChecklist } from '@/components/shopping-checklist';
import { ListRecipes } from './list-recipes';
import { BasketBridge } from './basket-redirect';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Shopping list',
  description:
    'The ingredients of the recipes you are cooking, in one list, grouped by where they sit in a shop.',
  alternates: { canonical: '/shopping-list' },
};

function asArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
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
 * What is left is the list, and a line naming the recipes it came from so
 * you can drop one without hunting for the recipe again.
 */
export default async function ShoppingListPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string | string[] }>;
}) {
  const params = await searchParams;
  const selected = asArray(params.r);

  const listResult = await safeRead(() => buildShoppingList(selected), null);

  if (!listResult.configured || listResult.failed) {
    return (
      <div className="page">
        <h1>Shopping list</h1>
        <DatabaseNotice failed={listResult.failed} />
      </div>
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
    // The basket is localStorage-only, so the server cannot tell an empty
    // list from a full one reached through the bare nav link. The client
    // decides which of the two this is.
    return (
      <div className="page">
        <header className="hero">
          <h1>Shopping list</h1>
        </header>
        <BasketBridge />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="hero">
        <h1>Shopping list</h1>
        {list ? (
          <p className="faint">
            {list.totalEntries} thing{list.totalEntries === 1 ? '' : 's'} to buy
            across {list.recipes.length} recipe
            {list.recipes.length === 1 ? '' : 's'}. Grouped the way a shop is
            walked. Two amounts are added only when their units agree, so
            800&nbsp;g and 1&nbsp;kg become 1.8&nbsp;kg but three cloves and two
            heads stay on two lines.
          </p>
        ) : null}
      </header>

      {list && list.missing.length > 0 ? (
        <p className="notice">
          No recipe found for: {list.missing.join(', ')}.
        </p>
      ) : null}

      {list ? <ListRecipes recipes={list.recipes} /> : null}

      {groups.length === 0 ? (
        <p className="empty">These recipes have no ingredients yet.</p>
      ) : (
        <ShoppingChecklist groups={groups} selection={selected} />
      )}
    </div>
  );
}
