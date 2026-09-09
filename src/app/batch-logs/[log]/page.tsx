import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getExperiment } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { DatabaseNotice } from '@/components/database-notice';
import { BatchLogDetail } from '../batch-log-detail';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ log: string }> };

/**
 * The one live address of a run.
 *
 * A run that names a recipe belongs under that recipe; that is the address
 * the design draws. A run that names none has no recipe slug to put in
 * that shape, so it stays at the top level. This route answers for both,
 * because only a database read can tell them apart and a redirect in
 * `next.config.ts` cannot read the database. See D-01.
 */
function batchLogPath(log: string, recipe: { slug: string } | null): string {
  return recipe
    ? `/recipes/${recipe.slug}/batch-logs/${log}`
    : `/batch-logs/${log}`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { log } = await params;
  const { data } = await safeRead(() => getExperiment(log), null);
  if (!data) return { title: 'Experiment not found' };

  const description =
    data.summary ??
    `A recorded run${data.startedAt ? ` started ${data.startedAt}` : ''} with ${data.observations.length} measurements.`;

  // The canonical address is the one the run actually lives at, which for
  // a run with a recipe is the nested one this page redirects to.
  const canonical = batchLogPath(log, data.recipe);

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

export default async function ExperimentPage({ params }: Params) {
  const { log } = await params;
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

  // Not permanent. This address stays a stable thing to link to — a run is
  // often logged before its recipe exists — and the recipe it points at can
  // change: `logExperiment` re-logs by slug and writes `recipeId` again, so
  // a run can move to another recipe or lose one. A 308 would be cached in
  // the reader's browser and would keep sending them to an address that
  // 404s. The hop is a 307 and the entry address keeps answering.
  if (data.recipe) redirect(batchLogPath(log, data.recipe));

  return (
    <BatchLogDetail
      breadcrumb={
        <>
          <Link href="/batch-logs">Batch logs</Link> / {data.title}
        </>
      }
      log={data}
    />
  );
}
