import { PageFoot } from '@/components/f/page-foot';

/**
 * The foot of a run that names no recipe.
 *
 *   EVERY RUN, LINKED OR NOT   NN/BATCH-LOGS/CHILLI-WASH-TRIAL
 *
 * The design's own drawing of a run's foot is `NN-04-02 · BATCH 4`
 * (`batch-logs-1280.html:3634`), a catalogue number and a batch number.
 * Nothing in the schema holds either, so the left slot keeps the index's
 * effectivity — which is the one that applies to a run living at the top
 * level — and the right slot carries the screen's own path (R-STA-05: the
 * absent segment is dropped, not filled with a placeholder).
 *
 * A run that DOES name a recipe never renders this: D-01 sends it to
 * `/recipes/[slug]/batch-logs/[log]`, which has its own slot.
 */
export default async function BatchLogFoot({
  params,
}: {
  params: Promise<{ log: string }>;
}) {
  const { log } = await params;

  return (
    <PageFoot left="Every run, linked or not" right={`NN/BATCH-LOGS/${log}`} />
  );
}
