import { PageFoot } from '@/components/f/page-foot';
import { getRecipeIdentity } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { revisionOrdinal } from '@/lib/site';

/**
 * One stored revision's foot. `recipe-revision-1280.html:3985`.
 *
 *   EFFECTIVITY: THIRD REVISION ONLY — SUPERSEDED   NN-04-02 · THIRD REVISION
 *
 * The second of the two routes that had no slot of their own — see
 * `src/app/@foot/recipes/[slug]/page.tsx` for what that cost on a client
 * navigation.
 *
 * SUPERSEDED IS A COMPARISON, NOT AN ASSUMPTION. The current revision is the
 * row `recipes.current_revision_id` points at and it is NOT the highest
 * number — a backfilled revision carries a later number and an earlier date
 * (AGENTS.md). `/recipes/[slug]/revisions/[number]` answers for the current
 * revision as well as a stored one, so the word is only written when the
 * number asked for is not the current one. That is the same test
 * `src/app/recipes/[slug]/revisions/[number]/page.tsx` makes for
 * `isHistorical`, and the two must not disagree.
 */
export default async function RecipeRevisionFoot({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}) {
  const { slug, number } = await params;
  const revisionNumber = Number(number);
  const { data } = await safeRead(() => getRecipeIdentity(slug), null);

  const ordinal = revisionOrdinal(revisionNumber);
  const current = data?.revisionNumber ?? null;
  const superseded = current != null && current !== revisionNumber;

  return (
    <PageFoot
      left={
        ordinal
          ? `Effectivity: ${ordinal} ${
              superseded ? 'only — superseded' : 'and on'
            }`
          : undefined
      }
      right={`NN/RECIPES/${slug}/REVISIONS/${number}`}
    />
  );
}
