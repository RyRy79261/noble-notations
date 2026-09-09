import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getExperiment } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { DatabaseNotice } from '@/components/database-notice';
import { BatchLogDetail } from '@/app/batch-logs/batch-log-detail';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string; log: string }> };

/**
 * One run of one recipe. This is the address the design draws.
 *
 * The body is `BatchLogDetail`, shared with `/batch-logs/[log]`. Only the
 * trail differs.
 *
 * A run answers here only when it names this recipe. A run that names
 * another one, or none at all, is not at this address and must not answer
 * from it: two addresses for one run would split the readers of a batch and
 * the search engines that index it. Each of those gets a 404, and the run's
 * own address still serves it. See D-01.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, log } = await params;
  const { data } = await safeRead(() => getExperiment(log), null);
  const recipe = data?.recipe;
  if (!data || !recipe || recipe.slug !== slug) {
    return { title: 'Batch log not found' };
  }

  const description =
    data.summary ??
    `A recorded run of ${recipe.title}${data.startedAt ? ` started ${data.startedAt}` : ''} with ${data.observations.length} measurements.`;

  const canonical = `/recipes/${slug}/batch-logs/${log}`;

  return {
    title: data.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      title: data.title,
      description,
      url: canonical,
    },
  };
}

export default async function RecipeBatchLogPage({ params }: Params) {
  const { slug, log } = await params;
  const { data, configured, failed } = await safeRead(
    () => getExperiment(log),
    null,
  );

  if (!configured || failed) {
    return (
      <div className="page">
        <h1>{log}</h1>
        <DatabaseNotice failed={failed} />
      </div>
    );
  }
  if (!data) notFound();

  const recipe = data.recipe;
  if (!recipe || recipe.slug !== slug) notFound();

  return (
    <BatchLogDetail
      breadcrumb={
        <>
          <Link href="/recipes">Recipes</Link> /{' '}
          <Link href={`/recipes/${slug}`}>{recipe.title}</Link> /{' '}
          <Link href={`/recipes/${slug}/batch-logs`}>Batch logs</Link> /{' '}
          {data.title}
        </>
      }
      log={data}
    />
  );
}
