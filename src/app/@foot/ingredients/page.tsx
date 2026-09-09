import { PageFoot } from '@/components/f/page-foot';

/**
 * The page foot for `/ingredients`. `ingredients-1280.html:1455`.
 *
 *   INGREDIENTS · INDEX   CONNECT · SOURCE · LLMS.TXT   NN/INGREDIENTS
 *
 * An index screen takes a slash PATH in the right slot rather than a
 * document number — `page-foot.tsx` records the two shapes — and the left
 * slot is the screen's own place in the catalogue rather than an
 * effectivity: an ingredient list is not a revision of anything.
 */
export default function IngredientsFoot() {
  return <PageFoot left="Ingredients · Index" right="NN/INGREDIENTS" />;
}
