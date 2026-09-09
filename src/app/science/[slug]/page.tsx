import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { getScienceStudy } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { KIND_LABELS, revisionOrdinal } from '@/lib/site';
import { Band, numberWord } from '@/components/f/band';
import { Citation } from '@/components/f/citation';
import { Mechanism } from '@/components/f/mechanism';
import { Empty } from '@/components/f/notice';
import { PageHead, PageHero } from '@/components/f/page-head';
import { CardGrid, IndexCard } from '@/components/f/recipe-card';
import { Markdown } from '@/components/markdown';
import { DatabaseNotice } from '@/components/database-notice';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/**
 * One study — `/science/[slug]`. `science-1280.html:806`, at 360 in
 * `m360-access-science.html:2240`. The pictures are
 * `design/exports/png/hHOhn.png`, `JqQl4.png` and `vcSM5.png`.
 *
 * The slug is a **recipe** slug. A study is a recipe of the research kind,
 * or any recipe that carries a mechanism, so this address and
 * `/recipes/[slug]` name the same thing seen two ways: the reasoning here,
 * the method there. `getScienceStudy` returns null for a recipe that is
 * neither, which keeps `/science/tomato-soup` a 404 rather than a second
 * thin address for a dish.
 *
 * FOUR BANDS ON THE SAME SPINE the index uses. The design draws five —
 * MECHANISMS, STAGED REDUCTION, APPLIED IN, REFERENCES — and STAGED
 * REDUCTION is not built. It is a five-column table of a demi-glace
 * reduction's duration, temperature, volume loss and key addition, and the
 * schema holds none of those four: the archive carries them in a Markdown
 * table inside a research note (`content/research/demi-glace.md:63-67`) and
 * the seeded recipe carries them as three ordinary steps. Drawing it would
 * mean either inventing a table on the notes schema or parsing prose, and
 * D-12 is the standing ruling on exactly this shape of gap: the design draws
 * structured data the schema does not hold, so it is recorded rather than
 * faked. THE METHOD is the band that is built and the design does not draw,
 * and R-SCR-40 is why — see below.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await safeRead(() => getScienceStudy(slug), null);
  if (!data) return { title: 'Study not found' };

  const description =
    data.summary ??
    `The science of ${data.title}: ${data.mechanisms.length} mechanisms and the sources behind them.`;

  return {
    title: data.title,
    description,
    alternates: { canonical: `/science/${slug}` },
    openGraph: {
      type: 'article',
      title: data.title,
      description,
      url: `/science/${slug}`,
    },
  };
}

export default async function ScienceStudyPage({ params }: Params) {
  const { slug } = await params;
  const { data, configured, failed } = await safeRead(
    () => getScienceStudy(slug),
    null,
  );

  if (!configured || failed) {
    /* R-STA-01 and R-STA-02. The document kicker still names the screen a
       reader asked for, so the notice arrives on a page and not on a blank.
       The same shape as `src/app/recipes/[slug]/page.tsx:58`. */
    return (
      <>
        <PageHead
          left={`NN-SC · ${slug}`}
          leftNarrow={slug}
          right="Unavailable"
        />
        <Main>
          <PageHero kicker="Science · Study" kickerForm="mark" title={slug} />
          <DatabaseNotice failed={failed} />
        </Main>
      </>
    );
  }
  if (!data) notFound();

  const mechanisms = data.mechanisms.length;

  return (
    <>
      <PageHead
        left={`NN-SC · ${data.title}`}
        leftNarrow={`NN-SC · ${data.slug}`}
        right={
          mechanisms === 0
            ? 'Study · no mechanism yet'
            : `Study · ${numberWord(mechanisms)} ${
                mechanisms === 1 ? 'mechanism' : 'mechanisms'
              }`
        }
        rightNarrow="Study"
      />

      <Main>
        <PageHero
          kicker="Science · Study"
          kickerForm="mark"
          title={data.title}
          /* 740px — `science-1280.html`, `data-pencil-name="Lede"`. Without
             it a one-line summary runs the full 1160px column where the
             design wraps it to two. */
          ledeClassName="shell:max-w-185"
          lede={data.summary ?? data.subtitle ?? undefined}
        />

        <Band
          label="Mechanisms"
          meta={mechanisms === 0 ? 'None yet' : numberWord(mechanisms)}
          gap="mechanism"
        >
          {mechanisms === 0 ? (
            <Empty>This study has no mechanism yet.</Empty>
          ) : (
            data.mechanisms.map((mechanism) => (
              /* `data-kind` and `data-code` are the two hooks that say what
                 this block is; `.badge num` used to name both the code and a
                 condition chip, which is the clash BUILD-PLAN §4.1 gives M6.
                 The code is a prop and a condition is a member of an array,
                 so nothing here names two things at once. */
              <Mechanism
                key={mechanism.id}
                data-kind="science"
                data-code={mechanism.code}
                code={mechanism.code}
                name={mechanism.title}
                conditions={mechanism.conditions}
              >
                <Markdown tone="inherit">{mechanism.body}</Markdown>
              </Mechanism>
            ))
          )}
        </Band>

        {/*
         * R-SCR-40 — a science note must link back to its recipe.
         *
         * The design draws no band for this, because in its mock the study
         * and the recipe are two different records: "Crafting Michelin-Star
         * Demi-Glace" is the study and "Demi-Glace" is the recipe that
         * applies it, so the link falls out of APPLIED IN. In the build they
         * are ONE record read two ways (D-05), so `appliedIn` holds the
         * recipes that lean on this study and never the study's own — on
         * demi-glace it holds the Wellington, and on the Wellington it is
         * empty. Without this band a study would satisfy R-SCR-40 only by
         * accident, whenever something happened to link to it.
         *
         * It is the design's own APPLIED IN card, one band earlier, with the
         * kicker naming what the card is.
         */}
        <Band label="The method" meta="One recipe">
          <IndexCard
            kicker={KIND_LABELS[data.kind] ?? data.kind}
            title={data.title}
            href={`/recipes/${data.slug}`}
            description="The same record, read as a method. This page holds the reasoning; that one holds what to do."
          />
        </Band>

        <Band
          label="Applied in"
          meta={
            data.appliedIn.length === 0
              ? 'None yet'
              : `${numberWord(data.appliedIn.length)} ${
                  data.appliedIn.length === 1 ? 'recipe' : 'recipes'
                }`
          }
        >
          {data.appliedIn.length === 0 ? (
            /* R-STA-03. The design draws this band on the study artboard, so
               it says it is empty rather than vanishing. */
            <Empty>No recipe leans on this study yet.</Empty>
          ) : (
            <CardGrid columns={2}>
              {data.appliedIn.map((recipe) => (
                <IndexCard
                  key={recipe.slug}
                  kicker={KIND_LABELS[recipe.kind] ?? recipe.kind}
                  title={recipe.title}
                  href={`/recipes/${recipe.slug}`}
                  description={recipe.summary ?? recipe.subtitle ?? undefined}
                  meta={revisionOrdinal(recipe.revisionNumber)}
                />
              ))}
            </CardGrid>
          )}
        </Band>

        <Band
          label="References"
          meta={
            data.citations.length === 0
              ? 'None yet'
              : numberWord(data.citations.length)
          }
        >
          {/* R-SCR-42: the work, the part of it, and the date a person read
              it. F/Citation carries the fallback chain — a citation with no
              work falls back to its part, then to its address — so a source
              is never an empty serif line. */}
          {data.citations.length === 0 ? (
            <Empty>No source is recorded for this study yet.</Empty>
          ) : (
            data.citations.map((citation) => (
              <Citation
                key={citation.code}
                code={citation.code}
                work={citation.work}
                part={citation.part}
                accessedAt={citation.accessedAt}
                url={citation.url}
              />
            ))
          )}
        </Band>
      </Main>
    </>
  );
}

/**
 * `Main` — the screen without a breadcrumb: 40/60/72/60 and `gap-[ 44px ]`
 * at 1280, 22/16/48/16 and `gap-[ 28px ]` at 360.
 */
function Main({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:gap-11 shell:px-15 shell:pt-10 shell:pb-18">
      {children}
    </div>
  );
}
