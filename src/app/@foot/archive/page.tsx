import { PageFoot } from '@/components/f/page-foot';
import { listArchive } from '@/lib/archive';
import { cardinal } from '@/lib/site';

import { ISSUE_DATE } from '../issue';

/**
 * `/archive`'s page foot — `FROZEN 08 SEP 2026 · ELEVEN NOTES` and
 * `NN/ARCHIVE` (`list-search-archive-1280.html:4091`).
 *
 * `listArchive` is eleven small file reads and no query, which is the whole
 * reason this screen still answers when the database does not (R-SCR-25).
 * Counting them again here costs nothing that matters and keeps the foot
 * honest about a directory that grows.
 */
export default async function ArchiveFoot() {
  const entries = await listArchive();

  return (
    <PageFoot
      left={`Frozen ${ISSUE_DATE} · ${cardinal(entries.length)} note${
        entries.length === 1 ? '' : 's'
      }`}
      right="NN/ARCHIVE"
    />
  );
}
