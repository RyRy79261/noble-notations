import { PageFoot } from '@/components/f/page-foot';

/**
 * The page foot for every route that has not named its own.
 *
 * A parallel slot renders `default.tsx` wherever the slot has no route of
 * its own — on the first load and on a full reload as well as on a client
 * navigation — so this is what the whole site draws until each screen adds
 * `src/app/@foot/<its route>/page.tsx`. It is exactly the foot the layout
 * rendered before M6: `PageFoot`'s own defaults, which are the design's
 * generic `ISSUE 01 · 08 SEP 2026` and `NN`
 * (`access-1280.html`, `list-search-archive-1280.html:3419`).
 *
 * It is also the 404's foot: `not-found.tsx` matches the `children` slot and
 * leaves this one unmatched, and the design draws `ISSUE 01 · 08 SEP 2026`
 * there too.
 */
export default function DefaultFoot() {
  return <PageFoot />;
}
