import type { Metadata } from 'next';
import Link from 'next/link';
import { listExperiments } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { DatabaseNotice } from '@/components/database-notice';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Experiments',
  description:
    'Recorded runs — actual batches that were cooked, with their measurements and outcomes.',
  alternates: { canonical: '/experiments' },
};

export default async function ExperimentsPage() {
  const { data, configured, failed } = await safeRead(listExperiments, []);

  return (
    <div className="page">
      <header className="hero">
        <h1>Experiments</h1>
        <p>
          A recipe is the plan. An experiment is the result. It records the
          weight of each piece, the drying times and the costs. It also records
          what to do differently in the next batch.
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
              href={`/experiments/${experiment.slug}`}
              key={experiment.slug}
            >
              <h3>{experiment.title}</h3>
              {experiment.summary ? <p>{experiment.summary}</p> : null}
              <div className="card-meta">
                {experiment.startedAt ? (
                  <span className="num">{experiment.startedAt}</span>
                ) : null}
                {experiment.recipe ? (
                  <span>{experiment.recipe.title}</span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
