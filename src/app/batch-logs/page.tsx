import type { Metadata } from 'next';
import { listExperiments } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { DatabaseNotice } from '@/components/database-notice';
import { Breadcrumb } from '@/components/f/breadcrumb';
import { Empty } from '@/components/f/notice';
import { PageHead, PageHero } from '@/components/f/page-head';
import { SectionHead } from '@/components/f/section-label';
import { Stat } from '@/components/f/stat';
import { cardinal, roman } from '@/lib/site';

import { BatchLedger, BatchLogRows, spent } from './batch-log-parts';
import { monthYear, runSpan } from './run-dates';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Batch logs',
  description:
    'Recorded runs — actual batches that were cooked, with their measurements and outcomes.',
  alternates: { canonical: '/batch-logs' },
};

/**
 * `/batch-logs` — every run, linked or not.
 *
 * `batch-logs-1280.html:203`: head, one crumb, hero, a `f-desk` ledger, then
 * `I Every run, oldest first` over a ruled record list. No spine and no card
 * grid — each row is a paragraph-length record whose fields have different
 * shapes, which is PATTERN C.
 *
 * OLDEST FIRST, AND THE QUERY SAYS NEWEST FIRST. `listExperiments` orders by
 * `startedAt` descending because the MCP tool and the sitemap both want the
 * newest run first. The design draws the opposite and its own lede explains
 * why — "Every run that has been cooked, newest at the foot" — so the page
 * reverses the list rather than the query. A run is a diary entry and a diary
 * is read forwards.
 *
 * THE LEDGER DRAWS WHAT THE REPOSITORY CAN SUPPORT. The design fills it with
 * `RAW, TOTAL`, `DRIED, TOTAL`, `MEAN YIELD` and `SPENT`. `SPENT` is drawn:
 * `experiments.cost_total` is on every row and `listExperiments` now selects
 * it. The three weight figures are NOT, and this is a recorded D-12
 * omission rather than an oversight — three of the four runs in the archive
 * never weighed anything out, so a total and a mean across them would be a
 * figure about the runs that did record one printed under a label claiming
 * all of them. Each row's own `RAW / DRIED / YIELD` panel states what that
 * run actually recorded, which is the honest half of the same drawing.
 * `batch-log-parts.tsx` carries the same note beside `spent()`.
 */
export default async function BatchLogsPage() {
  const { data, configured, failed } = await safeRead(listExperiments, []);

  /* The query gives newest first; the design draws oldest first. */
  const logs = [...data].reverse();
  const span = runSpan(logs);
  const unlinked = logs.filter((log) => !log.recipe).length;
  const total = spent(logs);

  const kickerRight =
    logs.length === 0
      ? 'No runs yet'
      : [
          `${cardinal(logs.length)} run${logs.length === 1 ? '' : 's'}`,
          span ? `${monthYear(span.first)} — ${monthYear(span.last)}` : null,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <>
      <PageHead
        left="NN · Batch logs"
        right={configured && !failed ? kickerRight : 'Unavailable'}
      />

      <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:gap-11 shell:px-15 shell:pt-8.5 shell:pb-18">
        <Breadcrumb items={[{ label: 'Batch logs' }]} />

        <PageHero
          kicker="Index · Every run"
          title="Batch logs"
          ledeClassName="shell:max-w-190"
          lede="Every run that has been cooked, newest at the foot. A run usually names the recipe it came from, but it does not have to: a trial is often logged before the recipe that describes it exists. Those runs live here and nowhere else."
        />

        {configured && !failed && logs.length > 0 ? (
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
            {/* R-SCR-44 stated as a figure. Drawn only when there is one:
                `NOT YET LINKED — 0` on a screen whose whole argument is that
                such a run has a home would read as a rebuke of itself. */}
            {unlinked > 0 ? (
              <Stat
                grow
                size="lg"
                sizeNarrow="sm"
                className="min-w-25"
                label="Not yet linked"
                value={unlinked}
              />
            ) : null}
          </BatchLedger>
        ) : null}

        {!configured || failed ? (
          <DatabaseNotice failed={failed} />
        ) : logs.length === 0 ? (
          <Empty>No runs recorded yet.</Empty>
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
            <BatchLogRows logs={logs} />
          </>
        )}
      </div>
    </>
  );
}
