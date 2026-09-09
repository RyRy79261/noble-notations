import { PageFoot } from '@/components/f/page-foot';

/**
 * The page foot for `/recipes`. `home-recipes-1280.html:2507`.
 *
 *   EFFECTIVITY: SIXTH REVISION AND ON   CONNECT · SOURCE · LLMS.TXT
 *                                                            NN-00-01
 *
 * Same effectivity as `/` — see `src/app/@foot/page.tsx` for why it is a
 * document constant — and the next document number in the series.
 *
 * This slot matches `/recipes` and nothing under it. Every route beneath it
 * now has a file of its own — `[slug]`, `[slug]/revisions/[number]`,
 * `[slug]/batch-logs` and `[slug]/batch-logs/[log]` — which matters because
 * an unmatched slot is only replaced by `default.tsx` on a HARD load. On a
 * client navigation Next keeps the previously active slot, so a recipe
 * reached by clicking a card wore the foot of the screen it was clicked
 * from.
 */
export default function RecipesFoot() {
  return (
    <PageFoot left="Effectivity: sixth revision and on" right="NN-00-01" />
  );
}
