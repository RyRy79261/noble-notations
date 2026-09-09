import type { Metadata } from 'next';

import { Breadcrumb } from '@/components/f/breadcrumb';
import { Notice } from '@/components/f/notice';
import { PageHead, PageHero } from '@/components/f/page-head';
import { SectionHead } from '@/components/f/section-label';
import { Table, TableGroup, TableRow } from '@/components/f/table-row';
import { listArchive, SECTION_LABELS } from '@/lib/archive';
import { Cardinal, cardinal, roman } from '@/lib/site';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Archive',
  description:
    'The frozen Markdown archive — every note as originally written, before the repository moved to a database.',
  alternates: { canonical: '/archive' },
};

/** `Main`. `list-search-archive-1280.html:3607`. */
const MAIN = cn(
  'flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12',
  'shell:gap-10 shell:px-15 shell:pt-8.5 shell:pb-18',
);

/**
 * `/archive` — §10.8, R-SCR-25, and `design/exports/png/ajY6O.png`.
 *
 * THE DESIGN DRAWS A RULED TABLE, NOT A CARD GRID. §10.8 says "a card grid
 * in groups by section"; `list-search-archive-1280.html:3719` draws
 * `F/Table row` — a reference, a name, the file path and a date, four
 * registers on one row height, under a section head and over a `f-hair-2`
 * hairline. R-BLD-03 makes the design win, and it is the right shape: every
 * row here holds the same four fields, so the reader scans a column.
 *
 * NO COLUMN HEAD. `/ingredients` draws one and this screen does not — the
 * group head already says what the column holds (`CONTENT/BILTONG · FOUR
 * NOTES`), and eleven rows do not need a legend.
 *
 * R-SCR-25 IS WHY THERE IS NO `safeRead` HERE. `listArchive` reads the
 * repository off disk. This screen is the one that still answers when the
 * database does not, and `DatabaseNotice` links to it for exactly that
 * reason, so it must not grow a query.
 *
 * THE DATE COLUMN IS EMPTY, and that is a gap in the DATA, not in the
 * build. The design draws `NOV 2024` against every row; the front matter of
 * the eleven files carries `title`, `kind`, `archived_from` and `summary`
 * and no date at all, and `git log` is not available to a built server.
 * Filling the column with the file's mtime would print the date of the
 * checkout, which is a different fact wearing the right shape. The slot is
 * dropped rather than guessed (R-STA-05) and the designer is owed either a
 * `written:` field in the eleven files or a column that says something else.
 */
export default async function ArchivePage() {
  const entries = await listArchive();

  const bySection = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = bySection.get(entry.section) ?? [];
    list.push(entry);
    bySection.set(entry.section, list);
  }

  // The reference runs 01 to 11 straight down the page rather than
  // restarting per section, which is what the design numbers: `05` is the
  // first row of the second group.
  let reference = 0;

  return (
    <>
      <PageHead
        left="NN · Archive"
        right={`${cardinal(entries.length)} source note${
          entries.length === 1 ? '' : 's'
        } · Frozen`}
      />

      <div className={MAIN}>
        <Breadcrumb items={[{ label: 'Archive' }, { label: 'All notes' }]} />

        <PageHero
          kicker="Section VI · Archive"
          title="Archive"
          lede={
            <>
              {/* A lede is running prose, so the count opens the sentence in
                  sentence case rather than the lower case every uppercased
                  slot takes. `Cardinal`, not `cardinal`. */}
              {Cardinal(entries.length)} note
              {entries.length === 1 ? '' : 's'} written before there was a
              catalogue: notebook pages, printouts and scraps that the recipes
              were read out of. They are kept exactly as they were found, under
              the path each file still has in the repository.
            </>
          }
          ledeClassName="shell:max-w-210"
        />

        <Notice title="The archive is frozen">
          Nothing on these pages is edited, reworded or tidied. Where the
          repository needed to correct something it was recorded as a new
          revision on the recipe, and the note it came from stayed as it was.
          That is what makes the two readable against each other.
        </Notice>

        {/* `role="table"` is what makes `F/Table row`'s `row` and `cell`
            roles legal, and it needs a name to be findable in a rotor. The
            `<section>` each group sits in carries no accessible name of its
            own, so it maps to `generic` and the ownership relation reads
            straight through it. */}
        <Table label="The archive, by section" className="gap-7 shell:gap-8">
          {[...bySection.entries()].map(([section, list], index) => (
            <section
              key={section}
              className="flex w-full shrink-0 flex-col items-start gap-section-360 shell:gap-2"
            >
              <SectionHead
                ordinal={roman(index + 1)}
                title={SECTION_LABELS[section] ?? section}
                meta={`content/${section} · ${cardinal(list.length)} note${
                  list.length === 1 ? '' : 's'
                }`}
              />
              <TableGroup>
                {list.map((entry) => {
                  reference += 1;
                  return (
                    <TableRow
                      key={entry.slug}
                      reference={String(reference).padStart(2, '0')}
                      name={entry.title}
                      href={`/archive/${entry.segments.join('/')}`}
                      /* The design draws the path the file has NOW —
                         `content/biltong/baumy-biltong.md` — and not
                         `archived_from`, which is where it lived before the
                         migration. The lede promises the first one. */
                      alias={`content/${entry.section}/${entry.slug}.md`}
                      aliasKind="path"
                    />
                  );
                })}
              </TableGroup>
            </section>
          ))}
        </Table>
      </div>
    </>
  );
}
