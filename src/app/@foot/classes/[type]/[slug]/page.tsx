import { PageFoot } from '@/components/f/page-foot';
import { CATEGORY_TYPE_LABELS } from '@/lib/site';

/**
 * One tag's foot. `classes-cuisines-1280.html:2338`.
 *
 *   CLASSIFICATION · PRESERVATION      NN/CLASSES/PRESERVATION/CURING
 *
 * The left slot names the type this tag sits in, so the two halves of the
 * foot say the same thing at two levels of address. The right slot is the
 * screen's own path, which is the shape every index and catalogue screen
 * takes.
 *
 * A slot route is a route and takes its segment's own `params`, which is why
 * C-04 is composed here rather than in the layout. It reads no database.
 */
export default async function TermFoot({
  params,
}: {
  params: Promise<{ type: string; slug: string }>;
}) {
  const { type, slug } = await params;
  const typeLabel = CATEGORY_TYPE_LABELS[type] ?? type;

  return (
    <PageFoot
      left={`Classification · ${typeLabel}`}
      right={`NN/CLASSES/${type}/${slug}`}
    />
  );
}
