import Link from 'next/link';
import { site } from '@/lib/site';

/**
 * Shown instead of content when the database is not configured, or when a
 * read failed. Says what to do next rather than just reporting an error.
 */
export function DatabaseNotice({ failed }: { failed?: boolean }) {
  if (failed) {
    return (
      <div className="notice">
        <h2>The repository is temporarily unreachable</h2>
        <p>
          The database did not answer. This is usually transient — try again in
          a moment. The frozen <Link href="/archive">Markdown archive</Link> is
          served from the repository itself and is unaffected.
        </p>
      </div>
    );
  }

  return (
    <div className="notice">
      <h2>No database connected yet</h2>
      <p>
        {site.name} reads its recipes from a Neon Postgres database. This
        deployment has no <code>DATABASE_URL</code> set, so there is nothing to
        show yet.
      </p>
      <p>
        Add the Neon integration on Vercel (or set <code>DATABASE_URL</code>{' '}
        locally), then run <code>pnpm db:migrate</code> and{' '}
        <code>pnpm ingest</code> to load the archive.
      </p>
      <p>
        In the meantime the <Link href="/archive">Markdown archive</Link> is
        served straight from the repository and still works.
      </p>
    </div>
  );
}
