import { PageFoot } from '@/components/f/page-foot';

/**
 * The page foot for `/cuisines`. `classes-cuisines-1280.html:3639`.
 *
 *   CLASSIFICATION · CUISINE   CONNECT · SOURCE · LLMS.TXT   NN/CUISINES
 *
 * Cuisine is the one category type with a top-level route of its own, and
 * the left slot says so: this screen is a view of the classification, filed
 * under one type.
 */
export default function CuisinesFoot() {
  return <PageFoot left="Classification · Cuisine" right="NN/CUISINES" />;
}
