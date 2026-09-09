/**
 * `/` — the master index. §10.1, and `design/exports/png/iflq9.png`.
 *
 * THE DESIGN DRAWS THIS AS A DOCUMENT, NOT AS A STACK OF CARDS. The whole
 * screen is a masthead over five bands, and a band is one flex row: a 178px
 * mono label in the left margin, a 764px content column, and a 130px
 * right-aligned note counting what is in the band. There is no card, no
 * box, no fill and no rule anywhere on this page — 44px of air is what
 * separates one band from the next. `src/components/f/band.tsx` is that
 * shape; this file only decides what goes in each one.
 *
 *   Masthead          A COOKING DATA REPOSITORY / Noble Notations / lede /
 *                     two controls
 *   CONTENTS          six counts             SIX MEASURES
 *   RECENTLY WORKED   six recipe cards       SIX
 *   CLASSIFICATION    a row per facet        NINE GROUPS · 34 TAGS
 *   SCIENCE           two study cards        TWO STUDIES · SEVEN MECHANISMS
 *   HOW THIS WORKS    four columns, I to IV  FOUR
 *
 * THE RIGHT-HAND NOTE IS NOT DECORATION. It is the count of the things in
 * that band, spelled in words, and it comes from the same read that fills
 * the band — so a band that draws four cards cannot say SIX. `numberWord`
 * in `f/band.tsx` is the design's spelling rule, numeral and all.
 *
 * §10.1's five blocks are all here. The design adds a sixth, SCIENCE, which
 * §10.1 predates; BUILD-PLAN §2 makes the design the source of truth for
 * how a screen reads, the same way D-07 settled the page foot's copy.
 *
 * R-SCR-01: RECENTLY WORKED and CLASSIFICATION are ABSENT when they have
 * nothing in them — not drawn empty. SCIENCE follows them for the same
 * reason.
 * R-SCR-02: the CONTENTS band's body is the database notice when there is
 * no database. The band, its rail and the masthead above it still draw, so
 * the notice arrives on a page and not on a blank (R-STA-01).
 *
 * A server component. Every read goes through `src/lib/queries/`.
 */

import Link from 'next/link';

import { Band, numberWord } from '@/components/f/band';
import { buttonClasses } from '@/components/f/button';
import { PageHead, PageHero } from '@/components/f/page-head';
import { CardGrid, IndexCard } from '@/components/f/recipe-card';
import { Stat } from '@/components/f/stat';
import { TagCTA } from '@/components/f/tag';
import { DatabaseNotice } from '@/components/database-notice';
import { RecipeGrid } from '@/components/recipe-card';
import { termHref } from '@/components/tags';
import { getStats, listCategories, listRecipes } from '@/lib/queries/read';
import type { TermWithCount } from '@/lib/queries/read';
import { listScienceIndex } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { CATEGORY_TYPE_LABELS, roman, site } from '@/lib/site';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/* The design's `Main`: 40/60/72/60 at 1280 with 44px between the bands,
   22/16/48/16 at 360 with 28px. There is no breadcrumb on this screen, so
   the top padding is 40 and not the 34 a breadcrumbed index takes. */
const MAIN = cn(
  'flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12',
  'shell:gap-11 shell:px-15 shell:pt-10 shell:pb-18',
);

/** The design's lede measure on this screen, `w-[780px]`. See `PageHero`. */
const LEDE = 'shell:max-w-195';

/** §10.1 block 4: "Each block shows up to 14 terms." */
const TERMS_IN_A_FACET = 14;

/**
 * §10.1 block 5, in the design's words and its order
 * (`home-recipes-1280.html:1607`). Four columns numbered I to IV — the
 * numerals are `roman()` rather than four literals, so the band and
 * F/Section label spell an ordinal the same way.
 */
const HOW_THIS_WORKS = [
  {
    title: 'A dish has a name',
    body: 'The name never changes. The ingredients and the steps belong to a revision, not to the dish.',
  },
  {
    title: 'You add, never edit',
    body: 'A revision cannot be altered once it is made. To improve a dish you add one on top.',
  },
  {
    title: 'Every revision says why',
    body: 'Beside each is a sentence describing what the dish became — the part a cook can act on.',
  },
  {
    title: 'Agents read and write it',
    body: 'A connector, /llms.txt and .md routes let an agent search the repository and add revisions to it.',
  },
] as const;

export default async function HomePage() {
  const [stats, recent, categories, science] = await Promise.all([
    safeRead(getStats, {
      recipes: 0,
      revisions: 0,
      ingredients: 0,
      terms: 0,
      notes: 0,
      experiments: 0,
    }),
    safeRead(() => listRecipes({ limit: 6 }), []),
    safeRead(() => listCategories(), []),
    safeRead(listScienceIndex, {
      studies: [],
      mechanisms: [],
      research: [],
    }),
  ]);

  /* Grouped in the order `listCategories` returns them, which is by how many
     recipes carry the facet's busiest term. The design draws CUISINE first
     and TEXTURE last, which is that order on the seeded data; hard-coding a
     facet order here would put an empty group above a full one on any other
     repository. */
  const byFacet = new Map<string, TermWithCount[]>();
  for (const term of categories.data) {
    const list = byFacet.get(term.categoryType) ?? [];
    list.push(term);
    byFacet.set(term.categoryType, list);
  }

  const statsUnavailable = !stats.configured || stats.failed;

  return (
    <>
      <PageHead
        left="NN-00-00 · Master index"
        leftNarrow="NN-00-00"
        right={site.issue}
      />

      <div className={MAIN}>
        <PageHero
          size="display"
          kicker={site.tagline}
          title={site.name}
          lede="A structured repository of recipes, ingredients, techniques and batch logs. The name of a dish never changes. Its ingredients and steps belong to a revision, and a revision cannot be altered once it is made — to improve a dish you add one on top and write down what changed and why."
          ledeClassName={LEDE}
        >
          {/* `Actions`, `flex-row gap-[16px]` at 1280 and `gap-[8px]` at 360.
              One filled control and one hairline: F/Button's caption is the
              rule — "One filled control per view. Everything else is a
              hairline or nothing at all." The design's 360 frame fills both,
              which is the one place it contradicts its own plate.

              The two wordings are the design's own — SEARCH THE REPOSITORY
              and ALL RECIPES at 1280, SEARCH and BROWSE at 360. They are two
              spans inside one link rather than two links, so the tab order
              holds one control at every width and `display:none` keeps the
              hidden wording out of the accessible name. */}
          <div className="flex h-fit w-full shrink-0 flex-row flex-wrap items-center gap-2 shell:w-fit shell:gap-4">
            <Link href="/search" className={buttonClasses('primary')}>
              <span className="shell:hidden">Search</span>
              <span className="hidden shell:inline">Search the repository</span>
            </Link>
            <Link href="/recipes" className={buttonClasses('quiet')}>
              <span className="shell:hidden">Browse</span>
              <span className="hidden shell:inline">All recipes</span>
            </Link>
          </div>
        </PageHero>

        {/* ── CONTENTS ───────────────────────────────────────────────── */}
        <Band
          label="Contents"
          meta={statsUnavailable ? 'Unavailable' : 'Six measures'}
        >
          {statsUnavailable ? (
            /* R-SCR-02. The notice replaces the six figures and nothing
               else: the band, the rail and everything below it still
               draw. */
            <DatabaseNotice failed={stats.failed} />
          ) : (
            /* Three to a row at 1280, two at 360 — `Row 1` and `Row 2`,
               `gap-[24px]` across and `gap-[28px]` down, halving to 16px on
               both axes at 360. A grid rather than explicit rows because six
               cells divide evenly by both counts, so there is no last row to
               span; the card grids on this page are explicit rows for the
               opposite reason (C-06).

               The figure is 26px here and 19px at 360, which is what F/Stat
               calls `xl` and `lg`. `xl` exists for this ledger and for
               nothing else in the system. */
            <div className="grid w-full grid-cols-2 gap-x-4 gap-y-4 shell:grid-cols-3 shell:gap-x-6 shell:gap-y-7">
              <Stat
                label="Recipes"
                value={stats.data.recipes}
                size="xl"
                sizeNarrow="lg"
              />
              <Stat
                label="Revisions"
                value={stats.data.revisions}
                size="xl"
                sizeNarrow="lg"
              />
              <Stat
                label="Ingredients"
                value={stats.data.ingredients}
                size="xl"
                sizeNarrow="lg"
              />
              <Stat
                label="Tags"
                value={stats.data.terms}
                size="xl"
                sizeNarrow="lg"
              />
              <Stat
                label="Notes"
                value={stats.data.notes}
                size="xl"
                sizeNarrow="lg"
              />
              <Stat
                label="Batch logs"
                value={stats.data.experiments}
                size="xl"
                sizeNarrow="lg"
              />
            </div>
          )}
        </Band>

        {/* ── RECENTLY WORKED ────────────────────────────────────────── */}
        {recent.data.length > 0 ? (
          <Band label="Recently worked" meta={numberWord(recent.data.length)}>
            {/* Three to a row. `CardGrid` draws explicit rows, so a last row
                holding one card spans the whole column — C-06, and visible on
                `/recipes`. At 360 the cards stack and the card itself drops
                its summary and its tags. */}
            <RecipeGrid recipes={recent.data} columns={3} />

            {/* Rule 5 of the 360 fold: a band may gain a trailing control
                that 1280 does not draw, because at 1280 the same affordance
                is in the masthead and in the rail. `m360-core.html:514`. */}
            <Link
              href="/recipes"
              className={buttonClasses('primary', 'shell:hidden')}
            >
              All recipes
            </Link>
          </Band>
        ) : null}

        {/* ── CLASSIFICATION ─────────────────────────────────────────── */}
        {byFacet.size > 0 ? (
          <Band
            label="Classification"
            meta={`${numberWord(byFacet.size)} groups · ${numberWord(categories.data.length)} tags`}
          >
            {[...byFacet.entries()].map(([facet, terms]) => (
              /* A second, quieter spine inside the band: a 126px mono label
                 in `f-ink-3` and a wrapping row of pills, `gap-[24px]` apart
                 with 4px of vertical padding. At 360 it folds into a label
                 over the row, exactly as the outer band does. */
              <div
                key={facet}
                className={cn(
                  'flex h-fit w-full shrink-0 flex-col items-start gap-2',
                  'shell:flex-row shell:items-start shell:gap-6 shell:py-1',
                )}
              >
                <h3
                  className={cn(
                    'm-0 shrink-0',
                    'text-09 leading-normal font-mono font-normal tracking-label uppercase text-ink-3',
                    'shell:w-31.5 shell:tracking-spine',
                    'shell:text-09 shell:leading-180',
                  )}
                >
                  {CATEGORY_TYPE_LABELS[facet] ?? facet}
                </h3>
                {/* F/Tag CTA — the one rounded thing in the system, and the
                    only place `f-cta-line` is legal (TOKEN-MAP §7). It is NOT
                    the `/classes` pill, which is square, has no outline and
                    sets its name in 13px Geist. */}
                <div className="flex h-fit w-full flex-row flex-wrap items-center gap-2 shell:w-auto shell:flex-1 shell:gap-3">
                  {terms.slice(0, TERMS_IN_A_FACET).map((term) => (
                    <TagCTA
                      key={term.id}
                      name={term.label}
                      count={term.recipeCount}
                      href={termHref(term)}
                    />
                  ))}
                </div>
              </div>
            ))}

            <Link
              href="/classes"
              className={buttonClasses('primary', 'shell:hidden')}
            >
              All tags
            </Link>
          </Band>
        ) : null}

        {/* ── SCIENCE ────────────────────────────────────────────────── */}
        {science.data.studies.length > 0 ? (
          <Band
            label="Science"
            meta={`${numberWord(science.data.studies.length)} studies · ${numberWord(science.data.mechanisms.length)} mechanisms`}
            /* 28px between the card row and the closing sentence. The one
               band gap in the design that is not 20, 24 or 32. */
            centreClassName="shell:gap-7"
          >
            <CardGrid columns={2}>
              {science.data.studies.map((study) => (
                <IndexCard
                  key={study.slug}
                  kicker={`Study · ${study.kind}`}
                  title={study.title}
                  href={`/science/${study.slug}`}
                  description={study.summary}
                  meta={`${numberWord(study.mechanismCount)} mechanism${
                    study.mechanismCount === 1 ? '' : 's'
                  }`}
                />
              ))}
            </CardGrid>

            {/* The design's closing `Note`, 15 over 26 in the serif — the
                one line of running prose on this screen. */}
            <p className="m-0 w-full text-15 leading-170 font-serif tracking-flat text-ink-2">
              A mechanism is written down once and cited from every method that
              leans on it, so a correction lands in one place rather than in
              six.
            </p>
          </Band>
        ) : null}

        {/* ── HOW THIS WORKS ─────────────────────────────────────────── */}
        <Band label="How this works" meta={numberWord(HOW_THIS_WORKS.length)}>
          <CardGrid columns={4}>
            {HOW_THIS_WORKS.map((card, index) => (
              <IndexCard
                key={card.title}
                kicker={roman(index + 1)}
                title={card.title}
                description={card.body}
              />
            ))}
          </CardGrid>
        </Band>
      </div>
    </>
  );
}
