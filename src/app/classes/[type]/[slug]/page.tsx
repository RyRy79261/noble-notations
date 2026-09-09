import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { Breadcrumb } from '@/components/f/breadcrumb';
import { FOCUS_RING } from '@/components/f/button';
import { Mark, MarkQuiet } from '@/components/f/mark';
import { Empty } from '@/components/f/notice';
import { PageHead, PageHero } from '@/components/f/page-head';
import { SectionHead } from '@/components/f/section-label';
import { Stat } from '@/components/f/stat';
import { DatabaseNotice } from '@/components/database-notice';
import { TermHierarchy } from '@/components/term-hierarchy';
import {
  getTerm,
  listCategories,
  type RecipeSummaryView,
  type TermView,
} from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import {
  CATEGORY_TYPE_LABELS,
  cardinal,
  revisionOrdinal,
  roman,
  site,
} from '@/lib/site';
import { CATEGORY_TYPES, type CategoryType } from '@/lib/domain/schemas';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ type: string; slug: string }> };

/*
 * ─── WHAT THE DESIGN DRAWS ───────────────────────────────────────────────
 *
 * `design/exports/png/XcQdo.png` and `classes-cuisines-1280.html:1570`.
 * Nothing on this screen is a card:
 *
 *   Page head    NN · PRESERVATION · CURING   THREE NARROWER TAGS · THREE RECIPES
 *   Breadcrumb   CLASSIFICATION · PRESERVATION · CURING
 *   Hero row     the 48px title beside a 200px column of three statistics
 *   Hierarchy    F/Tag hierarchy, the one recessed `f-desk` panel here
 *   Section I    Narrower tags  ·  THREE      then three ruled rows
 *   Section II   Recipes using this tag · THREE   then three ruled rows
 *
 * Both lists are the M6 brief's PATTERN C — a ruled record list, `gap-0`,
 * each row on its own 1px `f-hair` TOP rule. A narrower tag is a 230px serif
 * name, a growing description and a 110px right-aligned count (`:1977`); a
 * recipe is a 110px mono gutter, then a 17px serif title over a summary and
 * a mono run of its terms (`:2077`).
 *
 * ─── THREE THINGS THE DRAWING HAS AND THE DATA DOES NOT ──────────────────
 *
 * D-12 ruled on this shape: a slot the design draws and the schema cannot
 * fill is left out, not invented.
 *
 * 1. `NN-04-02` in the recipe gutter. There is no catalogue number anywhere
 *    in the schema — `src/components/recipe-card.tsx` records the same hole
 *    for F/Recipe card's `Code` and fills that run with the revision alone.
 *    This gutter takes the same string, so the slot draws real data and the
 *    terms move to the meta run underneath. R-STA-05.
 * 2. The footnote at `:2213`, `NOTE · CLASSIFICATION`. A note's subject is a
 *    recipe, a revision, a step, an ingredient or an experiment — the
 *    `note_has_exactly_one_subject` check lists all five — and a term is not
 *    one of them. `getTerm` returns none and there is none to return.
 * 3. `2 RECIPES` beside a narrower tag. `getTerm` returns its children as
 *    bare `TermView`s with no count, so the counts come from a SECOND read
 *    through the query layer: `listCategories(facet)` already carries
 *    `recipeCount` for every term in this facet, and the two are joined by
 *    id here. Two reads, both existing functions, no query in the page
 *    (R-BLD-05).
 */

function asCategoryType(value: string): CategoryType | null {
  return (CATEGORY_TYPES as readonly string[]).includes(value)
    ? (value as CategoryType)
    : null;
}

/** `ONE RECIPE`, `THREE RECIPES`, `NO RECIPES`. The count is a word. */
function recipeCount(count: number): string {
  if (count === 0) return 'no recipes';
  return `${cardinal(count)} ${count === 1 ? 'recipe' : 'recipes'}`;
}

/** Where a term lives. A cuisine has a short address; everything else sits
 *  under its type. The same answer `termHref` gives in `tags.tsx`. */
function termPath(term: Pick<TermView, 'categoryType' | 'slug'>) {
  return term.categoryType === 'cuisine'
    ? `/cuisines/${term.slug}`
    : `/classes/${term.categoryType}/${term.slug}`;
}

/* The ruled row shared by both lists. The rule is on the TOP at 1280 and on
   the bottom at 360, and it quietens to `f-hair-2` there — the same
   inversion `/classes` and `/cuisines` make. One four-value declaration per
   side, because the preflight is off until M7 and a lone `border-t` draws
   nothing at all. */
const ROW = cn(
  'flex h-fit w-full shrink-0 flex-row flex-wrap items-start pb-4.5',
  '[border-style:solid] [border-width:0px_0px_1px_0px] border-b-hair-2',
  'shell:flex-nowrap shell:pb-5 shell:[border-width:1px_0px_0px_0px] shell:border-t-hair',
);

/** One narrower tag. `classes-cuisines-1280.html:1977`. */
function NarrowerRow({
  term,
  count,
}: {
  term: TermView;
  count: number | undefined;
}) {
  return (
    <li className={cn(ROW, 'gap-x-3 gap-y-2 pt-4 shell:gap-6 shell:pt-4.5')}>
      <h3
        className={cn(
          'm-0 min-w-0 flex-1 text-19 leading-115 font-serif font-medium tracking-flat text-ink',
          'shell:w-57.5 shell:flex-none shell:text-21 shell:leading-115',
        )}
      >
        <Link
          href={termPath(term)}
          className={cn('text-ink no-underline', FOCUS_RING)}
        >
          {term.label}
        </Link>
      </h3>{' '}
      {count === undefined ? null : (
        <span
          className={cn(
            'ml-auto text-09 leading-normal font-mono tabular-nums tracking-label uppercase text-ink-3',
            'shell:order-last shell:ml-0 shell:w-27.5 shell:shrink-0 shell:text-right',
          )}
        >
          {recipeCount(count)}
        </span>
      )}
      {term.description ? (
        <p
          className={cn(
            'm-0 w-full text-13 leading-170 font-sans tracking-flat text-ink-2',
            'shell:w-auto shell:flex-1 shell:text-14 shell:leading-170',
          )}
        >
          {term.description}
        </p>
      ) : null}
    </li>
  );
}

/** One recipe. `classes-cuisines-1280.html:2077`. */
function RecipeRow({ recipe }: { recipe: RecipeSummaryView }) {
  const revision = revisionOrdinal(recipe.revisionNumber);
  /*
   * The design's meta run holds three values and no more:
   * `SOUTH AFRICAN · AIR-DRYING · SIXTH REVISION`
   * (`classes-cuisines-1280.html`, the row for Baumy Biltong). The revision
   * sits in the left column here, so the run carries two terms.
   *
   * Two rules, and both come from real data:
   *   A label can repeat. "Air-drying" is a technique AND a preservation
   *   method, and a tag never crosses category types, so a recipe with both
   *   printed `AIR-DRYING · AIR-DRYING`. The run states a label once.
   *   A recipe can carry nine terms. The design draws a quiet run, not a
   *   tag list, so the run stops at two and the reader opens the recipe.
   *
   * The design's own pair is a cuisine and a technique, in that order, so
   * the run sorts to that preference before it takes two. Anything else
   * keeps the order the query returned. A texture and a preservation method
   * are true of the recipe but they say less about it than "South African,
   * air-dried".
   */
  const META_ORDER = ['cuisine', 'technique'];
  const terms = [
    ...new Map(
      [...recipe.terms]
        .sort((a, b) => {
          const rank = (type: string) => {
            const index = META_ORDER.indexOf(type);
            return index === -1 ? META_ORDER.length : index;
          };
          return rank(a.categoryType) - rank(b.categoryType);
        })
        .map((term) => [term.label.toLowerCase(), term.label]),
    ).values(),
  ].slice(0, 2);

  return (
    <li className={cn(ROW, 'flex-col gap-2 pt-4 shell:flex-row shell:gap-5')}>
      {revision ? (
        <span
          className={cn(
            'shrink-0 text-10 leading-normal font-mono tracking-micro uppercase text-ink-3',
            'shell:w-27.5',
          )}
        >
          {revision}
        </span>
      ) : null}{' '}
      <div className="flex min-w-0 w-full flex-col items-start gap-1 shell:w-auto shell:flex-1">
        <h3 className="m-0 text-17 leading-normal font-serif font-medium tracking-flat text-ink">
          <Link
            href={`/recipes/${recipe.slug}`}
            className={cn('text-ink no-underline', FOCUS_RING)}
          >
            {recipe.title}
          </Link>
        </h3>
        {recipe.summary ? (
          <p className="m-0 w-full text-13 leading-170 font-sans tracking-flat text-ink-2 shell:text-14 shell:leading-170">
            {recipe.summary}
          </p>
        ) : null}
        {terms.length > 0 ? (
          /* The design's `Meta`: one quiet mono run with the separators
             inside it, `SOUTH AFRICAN · AIR-DRYING · SIXTH REVISION`. Not
             gapped flex children — R-CMP-14: a flex gap is invisible to
             `textContent` and a screen reader would run the words together. */
          <span className="text-09 leading-normal font-mono tracking-label uppercase text-ink-3">
            {terms.join(' · ')}
          </span>
        ) : null}
      </div>
    </li>
  );
}

/** The `gap-0` container both lists share. */
function RowList({ children }: { children: ReactNode }) {
  return (
    <ul className="m-0 flex w-full list-none flex-col items-start gap-0 p-0">
      {children}
    </ul>
  );
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { type, slug } = await params;
  const parsed = asCategoryType(type);
  if (!parsed) return { title: 'Not found' };

  const { data } = await safeRead(() => getTerm(parsed, slug), null);
  if (!data) return { title: 'Not found' };

  const typeLabel = CATEGORY_TYPE_LABELS[type] ?? type;
  const description =
    data.term.description ??
    `${data.recipes.length} recipes with the tag ${data.term.label} (${typeLabel.toLowerCase()}) in the ${site.name} repository.`;

  return {
    title: `${data.term.label} — ${typeLabel}`,
    description,
    alternates: { canonical: `/classes/${type}/${slug}` },
    openGraph: {
      type: 'website',
      title: `${data.term.label} — ${typeLabel}`,
      description,
      url: `/classes/${type}/${slug}`,
    },
  };
}

export default async function TermPage({ params }: Params) {
  const { type, slug } = await params;
  const parsed = asCategoryType(type);
  if (!parsed) notFound();

  // Cuisine terms have a dedicated section; keep one canonical URL per term.
  if (parsed === 'cuisine') notFound();

  const { data, configured, failed } = await safeRead(
    () => getTerm(parsed, slug),
    null,
  );

  const typeLabel = CATEGORY_TYPE_LABELS[type] ?? type;

  if (!configured || failed) {
    // R-STA-01 and R-STA-02. The kicker still names the screen the reader
    // asked for, so the notice arrives on a page and not on a blank.
    return (
      <>
        <PageHead
          left={`NN · ${typeLabel} · ${slug}`}
          leftNarrow={`NN · ${slug}`}
          right="Unavailable"
        />
        <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:gap-11 shell:px-15 shell:pt-8.5 shell:pb-18">
          <PageHero kicker={`${typeLabel} · Tag`} title={slug} />
          <DatabaseNotice failed={failed} />
        </div>
      </>
    );
  }
  if (!data) notFound();

  /* See note 3 in the header: the children carry no count of their own. */
  const { data: siblings } = await safeRead(() => listCategories(parsed), []);
  const counts = new Map(siblings.map((term) => [term.id, term.recipeCount]));

  const children = data.children;
  const recipes = data.recipes;

  const kicker = [
    children.length > 0
      ? `${cardinal(children.length)} narrower ${children.length === 1 ? 'tag' : 'tags'}`
      : null,
    recipeCount(recipes.length),
  ]
    .filter(Boolean)
    .join(' · ');

  /* The section numbers renumber rather than skip: a flat tag draws its
     recipes as section I, not as section II with a hole above it. */
  let section = 0;

  return (
    <>
      <PageHead
        left={`NN · ${typeLabel} · ${data.term.label}`}
        leftNarrow={`NN · ${data.term.label}`}
        right={kicker}
      />

      <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:gap-11 shell:px-15 shell:pt-8.5 shell:pb-18">
        {/* The design deletes the trail at 360 and draws two chips in the
            hero instead; the chips are in `PageHero`'s kicker below. */}
        <Breadcrumb
          className="hidden shell:block"
          items={[
            { label: 'Classification', href: '/classes' },
            { label: typeLabel },
            { label: data.term.label },
          ]}
        />

        <div className="flex w-full shrink-0 flex-col items-start gap-6 shell:flex-row shell:items-start shell:gap-15">
          <div className="w-full min-w-0 shell:flex-1">
            <PageHero
              kicker={
                <>
                  <span className="flex flex-row items-center gap-2 shell:hidden">
                    <Mark>{typeLabel}</Mark>
                    <MarkQuiet>Tag</MarkQuiet>
                  </span>
                  <span className="hidden shell:inline">{`${typeLabel} · Tag`}</span>
                </>
              }
              title={data.term.label}
              lede={data.term.description ?? undefined}
              ledeClassName="shell:max-w-160"
            />
          </div>

          <div className="flex w-full shrink-0 flex-row gap-5 shell:w-50 shell:flex-col shell:gap-6 shell:pt-2">
            <Stat grow label="Type" value={typeLabel} sizeNarrow="sm" />
            {children.length > 0 ? (
              <Stat
                grow
                label="Narrower"
                value={children.length}
                sizeNarrow="sm"
              />
            ) : null}
            <Stat grow label="Recipes" value={recipes.length} sizeNarrow="sm" />
          </div>
        </div>

        {/* C-09 and R-CMP-05: nothing at all when the term is flat, which
            most terms are. The panel draws its own `f-desk` ground. */}
        <TermHierarchy parent={data.parent} narrower={children} />

        {children.length > 0 ? (
          <>
            <SectionHead
              ordinal={roman(++section)}
              title="Narrower tags"
              meta={cardinal(children.length)}
            />
            <RowList>
              {children.map((child) => (
                <NarrowerRow
                  key={child.id}
                  term={child}
                  count={counts.get(child.id)}
                />
              ))}
            </RowList>
          </>
        ) : null}

        <SectionHead
          ordinal={roman(++section)}
          title="Recipes using this tag"
          meta={cardinal(recipes.length)}
        />
        {recipes.length === 0 ? (
          <Empty>Nothing carries this tag yet.</Empty>
        ) : (
          <RowList>
            {recipes.map((recipe) => (
              <RecipeRow key={recipe.slug} recipe={recipe} />
            ))}
          </RowList>
        )}
      </div>
    </>
  );
}
