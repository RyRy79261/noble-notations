import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumb } from '@/components/f/breadcrumb';
import { IngredientRow } from '@/components/f/ingredient-row';
import { Notice } from '@/components/f/notice';
import { PageHead, PageHero } from '@/components/f/page-head';
import { SectionHead } from '@/components/f/section-label';
import { Measure } from '@/components/f/stat';
import { getArchiveDocument, listArchive, SECTION_LABELS } from '@/lib/archive';
import { formatQuantity } from '@/lib/domain/units';
import { getRecipeBySlug } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { cardinal, revisionOrdinal } from '@/lib/site';
import { cn } from '@/lib/utils';

type Params = { params: Promise<{ slug: string[] }> };

/*
 * THIS ROUTE USED TO BE PRERENDERED, and it stops being so here.
 *
 * The right-hand column reads the recipe the note was read into, and a
 * prerendered page would bake whatever the database said at BUILD time —
 * which is "nothing at all" on a build with no `DATABASE_URL` and a snapshot
 * of the current revision on one that has it, so the same commit would
 * deploy two different pages. The note itself is still read off disk at
 * every render, so R-SCR-25 is untouched: with no database this screen draws
 * the note, the path and the breadcrumb and simply omits the reading.
 */
export const dynamic = 'force-dynamic';

/** `Main`. `list-search-archive-1280.html:4314`. */
const MAIN = cn(
  'flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12',
  'shell:gap-10 shell:px-15 shell:pt-8.5 shell:pb-18',
);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getArchiveDocument(slug);
  if (!doc) return { title: 'Not found' };

  return {
    title: doc.title,
    description: doc.summary || undefined,
    alternates: { canonical: `/archive/${doc.segments.join('/')}` },
    openGraph: {
      type: 'article',
      title: doc.title,
      description: doc.summary || undefined,
      url: `/archive/${doc.segments.join('/')}`,
    },
  };
}

/**
 * One archived note — §10.8, R-SCR-25, `design/exports/png/wMFtz.png`.
 *
 * TWO COLUMNS, AND THE POINT IS THE COMPARISON. The design puts the file
 * exactly as it was found in a 560px `f-desk` panel on the left, and on the
 * right the ingredients the repository read out of it, so the reading can be
 * checked against the words that produced it. `VERBATIM` is the left
 * column's meta and it is meant literally: the panel holds the Markdown
 * SOURCE at 12 over 22 in the mono face, line breaks and hyphens and all —
 * not the source rendered into headings and lists. Rendering it would be an
 * edit, and this screen exists to prove that nothing was edited.
 *
 * THE RIGHT COLUMN IS THE ONLY PART THAT NEEDS THE DATABASE, and it is the
 * only part allowed to. R-SCR-25 says the archive must work with none: the
 * note, its path, the breadcrumb and the whole left column are read off
 * disk. The reading is found by slug — `content/recipes/pickled-jalapenos.md`
 * against the recipe `pickled-jalapenos`, which is the convention the ingest
 * already follows — and when there is no such recipe, or no database, the
 * column is simply not drawn. `safeRead` is what makes that a branch rather
 * than a stack trace.
 *
 * THE `WRITTEN` MEASURE IS NOT DRAWN, for the same reason the date column on
 * `/archive` is empty: the eleven files carry no date in their front matter.
 * `EDITED SINCE never` is drawn, because that one is true by policy rather
 * than by data — the archive is frozen, and D-03 and §10.8 both say so.
 */
export default async function ArchiveDocumentPage({ params }: Params) {
  const { slug } = await params;
  const doc = await getArchiveDocument(slug);
  if (!doc) notFound();

  const entries = await listArchive();
  const index = entries.findIndex((entry) => entry.slug === doc.slug);
  const reference =
    index === -1 ? undefined : String(index + 1).padStart(2, '0');

  const { data: recipe } = await safeRead(
    () => getRecipeBySlug(doc.slug),
    null,
  );
  const lines = recipe?.ingredients ?? [];

  const path = `content/${doc.section}/${doc.slug}.md`;
  const sectionLabel = SECTION_LABELS[doc.section] ?? doc.section;

  return (
    <>
      <PageHead
        left={`NN · Archive${reference ? ` · Note ${reference}` : ''}`}
        right="As found · Not edited"
      />

      <div className={MAIN}>
        <Breadcrumb
          items={[
            { label: 'Archive', href: '/archive' },
            { label: sectionLabel },
            { label: doc.title },
          ]}
        />

        <PageHero
          kicker="Section VI · Archive"
          title={doc.title}
          lede={
            lines.length > 0
              ? `The note exactly as it was found, and beside it the ${cardinal(lines.length)} ingredient${lines.length === 1 ? '' : 's'} the repository read out of it. Both are printed together so the reading can be checked against the words that produced it.`
              : (doc.summary ??
                'The note exactly as it was found, kept under the path it still has in the repository.')
          }
          ledeClassName="shell:max-w-210"
        />

        {/* The provenance row. A `f-desk` block of stacked label/value pairs
            at 360 and a bare inline run at 1280 — `F/Measure`'s wrapping
            form at both, because a file path set `nowrap` is what pushes a
            360 page sideways (R-STA-09, R-ACC-11). */}
        <div
          className={cn(
            'flex w-full shrink-0 flex-col items-start gap-2 bg-desk px-3.5 py-3.25',
            'shell:flex-row shell:flex-wrap shell:items-center shell:gap-8 shell:bg-transparent shell:p-0',
          )}
        >
          <Measure wrap label="Path" value={path} className="shell:w-auto" />
          {doc.archivedFrom ? (
            <Measure
              wrap
              label="Archived from"
              value={doc.archivedFrom}
              className="shell:w-auto"
            />
          ) : null}
          <Measure
            wrap
            label="Edited since"
            value="never"
            className="shell:w-auto"
          />
          {recipe ? (
            <Measure
              wrap
              label="Read into"
              value={`${recipe.title} · ${revisionOrdinal(recipe.revisionNumber) ?? 'current revision'}`}
              className="shell:w-auto"
            />
          ) : null}
        </div>

        <div
          className={cn(
            'flex w-full shrink-0 flex-col items-start gap-7',
            'shell:flex-row shell:items-start shell:gap-11',
          )}
        >
          <section
            className={cn(
              'flex w-full shrink-0 flex-col items-start gap-section-360',
              'shell:w-140 shell:gap-2',
            )}
          >
            <SectionHead ordinal="I" title="The note" meta="Verbatim" />
            <div
              className={cn(
                'flex w-full shrink-0 flex-col items-start gap-3 bg-desk px-3.5 py-4',
                'shell:px-5.5 shell:py-5',
              )}
            >
              <span className="text-09 font-mono tracking-label uppercase text-ink-3">
                {path}
              </span>
              <span
                aria-hidden="true"
                className="h-px w-full shrink-0 bg-hair"
              />
              {/* `whitespace-pre-wrap` is the whole mechanism: the file is
                  printed with its own line breaks and nothing else. The size
                  and its leading travel in ONE argument — TOKEN-MAP §4.3.

                  `wrap-anywhere` is the note that a frozen archive cannot be
                  reflowed to fit. `content/research/demi-glace.md` carries a
                  125-character bare URL with no break opportunity in it: at
                  360 it ran 168px past the panel and at 1280 30px past it,
                  and the shell's `overflow-x-clip` (R-STA-09) turned that
                  overflow into characters no scroll could reach. The panel
                  is not a table, so R-STA-08's scroller is the wrong answer
                  here — the words have to break. Nothing is reworded; only
                  the line the browser chooses changes. */}
              <pre
                className={cn(
                  'm-0 w-full text-10 leading-180 shell:text-12 shell:leading-180',
                  'font-mono wrap-anywhere whitespace-pre-wrap text-ink',
                )}
              >
                {doc.body.trim()}
              </pre>
            </div>
          </section>

          {lines.length > 0 ? (
            <section className="flex w-full min-w-0 shrink-0 flex-col items-start gap-section-360 shell:flex-1 shell:basis-0 shell:gap-2">
              <SectionHead
                ordinal="II"
                title="As the repository read it"
                meta={`${cardinal(lines.length)} ingredient${lines.length === 1 ? '' : 's'}`}
              />
              <div
                role="list"
                className="flex w-full flex-col items-start gap-0"
              >
                {lines.map((line, position) => {
                  const amount = formatQuantity(
                    line.quantity,
                    line.quantityMax,
                  );
                  const name = line.ingredient?.name ?? line.rawText;
                  return (
                    <IngredientRow
                      key={line.id}
                      role="listitem"
                      reference={String(position + 1).padStart(2, '0')}
                      /* R-SCR-20's word, in the quiet ink, because it is not
                         a measurement and must not read as one. */
                      amount={
                        amount ?? <span className="text-ink-3">some</span>
                      }
                      unit={amount ? line.unit : undefined}
                      name={name}
                      href={
                        line.ingredient
                          ? `/ingredients/${line.ingredient.slug}`
                          : undefined
                      }
                      preparation={line.preparation ?? undefined}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>

        {/* The closing notice, `list-search-archive-1280.html:5027` and the
            last block of `png/wMFtz.png`. It is fixed copy about how a
            transcription works and it needs no data, so it was simply
            missing rather than dropped for cause.

            It is drawn only where there IS a right-hand column: every
            sentence in it is a claim about that column, and a note the
            repository has read nothing out of has none. */}
        {lines.length > 0 ? (
          <Notice title="The transcription changed no wording">
            Reading a note into the repository adds numbers beside it; it does
            not rewrite it. Every name on the right is the word the note used,
            and where the note gave no quantity the amount reads
            &ldquo;some&rdquo; rather than a figure someone guessed. Lines that
            were only prose stayed prose: nothing was invented to fill a column.
          </Notice>
        ) : null}
      </div>
    </>
  );
}
