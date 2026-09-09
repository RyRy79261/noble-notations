import { PageFoot } from '@/components/f/page-foot';
import { site } from '@/lib/site';

/**
 * `/search`'s page foot — `ISSUE 01 · 08 SEP 2026` and `NN/SEARCH`
 * (`list-search-archive-1280.html:3419`).
 *
 * The left slot is the generic document issue: a search has no effectivity
 * of its own, which is exactly the case D-07 keeps `site.issue` for.
 */
export default function SearchFoot() {
  return <PageFoot left={site.issue} right="NN/SEARCH" />;
}
