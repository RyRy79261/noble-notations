import type { Metadata } from 'next';
import { listRecipes } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { RecipeGrid } from '@/components/recipe-card';
import { DatabaseNotice } from '@/components/database-notice';
import { KIND_LABELS } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Recipes',
  description:
    'Every recipe, preparation, process and research note in the repository.',
  alternates: { canonical: '/recipes' },
};

export default async function RecipesPage() {
  const { data, configured, failed } = await safeRead(
    () => listRecipes({ limit: 500 }),
    [],
  );

  if (!configured || failed) {
    return (
      <div className="page">
        <h1>Recipes</h1>
        <DatabaseNotice failed={failed} />
      </div>
    );
  }

  const byKind = new Map<string, typeof data>();
  for (const recipe of data) {
    const list = byKind.get(recipe.kind) ?? [];
    list.push(recipe);
    byKind.set(recipe.kind, list);
  }

  const order = ['recipe', 'preparation', 'process', 'research'];
  const groups = order
    .filter((kind) => byKind.has(kind))
    .map((kind) => [kind, byKind.get(kind)!] as const);

  return (
    <div className="page">
      <header className="hero">
        <h1>Recipes</h1>
        <p>
          {data.length} entries. Preparations are components other recipes pull
          in; processes are techniques with no fixed yield; research is
          long-form background with no steps of its own.
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="empty">Nothing here yet.</p>
      ) : (
        groups.map(([kind, recipes]) => (
          <section className="section" key={kind}>
            <div className="section-head">
              <h2>{KIND_LABELS[kind] ?? kind}</h2>
              <span className="faint">{recipes.length}</span>
            </div>
            <RecipeGrid recipes={recipes} />
          </section>
        ))
      )}
    </div>
  );
}
