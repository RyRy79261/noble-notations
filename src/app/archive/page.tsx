import type { Metadata } from 'next';
import Link from 'next/link';
import { listArchive, SECTION_LABELS } from '@/lib/archive';

export const metadata: Metadata = {
  title: 'Archive',
  description:
    'The frozen Markdown archive — every note as originally written, before the repository moved to a database.',
  alternates: { canonical: '/archive' },
};

export default async function ArchivePage() {
  const entries = await listArchive();

  const bySection = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = bySection.get(entry.section) ?? [];
    list.push(entry);
    bySection.set(entry.section, list);
  }

  return (
    <div className="page">
      <header className="hero">
        <h1>Archive</h1>
        <p>
          Every note as originally written, preserved verbatim. These files are
          the provenance record the structured recipes were derived from — they
          are history, and are never edited to change a recipe.
        </p>
      </header>

      {[...bySection.entries()].map(([section, list]) => (
        <section className="section" key={section}>
          <div className="section-head">
            <h2>{SECTION_LABELS[section] ?? section}</h2>
            <span className="faint">{list.length}</span>
          </div>
          <div className="grid">
            {list.map((entry) => (
              <Link
                className="card"
                href={`/archive/${entry.segments.join('/')}`}
                key={entry.slug}
              >
                <h3>{entry.title}</h3>
                {entry.summary ? <p>{entry.summary}</p> : null}
                {entry.archivedFrom ? (
                  <div className="card-meta">
                    <code>{entry.archivedFrom}</code>
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
