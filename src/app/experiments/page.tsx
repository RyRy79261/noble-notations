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
          A recipe is the intent. An experiment is what happened when it met
          reality — per-piece weights, drying times, costs, and what the batch
          taught that the next one should do differently.
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
