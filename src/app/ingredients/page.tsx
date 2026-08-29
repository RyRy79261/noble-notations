import type { Metadata } from 'next';
import Link from 'next/link';
import { listIngredients } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { DatabaseNotice } from '@/components/database-notice';

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
  const categories = [...byCategory.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="page">
      <header className="hero">
        <h1>Ingredients</h1>
        <p>
          Ingredients are canonical rows, not free text on a recipe page. That
          is what makes &ldquo;everything I have made with gochujang&rdquo; a
          query rather than a memory exercise.
        </p>
      </header>

      {!configured || failed ? (
        <DatabaseNotice failed={failed} />
      ) : data.length === 0 ? (
        <p className="empty">No ingredients recorded yet.</p>
      ) : (
        categories.map(([category, list]) => (
          <section className="section" key={category}>
            <div className="section-head">
              <h2 style={{ textTransform: 'capitalize' }}>
                {category.replace(/_/g, ' ')}
              </h2>
              <span className="faint">{list.length}</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th>Also known as</th>
                    <th className="numeric">Recipes</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((ingredient) => (
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
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
