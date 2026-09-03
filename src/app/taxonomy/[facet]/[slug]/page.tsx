import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTerm } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { RecipeGrid } from '@/components/recipe-card';
import { DatabaseNotice } from '@/components/database-notice';
import { TermHierarchy } from '@/components/term-hierarchy';
import { FACET_LABELS, site } from '@/lib/site';
import { TAXONOMY_FACETS, type TaxonomyFacet } from '@/lib/domain/schemas';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ facet: string; slug: string }> };

function asFacet(value: string): TaxonomyFacet | null {
  return (TAXONOMY_FACETS as readonly string[]).includes(value)
    ? (value as TaxonomyFacet)
    : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { facet, slug } = await params;
  const parsed = asFacet(facet);
  if (!parsed) return { title: 'Not found' };

  const { data } = await safeRead(() => getTerm(parsed, slug), null);
  if (!data) return { title: 'Not found' };

  const facetLabel = FACET_LABELS[facet] ?? facet;
  const description =
    data.term.description ??
    `${data.recipes.length} recipes classified as ${data.term.label} (${facetLabel.toLowerCase()}) in the ${site.name} repository.`;

  return {
    title: `${data.term.label} — ${facetLabel}`,
    description,
    alternates: { canonical: `/taxonomy/${facet}/${slug}` },
    openGraph: {
      type: 'website',
      title: `${data.term.label} — ${facetLabel}`,
      description,
      url: `/taxonomy/${facet}/${slug}`,
    },
  };
}

export default async function TermPage({ params }: Params) {
  const { facet, slug } = await params;
  const parsed = asFacet(facet);
  if (!parsed) notFound();

  // Cuisine terms have a dedicated section; keep one canonical URL per term.
  if (parsed === 'cuisine') notFound();

  const { data, configured, failed } = await safeRead(
    () => getTerm(parsed, slug),
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
        <Link href="/taxonomy">Taxonomy</Link> / {FACET_LABELS[facet] ?? facet}{' '}
        / {data.term.label}
      </div>
      <header className="hero">
        <span className="badge">{FACET_LABELS[facet] ?? facet}</span>
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
