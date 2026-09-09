import type { Metadata } from 'next';
import Link from 'next/link';
import { listExperiments } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { DatabaseNotice } from '@/components/database-notice';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Batch logs',
  description:
    'Recorded runs — actual batches that were cooked, with their measurements and outcomes.',
  alternates: { canonical: '/batch-logs' },
};

export default async function BatchLogsPage() {
  const { data, configured, failed } = await safeRead(listExperiments, []);

  return (
    <div className="page">
      <header className="hero">
        <h1>Batch logs</h1>
        <p>
          A recipe is the plan. A batch log is the result. It records the weight
          of each piece, the drying times and the costs. It also records what to
          do differently in the next batch.
        </p>
      </header>

      {!configured || failed ? (
        <DatabaseNotice failed={failed} />
      ) : data.length === 0 ? (
        <p className="empty">No runs recorded yet.</p>
      ) : (
        <div className="grid">
          {data.map((experiment) => (
            <Link
              className="card"
              // A run that names a recipe lives under that recipe. A run
              // that names none lives here. This index links straight at
              // whichever of the two is the run's own address, so the
              // reader never pays for the redirect in /batch-logs/[log].
              // See D-01.
              href={
                experiment.recipe
                  ? `/recipes/${experiment.recipe.slug}/batch-logs/${experiment.slug}`
                  : `/batch-logs/${experiment.slug}`
              }
              key={experiment.slug}
            >
              <h3>{experiment.title}</h3>
              {experiment.summary ? <p>{experiment.summary}</p> : null}
              <div className="card-meta">
                {experiment.startedAt ? (
                  <span className="num">{experiment.startedAt}</span>
                ) : null}
                {/* R-SCR-44: a run names a recipe only optionally (K-01),
                    and the design draws the empty case as "SOURCE / Not yet
                    linked" rather than as nothing. An absent element reads
                    as a short meta row, not as a run with no source. */}
                {experiment.recipe ? (
                  <span>{experiment.recipe.title}</span>
                ) : (
                  <span className="faint">Not yet linked</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
