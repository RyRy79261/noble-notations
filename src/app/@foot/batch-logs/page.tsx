import { PageFoot } from '@/components/f/page-foot';

/**
 * The page foot for `/batch-logs`. `batch-logs-1280.html:1160`.
 *
 *   EVERY RUN, LINKED OR NOT   CONNECT · SOURCE · LLMS.TXT   NN/BATCH-LOGS
 *
 * The left slot is this screen's effectivity statement and it is the whole
 * argument of the screen in five words: a run that names no recipe is listed
 * here with the rest (K-01, R-SCR-44, R-NAV-08), and this is the only index
 * where it appears at all.
 */
export default function BatchLogsFoot() {
  return <PageFoot left="Every run, linked or not" right="NN/BATCH-LOGS" />;
}
