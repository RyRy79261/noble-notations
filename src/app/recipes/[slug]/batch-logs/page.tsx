import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRecipeIdentity, listExperiments } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { DatabaseNotice } from '@/components/database-notice';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/**
 * The runs of one recipe.
 *
 * The same grid as `/batch-logs`, filtered to one recipe by the query's
 * optional `recipeSlug`. The top level index keeps listing every run,
 * including a run that names no recipe, because that run has no address
 * under a recipe at all. See K-01, R-NAV-08 and D-01.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await safeRead(() => getRecipeIdentity(slug), null);
  if (!data) return { title: 'Recipe not found' };

  const title = `${data.title} — batch logs`;
  const description = `Every recorded run of ${data.title}. Each run holds the weights, the times and the costs of one batch.`;

  return {
    title,
    description,
    alternates: { canonical: `/recipes/${slug}/batch-logs` },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `/recipes/${slug}/batch-logs`,
    },
  };
}

export default async function RecipeBatchLogsPage({ params }: Params) {
  const { slug } = await params;

  // Two reads in one `safeRead`, because a recipe with no runs must still
  // tell a 404 from an empty grid, and the filtered list cannot: it gives
  // an empty array for both. `getRecipeIdentity` is the existence check and
  // the title for the trail, and nothing else — this page draws no
  // ingredient, step or note, so it does not read one.
  const { data, configured, failed } = await safeRead(
    async () => {
      const [recipe, logs] = await Promise.all([
        getRecipeIdentity(slug),
        listExperiments({ recipeSlug: slug }),
      ]);
      return { recipe, logs };
    },
    { recipe: null, logs: [] },
  );

  if (!configured || failed) {
    return (
      <div className="page">
        <h1>{slug}</h1>
        <DatabaseNotice failed={failed} />
      </div>
    );
  }

  const recipe = data.recipe;
  if (!recipe) notFound();

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link href="/recipes">Recipes</Link> /{' '}
        <Link href={`/recipes/${slug}`}>{recipe.title}</Link> / Batch logs
      </div>

      <header className="hero">
        <h1>Batch logs</h1>
        <p>
          Every recorded run of{' '}
          <Link href={`/recipes/${slug}`}>{recipe.title}</Link>. The recipe is
          the plan. A run is what came out of the kitchen. It records the weight
          of each piece, the times and the costs.
        </p>
      </header>

      {data.logs.length === 0 ? (
        <p className="empty">
          No runs recorded for this recipe yet. The{' '}
          <Link href="/batch-logs">full list of runs</Link> holds the rest.
        </p>
      ) : (
        <div className="grid">
          {data.logs.map((log) => (
            <Link
              className="card"
              href={`/recipes/${slug}/batch-logs/${log.slug}`}
              key={log.slug}
            >
              <h3>{log.title}</h3>
              {log.summary ? <p>{log.summary}</p> : null}
              <div className="card-meta">
                {log.startedAt ? (
                  <span className="num">{log.startedAt}</span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
