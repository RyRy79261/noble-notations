import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getExperiment } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { DatabaseNotice } from '@/components/database-notice';
import { Breadcrumb } from '@/components/f/breadcrumb';
import { PageHead } from '@/components/f/page-head';
import { BatchLogDetail } from '../batch-log-detail';
import { batchLogPath } from '../batch-log-parts';

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
 *
 * `batchLogPath` is shared with the two indexes, in `../batch-log-parts`, so
 * the rule that decides a run's address is written once.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { log } = await params;
  const { data } = await safeRead(() => getExperiment(log), null);
  if (!data) return { title: 'Experiment not found' };

  const description =
    data.summary ??
    `A recorded run${data.startedAt ? ` started ${data.startedAt}` : ''} with ${data.observations.length} measurements.`;

  // The canonical address is the one the run actually lives at, which for
  // a run with a recipe is the nested one this page redirects to.
  const canonical = batchLogPath({ slug: log, recipe: data.recipe });

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
    // R-STA-01 and R-STA-02. The document kicker still names the screen a
    // reader asked for, so the notice arrives on a page and not on a blank.
    return (
      <>
        <PageHead
          left={`NN · Batch logs · ${log}`}
          leftNarrow={log}
          right="Unavailable"
        />
        <div className="flex w-full flex-col items-start gap-5 px-4 pt-5.5 pb-12 shell:px-15 shell:pt-8.5 shell:pb-18">
          <h1 className="m-0 text-40 leading-105 font-serif font-medium tracking-display text-ink shell:text-48 shell:leading-105">
            {log}
          </h1>
          <DatabaseNotice failed={failed} />
        </div>
      </>
    );
  }
  if (!data) notFound();

  // Not permanent. This address stays a stable thing to link to — a run is
  // often logged before its recipe exists — and the recipe it points at can
  // change: `logExperiment` re-logs by slug and writes `recipeId` again, so
  // a run can move to another recipe or lose one. A 308 would be cached in
  // the reader's browser and would keep sending them to an address that
  // 404s. The hop is a 307 and the entry address keeps answering.
  if (data.recipe) redirect(batchLogPath({ slug: log, recipe: data.recipe }));

  return (
    <BatchLogDetail
      breadcrumb={
        <Breadcrumb
          items={[
            { label: 'Batch logs', href: '/batch-logs' },
            { label: data.title },
          ]}
        />
      }
      log={data}
    />
  );
}
