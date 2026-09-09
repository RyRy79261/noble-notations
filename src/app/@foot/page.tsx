import { PageFoot } from '@/components/f/page-foot';

/**
 * The page foot for `/`. `home-recipes-1280.html:1717`.
 *
 *   EFFECTIVITY: SIXTH REVISION AND ON   CONNECT · SOURCE · LLMS.TXT
 *                                                            NN-00-00
 *
 * The effectivity line is a DOCUMENT CONSTANT and not a reading of the
 * data, which is why it is a literal here rather than a `MAX(revision)`
 * query behind a footer. The design writes it on the three screens that
 * carry the repository as a whole — `/`, `/recipes` and `/science` — in the
 * same slot and the same voice as `ISSUE 01 · 08 SEP 2026`, which D-07
 * already settled as an issue of the document rather than a date. An
 * effectivity states which revisions a manual applies from; it changes when
 * the document is reissued, not when a recipe is revised.
 *
 * Sentence case: `PageFoot` uppercases both slots, because the case belongs
 * to the component and not to the copy.
 */
export default function HomeFoot() {
  return (
    <PageFoot left="Effectivity: sixth revision and on" right="NN-00-00" />
  );
}
