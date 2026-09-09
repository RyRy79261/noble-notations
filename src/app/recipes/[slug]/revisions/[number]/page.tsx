import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getRecipeBySlug } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { RecipeDetail } from '@/components/recipe-detail';
import { DatabaseNotice } from '@/components/database-notice';
import { PageHead } from '@/components/f/page-head';
import { revisionOrdinal } from '@/lib/site';

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
    title: revisionOrdinal(Number(number)) ?? `Revision ${number}`,
    alternates: { canonical: `/recipes/${slug}` },
    robots: { index: false, follow: true },
  };
}

export default async function RevisionPage({ params }: Params) {
  const { slug, number } = await params;
  const revisionNumber = Number(number);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) notFound();

  /*
   * Two reads, in parallel, and the second one is the whole of R-SCR-16.
   *
   * `getRecipeBySlug(slug, n)` sets `RecipeView.revisionNumber` to the
   * revision it was ASKED for, so the old
   * `recipe.revision.revisionNumber !== recipe.revisionNumber` compared a
   * number with itself: `isHistorical` was false on every revision page ever
   * served and the superseded notice rendered nowhere.
   *
   * The current revision is the row `recipes.current_revision_id` points at,
   * which the view does not expose and which is NOT the highest number — a
   * backfilled revision carries a later number and an earlier date. The
   * unnumbered read is the query layer's own answer to "which one is
   * current", so it is asked rather than guessed (R-BLD-05).
   */
  const [{ data: recipe, configured, failed }, { data: live }] =
    await Promise.all([
      safeRead(() => getRecipeBySlug(slug, revisionNumber), null),
      safeRead(() => getRecipeBySlug(slug), null),
    ]);

  if (!configured || failed) {
    // R-STA-01 and R-STA-02, with the kicker the screen would have carried.
    return (
      <>
        <PageHead
          left={`Recipes · ${slug}`}
          leftNarrow={slug}
          right={`${
            revisionOrdinal(revisionNumber) ?? `Revision ${revisionNumber}`
          } · Unavailable`}
        />
        <div className="flex w-full flex-col items-start gap-5 px-4 pt-5.5 pb-12 shell:px-15 shell:pt-8.5 shell:pb-18">
          <h1 className="m-0 text-40 leading-105 font-serif font-medium tracking-display text-ink shell:text-48 shell:leading-105">
            {slug}
          </h1>
          <DatabaseNotice failed={failed} />
        </div>
      </>
    );
  }
  if (!recipe) notFound();

  const currentRevisionNumber =
    live?.revision.revisionNumber ?? recipe.revisionNumber;

  return (
    <RecipeDetail
      recipe={recipe}
      isHistorical={currentRevisionNumber !== recipe.revision.revisionNumber}
      currentRevisionNumber={currentRevisionNumber}
    />
  );
}
