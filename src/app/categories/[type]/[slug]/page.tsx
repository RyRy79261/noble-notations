import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTerm } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { RecipeGrid } from '@/components/recipe-card';
import { DatabaseNotice } from '@/components/database-notice';
import { TermHierarchy } from '@/components/term-hierarchy';
import { CATEGORY_TYPE_LABELS, site } from '@/lib/site';
import { CATEGORY_TYPES, type CategoryType } from '@/lib/domain/schemas';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ type: string; slug: string }> };

function asCategoryType(value: string): CategoryType | null {
  return (CATEGORY_TYPES as readonly string[]).includes(value)
    ? (value as CategoryType)
    : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { type, slug } = await params;
  const parsed = asCategoryType(type);
  if (!parsed) return { title: 'Not found' };

  const { data } = await safeRead(() => getTerm(parsed, slug), null);
  if (!data) return { title: 'Not found' };

  const typeLabel = CATEGORY_TYPE_LABELS[type] ?? type;
  const description =
    data.term.description ??
    `${data.recipes.length} recipes with the tag ${data.term.label} (${typeLabel.toLowerCase()}) in the ${site.name} repository.`;

  return {
    title: `${data.term.label} — ${typeLabel}`,
    description,
    alternates: { canonical: `/categories/${type}/${slug}` },
    openGraph: {
      type: 'website',
      title: `${data.term.label} — ${typeLabel}`,
      description,
      url: `/categories/${type}/${slug}`,
    },
  };
}

export default async function TermPage({ params }: Params) {
  const { type, slug } = await params;
  const parsed = asCategoryType(type);
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
        <Link href="/categories">Categories</Link> /{' '}
        {CATEGORY_TYPE_LABELS[type] ?? type} / {data.term.label}
      </div>
      <header className="hero">
        <span className="badge">{CATEGORY_TYPE_LABELS[type] ?? type}</span>
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
