import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTerm } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { RecipeGrid } from '@/components/recipe-card';
import { DatabaseNotice } from '@/components/database-notice';
import { TermHierarchy } from '@/components/term-hierarchy';
import { site } from '@/lib/site';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await safeRead(() => getTerm('cuisine', slug), null);
  if (!data) return { title: 'Cuisine not found' };

  const description =
    data.term.description ??
    `${data.recipes.length} ${data.term.label} recipes in the ${site.name} repository.`;

  return {
    title: `${data.term.label} recipes`,
    description,
    alternates: { canonical: `/cuisines/${slug}` },
    openGraph: {
      type: 'website',
      title: `${data.term.label} recipes`,
      description,
      url: `/cuisines/${slug}`,
    },
  };
}

export default async function CuisinePage({ params }: Params) {
  const { slug } = await params;
  const { data, configured, failed } = await safeRead(
    () => getTerm('cuisine', slug),
    null,
  );

  if (!configured || failed) {
    return (
      <div className="page">
        <h1>{slug}</h1>
        <DatabaseNotice failed={failed} />
      </div>
    );
  }
  if (!data) notFound();

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link href="/cuisines">Cuisines</Link> / {data.term.label}
      </div>
      <header className="hero">
        <h1>{data.term.label}</h1>
        {data.term.description ? <p>{data.term.description}</p> : null}
        <TermHierarchy parent={data.parent} narrower={data.children} />
        <p className="faint">
          <span className="num">{data.recipes.length}</span> recipe
          {data.recipes.length === 1 ? '' : 's'}
        </p>
      </header>
      <RecipeGrid recipes={data.recipes} />
    </div>
  );
}
