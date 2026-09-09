import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRecipeIdentity, listExperiments } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { DatabaseNotice } from '@/components/database-notice';
import { Breadcrumb } from '@/components/f/breadcrumb';
import { PageHead, PageHero } from '@/components/f/page-head';
import { SectionHead } from '@/components/f/section-label';
import { Stat } from '@/components/f/stat';
import { cardinal, roman } from '@/lib/site';
import { FOCUS_RING } from '@/components/f/button';
import { cn } from '@/lib/utils';

import {
  BatchLedger,
  BatchLogRows,
  spent,
} from '@/app/batch-logs/batch-log-parts';
import { monthYear, runSpan } from '@/app/batch-logs/run-dates';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/**
 * The runs of one recipe — `batch-logs-1280.html:1202`.
 *
 * The same list as `/batch-logs`, filtered to one recipe by the query's
 * optional `recipeSlug` and drawn WITHOUT the SOURCE cell: every row here
 * names the recipe already, in the trail three lines above it. The top-level
 * index keeps listing every run, including one that names no recipe, because
 * that run has no address under a recipe at all. See K-01, R-NAV-08 and
 * D-01.
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
  // tell a 404 from an empty list, and the filtered query cannot: it gives
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
      <>
        <PageHead
          left={`NN · ${slug} · Batch logs`}
          leftNarrow={slug}
          right="Unavailable"
        />
        <div className="flex w-full flex-col items-start gap-5 px-4 pt-5.5 pb-12 shell:px-15 shell:pt-8.5 shell:pb-18">
          <h1 className="m-0 text-40 leading-105 font-serif font-medium tracking-display text-ink shell:text-48 shell:leading-105">
            {slug}
          </h1>
          <DatabaseNotice failed={failed} />
        </div>
      </>
    );
  }

  const recipe = data.recipe;
  if (!recipe) notFound();

  /* Oldest first — see the note on `/batch-logs`. */
  const logs = [...data.logs].reverse();
  const span = runSpan(logs);
  const total = spent(logs);

  /*
   * TWO WORDINGS. The design's 360 head carries the whole span because its
   * left slot is the bare catalogue number `NN-04-02`
   * (`m360-batch-search-list.html:1090`), which is nine characters. This
   * build has no catalogue number and names the recipe instead, so the two
   * `nowrap` slots together overran the 328px row and clipped the left one.
   * The span is on the section meta immediately below at both widths.
   */
  const kickerRightNarrow =
    logs.length === 0
      ? 'No runs yet'
      : `${cardinal(logs.length)} batch log${logs.length === 1 ? '' : 's'}`;
  const kickerRight =
    logs.length === 0
      ? 'No runs yet'
      : [
          kickerRightNarrow,
          span ? `${monthYear(span.first)} — ${monthYear(span.last)}` : null,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <>
      <PageHead
        left={`NN · ${recipe.title} · Batch logs`}
        leftNarrow={`NN · ${recipe.title}`}
        right={kickerRight}
        rightNarrow={kickerRightNarrow}
      />

      <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:gap-11 shell:px-15 shell:pt-8.5 shell:pb-18">
        <Breadcrumb
          items={[
            { label: 'Recipes', href: '/recipes' },
            { label: recipe.title, href: `/recipes/${slug}` },
            { label: 'Batch logs' },
          ]}
        />

        <PageHero
          kicker={`Cooking · ${recipe.title}`}
          title="Batch logs"
          ledeClassName="shell:max-w-190"
          lede={`Every time ${recipe.title} has actually been made, as against the revisions of how it ought to be made. A run records what was bought, what it weighed going in and coming out, and what went wrong — which is where every revision after the first one came from.`}
        />

        {logs.length > 0 ? (
          <BatchLedger>
            <Stat
              grow
              size="lg"
              sizeNarrow="sm"
              className="min-w-25"
              label="Batch logs"
              value={logs.length}
            />
            {span ? (
              <>
                <Stat
                  grow
                  size="lg"
                  sizeNarrow="sm"
                  className="min-w-25"
                  label="First run"
                  value={monthYear(span.first)}
                />
                <Stat
                  grow
                  size="lg"
                  sizeNarrow="sm"
                  className="min-w-25"
                  label="Latest run"
                  value={monthYear(span.last)}
                />
              </>
            ) : null}
            {/* The design's `SPENT`. See the note on `spent()` for the three
                weight figures beside it that are still not drawn. */}
            {total ? (
              <Stat
                grow
                size="lg"
                sizeNarrow="sm"
                className="min-w-25"
                label="Spent"
                value={total.value}
              />
            ) : null}
          </BatchLedger>
        ) : null}

        {logs.length === 0 ? (
          <p className="m-0 text-19 font-serif text-ink-3 italic">
            No runs recorded for this recipe yet. The{' '}
            <Link
              href="/batch-logs"
              className={cn(
                'text-ink underline underline-offset-2',
                FOCUS_RING,
              )}
            >
              full list of runs
            </Link>{' '}
            holds the rest.
          </p>
        ) : (
          <>
            <SectionHead
              ordinal={roman(1)}
              title="Every run, oldest first"
              /* Two wordings, one meta. The design writes the span to the
                 day at 1280 and in years at 360; both are in the DOM and
                 `display` picks one, so nothing is unmounted on a rotate. */
              meta={
                span ? (
                  <>
                    <span className="shell:hidden">
                      {`${cardinal(logs.length)} · ${span.firstYear} — ${span.lastYear}`}
                    </span>
                    <span className="hidden shell:inline">
                      {`${cardinal(logs.length)} · ${span.firstLabel} — ${span.lastLabel}`}
                    </span>
                  </>
                ) : (
                  cardinal(logs.length)
                )
              }
            />
            {/* No SOURCE cell: the trail above already names the recipe. */}
            <BatchLogRows logs={logs} source={false} />
          </>
        )}
      </div>
    </>
  );
}
