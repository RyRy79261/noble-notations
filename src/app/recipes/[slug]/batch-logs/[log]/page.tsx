import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getExperiment } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { DatabaseNotice } from '@/components/database-notice';
import { Breadcrumb } from '@/components/f/breadcrumb';
import { PageHead } from '@/components/f/page-head';
import { BatchLogDetail } from '@/app/batch-logs/batch-log-detail';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string; log: string }> };

/**
 * One run of one recipe. This is the address the design draws.
 *
 * The body is `BatchLogDetail`, shared with `/batch-logs/[log]`. Only the
 * trail differs, and the design draws this one WITHOUT a `RECIPES` crumb:
 * `BAUMY BILTONG · BATCH LOGS · BATCH FOUR`
 * (`batch-logs-1280.html:2202`).
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
      <>
        <PageHead
          left={`NN · ${slug} · ${log}`}
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

  const recipe = data.recipe;
  if (!recipe || recipe.slug !== slug) notFound();

  return (
    <BatchLogDetail
      breadcrumb={
        <Breadcrumb
          items={[
            { label: recipe.title, href: `/recipes/${slug}` },
            { label: 'Batch logs', href: `/recipes/${slug}/batch-logs` },
            { label: data.title },
          ]}
        />
      }
      log={data}
    />
  );
}
