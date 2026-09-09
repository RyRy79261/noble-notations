import { PageFoot } from '@/components/f/page-foot';

/**
 * One run of one recipe — the address the design draws.
 * `batch-logs-1280.html:3628`.
 *
 *   NN-04-02 · BATCH 4   NN/RECIPES/BAUMY-BILTONG/BATCH-LOGS/BATCH-FOUR
 *
 * The right slot is the design's, to the character. The left one loses its
 * catalogue number and its batch number, neither of which the schema holds,
 * and keeps what a reader can act on: which of the two kinds of document
 * they are at the foot of.
 */
export default async function RecipeBatchLogFoot({
  params,
}: {
  params: Promise<{ slug: string; log: string }>;
}) {
  const { slug, log } = await params;

  return (
    <PageFoot
      left="Cooking batch log"
      right={`NN/RECIPES/${slug}/BATCH-LOGS/${log}`}
    />
  );
}
