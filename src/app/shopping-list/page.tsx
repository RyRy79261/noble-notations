import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildShoppingList, listRecipes } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { DatabaseNotice } from '@/components/database-notice';
import { ShoppingChecklist } from '@/components/shopping-checklist';
import { RecipePicker } from './recipe-picker';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Shopping list',
  description:
    'Combine the ingredients of several recipes into one list, grouped by where they sit in a shop.',
  alternates: { canonical: '/shopping-list' },
};

function asArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export default async function ShoppingListPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string | string[] }>;
}) {
  const params = await searchParams;
  const selected = asArray(params.r);

  const [recipesResult, listResult] = await Promise.all([
    safeRead(() => listRecipes(), []),
    safeRead(() => buildShoppingList(selected), null),
  ]);

  if (!recipesResult.configured || recipesResult.failed) {
    return (
      <div className="page">
        <h1>Shopping list</h1>
        <DatabaseNotice failed={recipesResult.failed} />
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

  return (
    <div className="page">
      <header className="hero">
        <h1>Shopping list</h1>
        <p>
          Select the recipes that you will cook. This page joins their
          ingredients into one list. The list follows the order of a shop. It is
          not in alphabetical order.
        </p>
        <p>
          The page adds two amounts only if their units agree. 800&nbsp;g and
          1&nbsp;kg become 1.8&nbsp;kg. But three cloves and two heads stay on
          two lines. A wrong total is worse than two correct lines.
        </p>
      </header>

      <Suspense fallback={null}>
        <RecipePicker recipes={recipesResult.data} selected={selected} />
      </Suspense>

      {list && list.missing.length > 0 ? (
        <p className="notice">
          No recipe found for: {list.missing.join(', ')}.
        </p>
      ) : null}

      {selected.length === 0 ? (
        <p className="empty">
          Select one or more recipes above to make a list.
        </p>
      ) : groups.length === 0 ? (
        <p className="empty">These recipes have no ingredients yet.</p>
      ) : (
        <>
          <p className="faint">
            {list!.totalEntries} thing
            {list!.totalEntries === 1 ? '' : 's'} to buy across{' '}
            {list!.recipes.length} recipe
            {list!.recipes.length === 1 ? '' : 's'}.
          </p>
          <ShoppingChecklist groups={groups} selection={selected} />
        </>
      )}
    </div>
  );
}
