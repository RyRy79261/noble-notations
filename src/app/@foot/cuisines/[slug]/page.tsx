import { PageFoot } from '@/components/f/page-foot';

/**
 * One cuisine's foot. `classes-cuisines-1280.html:2925`.
 *
 *   CLASSIFICATION · CUISINE      NN/CUISINES/SOUTH-AFRICAN
 *
 * The left slot is the same as the index's — the design draws the type, not
 * the term, because a cuisine page is still a view of the classification —
 * and the right slot carries the screen's own path.
 */
export default async function CuisineFoot({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <PageFoot left="Classification · Cuisine" right={`NN/CUISINES/${slug}`} />
  );
}
