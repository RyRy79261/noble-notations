import type { Metadata } from 'next';
import Link from 'next/link';
import { listCategories } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { DatabaseNotice } from '@/components/database-notice';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cuisines',
  description:
    'Every cuisine represented in the repository, with the number of recipes filed under each.',
  alternates: { canonical: '/cuisines' },
};

export default async function CuisinesPage() {
  const { data, configured, failed } = await safeRead(
    () => listCategories('cuisine'),
    [],
  );

  return (
    <div className="page">
      <header className="hero">
        <h1>Cuisines</h1>
        <p>
          The cooking traditions in this store. A recipe can have more than one
          tradition. Most good cooking does.
        </p>
      </header>

      {!configured || failed ? (
        <DatabaseNotice failed={failed} />
      ) : data.length === 0 ? (
        <p className="empty">No cuisines recorded yet.</p>
      ) : (
        <div className="grid">
          {data.map((term) => (
            <Link
              className="card"
              href={`/cuisines/${term.slug}`}
              key={term.id}
            >
              <h3>{term.label}</h3>
              {term.description ? <p>{term.description}</p> : null}
              <div className="card-meta">
                <span className="num">{term.recipeCount}</span> recipe
                {term.recipeCount === 1 ? '' : 's'}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
