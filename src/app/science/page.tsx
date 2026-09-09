import type { Metadata } from 'next';
import Link from 'next/link';

import { listScienceIndex } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { KIND_LABELS, site } from '@/lib/site';
import { cn } from '@/lib/utils';
import { Band, numberWord } from '@/components/f/band';
import { FOCUS_RING } from '@/components/f/button';
import { Citation } from '@/components/f/citation';
import { Mechanism } from '@/components/f/mechanism';
import { Empty } from '@/components/f/notice';
import { PageHead, PageHero } from '@/components/f/page-head';
import { CardGrid, IndexCard } from '@/components/f/recipe-card';
import { Markdown } from '@/components/markdown';
import { DatabaseNotice } from '@/components/database-notice';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Science',
  description:
    'Why the methods work. Every mechanism from every recipe in one place, with the studies they come from and the notes around them.',
  alternates: { canonical: '/science' },
};

/**
 * `/science` — the index of mechanisms. `science-1280.html:29`, at 360 in
 * `m360-access-science.html:1538`. The pictures are
 * `design/exports/png/fnBa8.png`, `v5lV5v.png` and `T6AYZ.png`.
 *
 * THREE BANDS ON ONE SPINE, and the spine is the whole shape of the screen:
 * a 178px mono rail, a 764px column and a 130px right-hand note, 44px apart,
 * with no rule and no box between them. `F/Band` draws it and folds it at
 * 360. STUDIES is a two-up card row, MECHANISMS a 32px list of F/Mechanism,
 * FROM THE RECIPES a 24px list of F/Citation.
 *
 * WHAT M6 CHANGED, AND WHY. This screen carried M5.5's data inside M2's
 * markup — `.note`, `.badge num`, `.grid`, `.card`, the classes §9.4 lists
 * and R-CMP-16 tells a build not to carry forward. Two faults went with it,
 * both named in BUILD-PLAN §4.1:
 *
 *   1. The conditions drew as bordered pill badges at 11.52px. The design
 *      draws one 9px mono run in `f-ink-3`, its values joined by a middle
 *      dot. F/Mechanism has drawn it correctly since M4, with `aria-hidden`
 *      dots and real spaces so R-SCR-41 and R-CMP-14 both hold. This screen
 *      imports it rather than keeping a second, wrong copy.
 *   2. `.badge num` named two different things in one block — the mechanism
 *      code and a condition chip — so `e2e/science.spec.ts` could only tell
 *      them apart by DOM order, with `.first()`. Neither class exists here
 *      now: the code is F/Mechanism's `code` prop, a condition is a member
 *      of its `conditions` array, and the test reads `data-code` on the
 *      block.
 *
 * THE SOURCE LINE UNDER A MECHANISM IS A BUILD ADDITION. The design draws
 * the mechanisms as a flat list with no attribution, because its own mock
 * numbers them M1…M7 across the whole page. The build numbers them WITHIN
 * their recipe (D-05) — which is what makes the code here and the code on
 * `/science/[slug]` the same code, and it means two recipes' first
 * mechanisms are both M1. A flat list with two M1s in it and nothing saying
 * which is which cannot be read, and R-SCR-40 wants the link anyway. So each
 * block carries the source run F/Citation already draws,
 * `FROM · BEEF WELLINGTON`, aligned under the body column. It invents no
 * treatment and no colour.
 *
 * AND IT POINTS AT THE RECIPE. R-SCR-40 is "a science note MUST link back to
 * its RECIPE"; the first cut of this line went to `/science/<slug>`, the
 * study page already listed in the band above, which left the screen with no
 * link to either mechanism-bearing recipe at all. `/recipes/<slug>` is the
 * requirement; `FROM` is the design's own voice for the same relation on a
 * batch-log row (`SOURCE · Baumy Biltong`).
 */
export default async function SciencePage() {
  const { data, configured, failed } = await safeRead(listScienceIndex, {
    studies: [],
    mechanisms: [],
    research: [],
  });

  const empty =
    data.studies.length === 0 &&
    data.mechanisms.length === 0 &&
    data.research.length === 0;

  /* The kicker counts what the screen indexes. The design writes
     `SCIENCE · EIGHT` over a lede that names two studies and six notes, so
     the number is the sum of the two things the lede names — which is what
     this is, over a lede that names the two real ones. */
  const indexed = data.studies.length + data.mechanisms.length;

  return (
    <>
      <PageHead
        left="NN-00-02 · Index of mechanisms"
        leftNarrow="NN-00-02 · Index"
        right={site.issue}
      />

      {/* `Main`, the screen without a breadcrumb: 40/60/72/60 at 1280 and
          22/16/48/16 at 360, 44px and 28px of band gap. The same frame
          `src/app/recipes/[slug]/page.tsx:69` writes. */}
      <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:gap-11 shell:px-15 shell:pt-10 shell:pb-18">
        <PageHero
          /* R-STA-01 and R-STA-02: with nothing read there is nothing to
             count, and `SCIENCE · ZERO` would state a fact about the
             catalogue that the page has no grounds for. */
          kicker={
            configured && !failed && !empty
              ? `Science · ${numberWord(indexed)}`
              : 'Science'
          }
          kickerForm="mark"
          title="Science"
          /* 740px — `science-1280.html`, `data-pencil-name="Lede"`. Without
             it the lede runs the full 1160px column. */
          ledeClassName="shell:max-w-185"
          lede={
            <>
              Why things work, kept apart from what to do.{' '}
              {configured && !failed && !empty ? (
                <>
                  {/* This count opens a sentence, and a lede is the one slot
                      in the system that is not uppercased by CSS. `count`
                      returns the lower-case word every meta and kicker
                      wants; here it is sentence case. */}
                  {sentenceCase(
                    count(
                      data.studies.length,
                      'long-form study',
                      'long-form studies',
                    ),
                  )}{' '}
                  and {count(data.mechanisms.length, 'mechanism', 'mechanisms')}{' '}
                  lifted out of the recipes that provoked them.{' '}
                </>
              ) : null}
              A mechanism is written down once and referenced from every method
              that leans on it, so a correction lands in one place.
            </>
          }
        />

        {!configured || failed ? (
          <DatabaseNotice failed={failed} />
        ) : empty ? (
          /* R-SCR-43. One sentence, not three empty bands. */
          <Empty>
            No recipe has a science note yet. Add one to a recipe and it shows
            here.
          </Empty>
        ) : (
          <>
            <Band label="Studies" meta={bandMeta(data.studies.length)}>
              {data.studies.length === 0 ? (
                <Empty>
                  No study yet. A study is a recipe of the research kind, which
                  holds the reasoning rather than the steps, or any recipe that
                  carries a mechanism.
                </Empty>
              ) : (
                /* Two cells to a row, not three: the 130px right margin takes
                   the third column's width. `CardGrid` draws explicit rows
                   rather than a CSS grid, so an odd last card spans its row
                   the way the design draws it on `/recipes`. */
                <CardGrid columns={2}>
                  {data.studies.map((study) => (
                    <IndexCard
                      key={study.slug}
                      kicker={`Study · ${KIND_LABELS[study.kind] ?? study.kind}`}
                      title={study.title}
                      href={`/science/${study.slug}`}
                      description={study.summary ?? undefined}
                      meta={
                        study.mechanismCount === 0
                          ? 'No mechanism yet'
                          : count(
                              study.mechanismCount,
                              'mechanism',
                              'mechanisms',
                            )
                      }
                    />
                  ))}
                </CardGrid>
              )}
            </Band>

            <Band
              label="Mechanisms"
              meta={bandMeta(data.mechanisms.length)}
              gap="mechanism"
            >
              {data.mechanisms.length === 0 ? (
                /* R-SCR-43 again: the studies can be there before any of them
                   carries a mechanism. */
                <Empty>No recipe has a science note yet.</Empty>
              ) : (
                data.mechanisms.map((mechanism) => (
                  <div
                    key={mechanism.id}
                    className="flex w-full flex-col items-start gap-2"
                  >
                    {/* `data-kind` and `data-code` are the two hooks that say
                        what this block is. `notes.tsx` already carries
                        `data-kind` for the same reason, and `data-code` is
                        what replaces `.badge num` for the test: the code is a
                        property of the block, not the first badge inside it. */}
                    <Mechanism
                      data-kind="science"
                      data-code={mechanism.code}
                      code={mechanism.code}
                      name={mechanism.title}
                      conditions={mechanism.conditions}
                    >
                      <Markdown tone="inherit">{mechanism.body}</Markdown>
                    </Mechanism>
                    {/* R-SCR-40 — "a science note MUST link back to its
                        recipe", and this is the link. It went to
                        `/science/<slug>`, which is the study page listed in
                        the band above, so nine mechanisms across two recipes
                        left the screen with no link to either recipe at all.
                        The recipe title is also the answer to two M1s in one
                        list: two recipes both number their first mechanism
                        M1, and the attribution says which is which.

                        The design draws no attribution under a mechanism —
                        `science-1280.html:332` is code, name, text and
                        conditions and nothing else — so the indent is the
                        code column plus the row gap: 26 + 12 at 360, 34 + 16
                        at 1280. The dot is `aria-hidden` and the spaces are
                        not, exactly as F/Mechanism writes its conditions
                        run — R-CMP-14. */}
                    <Link
                      href={`/recipes/${mechanism.recipeSlug}`}
                      className={cn(
                        'pl-9.5 shell:pl-12.5',
                        'text-09 leading-170 font-mono tracking-label uppercase text-ink-3 no-underline',
                        FOCUS_RING,
                      )}
                    >
                      From <span aria-hidden="true">·</span>{' '}
                      {mechanism.recipeTitle}
                    </Link>
                  </div>
                ))
              )}
            </Band>

            <Band
              label="From the recipes"
              meta={bandMeta(data.research.length)}
              gap="citation"
            >
              {data.research.length === 0 ? (
                /* R-STA-03. The design names three bands on this screen, so
                   the third says it is empty rather than disappearing and
                   leaving the reader to wonder whether it exists. */
                <Empty>No recipe carries a research note yet.</Empty>
              ) : (
                data.research.map((note) => (
                  <Citation
                    key={note.id}
                    code={note.code}
                    title={note.title ?? note.recipeTitle}
                    href={`/recipes/${note.recipeSlug}`}
                    source={[note.recipeTitle, 'Research']}
                  />
                ))
              )}
            </Band>
          </>
        )}
      </div>
    </>
  );
}

/**
 * A band's right-hand note. The count in words, or `NONE YET` for a band
 * that is drawn and holds nothing — the design's own wording on `/recipes`'
 * empty PROCESS band.
 */
function bandMeta(total: number): string {
  return total === 0 ? 'None yet' : numberWord(total);
}

/** The same count where a noun has to agree with it. */
function count(total: number, one: string, many: string): string {
  return `${numberWord(total)} ${total === 1 ? one : many}`;
}

/** The first letter, for the one use of `count` that opens a sentence. */
function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
