import type { Metadata } from 'next';
import Link from 'next/link';
import { listCategories, searchRecipes } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { RecipeGrid } from '@/components/recipe-card';
import { DatabaseNotice } from '@/components/database-notice';
import { CATEGORY_TYPE_LABELS } from '@/lib/site';
import { RECIPE_KINDS } from '@/lib/domain/schemas';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Search',
  description:
    'Search the repository by text, cuisine, technique and ingredient — including ingredients to exclude.',
  alternates: { canonical: '/search' },
  robots: { index: true, follow: true },
};

type SearchParams = Promise<{
  q?: string;
  cuisine?: string;
  technique?: string;
  ingredient?: string;
  exclude?: string;
  kind?: string;
}>;

/** Comma-separated filter values, trimmed and emptied of blanks. */
function list(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? '';
  const cuisine = list(params.cuisine);
  const technique = list(params.technique);
  const ingredient = list(params.ingredient);
  const exclude = list(params.exclude);
  const kind = RECIPE_KINDS.includes(params.kind as 'recipe')
    ? (params.kind as 'recipe')
    : undefined;

  const hasFilters =
    Boolean(query) ||
    cuisine.length > 0 ||
    technique.length > 0 ||
    ingredient.length > 0 ||
    exclude.length > 0 ||
    Boolean(kind);

  const [results, categories] = await Promise.all([
    hasFilters
      ? safeRead(
          () =>
            searchRecipes({
              query: query || undefined,
              categories: {
                ...(cuisine.length ? { cuisine } : {}),
                ...(technique.length ? { technique } : {}),
              },
              ingredients: ingredient,
              excludeIngredients: exclude,
              kind,
              limit: 60,
              offset: 0,
            }),
          { results: [], total: 0 },
        )
      : Promise.resolve({
          data: { results: [], total: 0 },
          configured: true,
          failed: false,
        }),
    safeRead(() => listCategories(), []),
  ]);

  const cuisines = categories.data.filter((t) => t.categoryType === 'cuisine');
  const techniques = categories.data.filter(
    (t) => t.categoryType === 'technique',
  );

  return (
    <div className="page">
      <header className="hero">
        <h1>Search</h1>
        <p>
          Filters combine with AND. &ldquo;Dan dan noodles, tofu, no sesame
          paste&rdquo; is <code>q=dan dan</code> plus{' '}
          <code>ingredient=tofu</code> plus <code>exclude=sesame paste</code>.
        </p>
      </header>

      {/* A plain GET form: shareable URLs, works without JavaScript, and the
          query string is the whole state. */}
      <form method="GET" className="panel" style={{ marginBottom: '2rem' }}>
        <div className="search-bar">
          <label className="field">
            <span>Text</span>
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="dan dan noodles, biltong, demi-glace…"
            />
          </label>
          <label className="field">
            <span>Must include (comma separated)</span>
            <input
              type="text"
              name="ingredient"
              defaultValue={ingredient.join(', ')}
              placeholder="tofu, sichuan pepper"
            />
          </label>
          <label className="field">
            <span>Must exclude</span>
            <input
              type="text"
              name="exclude"
              defaultValue={exclude.join(', ')}
              placeholder="sesame paste"
            />
          </label>
        </div>

        <div className="search-bar" style={{ marginTop: '0.75rem' }}>
          <label className="field">
            <span>Cuisine</span>
            <select name="cuisine" defaultValue={cuisine[0] ?? ''}>
              <option value="">Any</option>
              {cuisines.map((term) => (
                <option key={term.id} value={term.slug}>
                  {term.label} ({term.recipeCount})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Technique</span>
            <select name="technique" defaultValue={technique[0] ?? ''}>
              <option value="">Any</option>
              {techniques.map((term) => (
                <option key={term.id} value={term.slug}>
                  {term.label} ({term.recipeCount})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Kind</span>
            <select name="kind" defaultValue={kind ?? ''}>
              <option value="">Any</option>
              {RECIPE_KINDS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="button-primary">
            Search
          </button>
        </div>
      </form>

      {!results.configured || results.failed ? (
        <DatabaseNotice failed={results.failed} />
      ) : !hasFilters ? (
        <p className="empty">
          Enter something above, or{' '}
          <Link href="/recipes">browse everything</Link>.
        </p>
      ) : results.data.results.length === 0 ? (
        <p className="empty">
          Nothing matched. Try dropping a filter — they are combined with AND.
        </p>
      ) : (
        <>
          <div className="section-head">
            <h2>
              {results.data.total} result
              {results.data.total === 1 ? '' : 's'}
            </h2>
            <span className="faint">
              {[
                query && `“${query}”`,
                cuisine.length &&
                  `${CATEGORY_TYPE_LABELS.cuisine}: ${cuisine.join(', ')}`,
                technique.length &&
                  `${CATEGORY_TYPE_LABELS.technique}: ${technique.join(', ')}`,
                ingredient.length && `with ${ingredient.join(', ')}`,
                exclude.length && `without ${exclude.join(', ')}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          <RecipeGrid recipes={results.data.results} />
        </>
      )}
    </div>
  );
}
