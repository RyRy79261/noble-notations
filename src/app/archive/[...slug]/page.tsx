import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArchiveDocument, listArchive, SECTION_LABELS } from '@/lib/archive';
import { Markdown } from '@/components/markdown';

type Params = { params: Promise<{ slug: string[] }> };

export async function generateStaticParams() {
  const entries = await listArchive();
  return entries.map((entry) => ({ slug: entry.segments }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getArchiveDocument(slug);
  if (!doc) return { title: 'Not found' };

  return {
    title: doc.title,
    description: doc.summary || undefined,
    alternates: { canonical: `/archive/${doc.segments.join('/')}` },
    openGraph: {
      type: 'article',
      title: doc.title,
      description: doc.summary || undefined,
      url: `/archive/${doc.segments.join('/')}`,
    },
  };
}

export default async function ArchiveDocumentPage({ params }: Params) {
  const { slug } = await params;
  const doc = await getArchiveDocument(slug);
  if (!doc) notFound();

  return (
    <div className="prose-page">
      <div className="breadcrumb">
        <Link href="/archive">Archive</Link> /{' '}
        {SECTION_LABELS[doc.section] ?? doc.section} / {doc.title}
      </div>

      <header className="hero">
        <span className="badge">archived</span>
        <h1>{doc.title}</h1>
        {doc.summary ? <p className="lede">{doc.summary}</p> : null}
        {doc.archivedFrom ? (
          <p className="faint">
            Originally <code>{doc.archivedFrom}</code>. Preserved verbatim.
          </p>
        ) : null}
      </header>

      <Markdown>{doc.body}</Markdown>
    </div>
  );
}
