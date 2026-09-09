import { PageFoot } from '@/components/f/page-foot';

/**
 * One ingredient's foot. `ingredients-1280.html:2240`.
 *
 *   INGREDIENTS · SPICES   NN/INGREDIENTS/CORIANDER-SEED
 *
 * The design writes the AISLE in the left slot. This slot has the slug and
 * nothing else, and reading the record again for one word in the footer
 * would be a second `getIngredient` on every load — three queries for a
 * caption. So the left slot names the section, exactly as the cuisine slot
 * beside it does: "the design draws the type, not the term, because a
 * cuisine page is still a view of the classification". An ingredient page is
 * still a view of the catalogue, and the aisle is already drawn twice on the
 * screen — in the trail and in the `AISLE` figure.
 */
export default async function IngredientFoot({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <PageFoot left="Ingredients · Index" right={`NN/INGREDIENTS/${slug}`} />
  );
}
