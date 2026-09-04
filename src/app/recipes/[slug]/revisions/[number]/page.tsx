import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getRecipeBySlug } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { RecipeDetail } from '@/components/recipe-detail';
import { DatabaseNotice } from '@/components/database-notice';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string; number: string }> };

/**
 * Superseded revisions are readable but deliberately not indexed: they are
 * near-duplicates of the current revision and would compete with it in
 * search results. The canonical points back at the live recipe.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, number } = await params;
  return {
    title: `Revision ${number}`,
    alternates: { canonical: `/recipes/${slug}` },
    robots: { index: false, follow: true },
  };
}

export default async function RevisionPage({ params }: Params) {
  const { slug, number } = await params;
  const revisionNumber = Number(number);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) notFound();

  const {
    data: recipe,
    configured,
    failed,
  } = await safeRead(() => getRecipeBySlug(slug, revisionNumber), null);

  if (!configured || failed) {
    return (
      <div className="page">
        <h1>{slug}</h1>
        <DatabaseNotice failed={failed} />
      </div>
    );
  }
  if (!recipe) notFound();

  return (
    <RecipeDetail
      recipe={recipe}
      isHistorical={recipe.revision.revisionNumber !== recipe.revisionNumber}
    />
  );
}
