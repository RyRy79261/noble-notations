import { PageFoot } from '@/components/f/page-foot';

/**
 * `/science`'s foot. `science-1280.html:782`.
 *
 * The left slot is the effectivity statement the design draws on the three
 * screens that answer for the whole catalogue — `/`, `/recipes` and this one
 * — and the right slot is the index's own document number. D-07 records why
 * the left slot is a document issue and not a copyright.
 */
export default function ScienceFoot() {
  return (
    <PageFoot left="Effectivity: sixth revision and on" right="NN-00-02" />
  );
}
