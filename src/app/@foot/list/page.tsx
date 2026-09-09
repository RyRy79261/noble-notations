import { PageFoot } from '@/components/f/page-foot';
import { cardinal } from '@/lib/site';

import { readShoppingList, selectionKey } from '../../list/shopping-list';
import { ISSUE_DATE } from '../issue';

function asArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * `/list`'s page foot — `COMPILED 08 SEP 2026 · TWENTY-SEVEN INGREDIENTS`
 * and `NN/LIST` (`list-search-archive-1280.html:2740`).
 *
 * The left slot names how much was compiled, so it has to see the same list
 * the screen does. `readShoppingList` is `cache()`d per request, so the
 * screen and this slot share one query rather than running two.
 *
 * The count is spelled, which is the design's rule for a foot and a section
 * meta — `cardinal` in `src/lib/site.ts` carries it.
 */
export default async function ListFoot({
  searchParams,
}: {
  searchParams: Promise<{ r?: string | string[] }>;
}) {
  const params = await searchParams;
  const { data: list } = await readShoppingList(
    selectionKey(asArray(params.r)),
  );
  const total = list?.totalEntries ?? 0;

  return (
    <PageFoot
      left={
        total > 0
          ? `Compiled ${ISSUE_DATE} · ${cardinal(total)} ingredient${total === 1 ? '' : 's'}`
          : `Compiled ${ISSUE_DATE}`
      }
      right="NN/LIST"
    />
  );
}
