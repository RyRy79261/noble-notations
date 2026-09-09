import { PageFoot } from '@/components/f/page-foot';

/**
 * One recipe's runs. `batch-logs-1280.html:1993`.
 *
 *   NN-04-02 · COOKING BATCH LOGS   NN/RECIPES/BAUMY-BILTONG/BATCH-LOGS
 *
 * The catalogue number in the design's left slot has nothing behind it in
 * the schema — `recipe-card.tsx` records the same absence — so the segment
 * is dropped and the words that follow it stay.
 */
export default async function RecipeBatchLogsFoot({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <PageFoot
      left="Cooking batch logs"
      right={`NN/RECIPES/${slug}/BATCH-LOGS`}
    />
  );
}
