import { PageFoot } from '@/components/f/page-foot';

/**
 * The page foot for `/classes`. `classes-cuisines-1280.html:1543`.
 *
 *   CLASSIFICATION · INDEX   CONNECT · SOURCE · LLMS.TXT   NN/CLASSES
 *
 * An index screen takes a slash PATH in the right slot rather than a
 * document number — `page-foot.tsx` records the two shapes — and the left
 * slot is the screen's own place in the catalogue, not an effectivity: the
 * classification is not a revision of anything.
 *
 * This slot matches `/classes` and nothing under it; `/classes/[type]/[slug]`
 * has its own beside it.
 */
export default function ClassesFoot() {
  return <PageFoot left="Classification · Index" right="NN/CLASSES" />;
}
