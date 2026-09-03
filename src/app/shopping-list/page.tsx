import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { buildShoppingList, listRecipes } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { DatabaseNotice } from '@/components/database-notice';
import { FilterableGroups } from '@/components/filterable-groups';
import { RecipePicker } from './recipe-picker';
import { CATEGORY_LABELS } from '@/lib/site';

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

  const groups = (list?.groups ?? []).map((group) => ({
    key: group.category,
    heading: (
      <div className="section-head">
        <h2>{CATEGORY_LABELS[group.category] ?? group.category}</h2>
        <span className="faint">{group.entries.length}</span>
      </div>
    ),
    items: group.entries.map((entry) => ({
      key: entry.slug ?? entry.name,
      // Everything worth searching, including the recipes that put it here
      // and its category — those are not all visible on the row itself.
      text: [
        entry.name,
        entry.category,
        CATEGORY_LABELS[entry.category] ?? '',
        ...entry.from.map((from) => from.title),
      ].join(' '),
      node: (
        <li key={entry.slug ?? entry.name} className="shopping-item">
          <div className="shopping-amount">
            {entry.amounts.length > 0 ? entry.amounts.join(' + ') : null}
            {entry.unquantified ? (
              <span className="faint">
                {entry.amounts.length > 0 ? ' + some' : 'some'}
              </span>
            ) : null}
          </div>
          <div className="shopping-what">
            {entry.slug ? (
              <Link href={`/ingredients/${entry.slug}`}>{entry.name}</Link>
            ) : (
              <span>{entry.name}</span>
            )}
            {entry.optional ? <span className="badge">optional</span> : null}
            <div className="faint shopping-from">
              {entry.from.map((from, index) => (
                <span key={`${from.slug}-${index}`}>
                  {index > 0 ? ' · ' : ''}
                  <Link href={`/recipes/${from.slug}`}>{from.title}</Link>{' '}
                  <span title={from.text}>({from.text})</span>
                </span>
              ))}
            </div>
          </div>
        </li>
      ),
    })),
    layout: 'list' as const,
    listClassName: 'shopping-list',
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
          <FilterableGroups
            groups={groups}
            label="Filter the shopping list"
            placeholder="Filter by ingredient, shop area or recipe…"
            countNoun="ingredient"
          />
        </>
      )}
    </div>
  );
}
