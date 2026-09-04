import type { Metadata } from 'next';
import Link from 'next/link';
import { listIngredients } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { DatabaseNotice } from '@/components/database-notice';
import { FilterableGroups } from '@/components/filterable-groups';
import { CATEGORY_LABELS, categoryRank } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ingredients',
  description:
    'The canonical ingredient list — every ingredient the repository knows about, with the recipes that use it.',
  alternates: { canonical: '/ingredients' },
};

export default async function IngredientsPage() {
  const { data, configured, failed } = await safeRead(listIngredients, []);

  const byCategory = new Map<string, typeof data>();
  for (const ingredient of data) {
    const list = byCategory.get(ingredient.category) ?? [];
    list.push(ingredient);
    byCategory.set(ingredient.category, list);
  }
  // Shop order rather than A–Z, matching the shopping list.
  const categories = [...byCategory.entries()].sort(
    ([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b),
  );

  const groups = categories.map(([category, list]) => ({
    key: category,
    heading: (
      <div className="section-head">
        <h2>{CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ')}</h2>
        <span className="faint">{list.length}</span>
      </div>
    ),
    items: list.map((ingredient) => ({
      key: ingredient.slug,
      // Aliases are searchable even though the filter box does not show
      // them prominently — typing "cilantro" should find coriander.
      text: [ingredient.name, ...ingredient.aliases, category].join(' '),
      node: (
        <tr key={ingredient.slug}>
          <td>
            <Link href={`/ingredients/${ingredient.slug}`}>
              {ingredient.name}
            </Link>
          </td>
          <td className="faint">
            {ingredient.aliases.length > 0
              ? ingredient.aliases.join(', ')
              : '—'}
          </td>
          <td className="numeric">{ingredient.recipeCount}</td>
        </tr>
      ),
    })),
    layout: 'table' as const,
    tableHead: (
      <thead>
        <tr>
          <th>Ingredient</th>
          <th>Also known as</th>
          <th className="numeric">Recipes</th>
        </tr>
      </thead>
    ),
  }));

  return (
    <div className="page">
      <header className="hero">
        <h1>Ingredients</h1>
        <p>
          Each ingredient is one record. It is not free text on a recipe page.
          This lets you ask &ldquo;show all dishes with gochujang&rdquo; and get
          an answer.
        </p>
      </header>

      {!configured || failed ? (
        <DatabaseNotice failed={failed} />
      ) : data.length === 0 ? (
        <p className="empty">No ingredients recorded yet.</p>
      ) : (
        <FilterableGroups
          groups={groups}
          label="Filter ingredients"
          placeholder="Filter by name, alias or category…"
          countNoun="ingredient"
        />
      )}
    </div>
  );
}
