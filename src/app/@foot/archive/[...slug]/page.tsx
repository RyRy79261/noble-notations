import { PageFoot } from '@/components/f/page-foot';
import { listArchive } from '@/lib/archive';

/**
 * An archived note's page foot — `NOTE FROZEN · AUGUST 2025` and
 * `NN/ARCHIVE/05` (`list-search-archive-1280.html:4779`).
 *
 * The right slot carries the note's number in the archive, which is the
 * same 01-to-11 running reference the index draws, so the two agree about
 * which note this is. The design's left slot names the month the note was
 * written; the eleven files carry no date in their front matter, so the
 * slot states what IS true of every one of them — the note is frozen — and
 * the date is left for the designer along with `/archive`'s date column.
 */
export default async function ArchiveNoteFoot({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const entries = await listArchive();
  const index = entries.findIndex(
    (entry) => entry.segments.join('/') === slug.join('/'),
  );

  return (
    <PageFoot
      left="Note frozen · As found"
      right={
        index === -1
          ? 'NN/ARCHIVE'
          : `NN/ARCHIVE/${String(index + 1).padStart(2, '0')}`
      }
    />
  );
}
