import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getIngredient, listIngredients } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { NoteList } from '@/components/notes';
import { DatabaseNotice } from '@/components/database-notice';
import { BatchLine } from '@/components/f/batch-line';
import { Breadcrumb } from '@/components/f/breadcrumb';
import { citationDate } from '@/components/f/citation';
import { Mark, MarkQuiet, recipeKindLabel } from '@/components/f/mark';
import { PageHead, PageHero } from '@/components/f/page-head';
import { SectionHead } from '@/components/f/section-label';
import { Tag } from '@/components/f/tag';
import { Stat } from '@/components/f/stat';
import {
  CATEGORY_LABELS,
  cardinal,
  revisionOrdinal,
  roman,
  shopOrder,
  site,
} from '@/lib/site';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/**
 * One ingredient — `ingredients-1280.html:1636` and `m360-…:4900`.
 *
 * The screen is the numbered section head and nothing else: there is no
 * spine and no card. Head, hero, a `f-desk` ledger of properties, the two
 * label rows, then `I Substitutes`, the notes and `II Recipes using it`.
 *
 * THE CATALOGUE NUMBER COMES FROM THE INDEX. `INGREDIENT 16` in the kicker
 * and `16` in the `ITEM NO.` figure are this ingredient's position in the
 * shop-ordered list `/ingredients` numbers, so the two screens read the same
 * number for the same thing. That is why the list is read here as well as
 * the record: `shopOrder` in `src/lib/site.ts` is the one ordering and
 * neither screen owns it.
 *
 * TWO THINGS THE DESIGN DRAWS THAT THE SCHEMA CANNOT FILL, both dropped
 * rather than invented (R-STA-05):
 *
 *   `CLASS — Spice, whole`. Nothing in `ingredients` holds a class beyond
 *   the aisle, which is already the `AISLE` figure beside it.
 *
 *   `AS CALLED FOR — 162 g Baumy Biltong`. `getIngredient` reads the recipes
 *   that use the ingredient but not the quantity each one asks for, so the
 *   row would be three chips repeating the section below it with the one
 *   fact that makes it worth drawing missing. `II Recipes using it` carries
 *   the same links with more.
 *
 * A THIRD IS REWORDED. The design's note beside the aliases reads "a search
 * for either name finds this page"; `searchRecipes` matches recipes, not
 * ingredients, so what is true is the filter on the index (R-SCR-22). The
 * sentence says that instead.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await safeRead(() => getIngredient(slug), null);
  if (!data) return { title: 'Ingredient not found' };

  const description =
    data.ingredient.description ??
    `${data.ingredient.name} — used in ${data.recipes.length} recipes in the ${site.name} repository.`;

  return {
    title: data.ingredient.name,
    description,
    alternates: { canonical: `/ingredients/${slug}` },
    keywords: [data.ingredient.name, ...data.ingredient.aliases],
    openGraph: {
      type: 'website',
      title: data.ingredient.name,
      description,
      url: `/ingredients/${slug}`,
    },
  };
}

/* The two label rows. A 110px mono column at 1280, a stacked micro-label at
   360 — `m360-classes-ingredients.html:5092` draws the label above the chips
   at 1.5px tracking where 1280 draws it beside them at 1.2px. */
const ROW_LABEL = cn(
  'text-09 font-mono tracking-spine uppercase text-ink-3',
  'shell:w-27.5 shell:shrink-0 shell:tracking-label',
);

export default async function IngredientPage({ params }: Params) {
  const { slug } = await params;

  /* Two reads in one `safeRead`. The record is the page; the list is only
     read for the catalogue number, and a failure of either has to give the
     same unavailable screen rather than a page with a hole in the kicker. */
  const { data, configured, failed } = await safeRead(
    async () => {
      const [ingredient, all] = await Promise.all([
        getIngredient(slug),
        listIngredients(),
      ]);
      return { ingredient, all };
    },
    { ingredient: null, all: [] },
  );

  if (!configured || failed) {
    // R-STA-01 and R-STA-02. The kicker still names the screen a reader
    // asked for, so the notice arrives on a page and not on a blank.
    return (
      <>
        <PageHead
          left={`NN · Ingredients · ${slug}`}
          leftNarrow={slug}
          right="Unavailable"
        />
        <div className="flex w-full flex-col items-start gap-5 px-4 pt-5.5 pb-12 shell:px-15 shell:pt-8.5 shell:pb-18">
          <h1 className="m-0 text-40 leading-105 font-serif font-medium tracking-display text-ink shell:text-48 shell:leading-105">
            {slug}
          </h1>
          <DatabaseNotice failed={failed} />
        </div>
      </>
    );
  }
  if (!data.ingredient) notFound();

  const { ingredient, recipes, substitutes, notes } = data.ingredient;

  const numbers = new Map(
    shopOrder(data.all).map((row, index) => [row.slug, index + 1]),
  );
  const number = numbers.get(ingredient.slug);
  const aisle =
    CATEGORY_LABELS[ingredient.category] ??
    ingredient.category.replace(/_/g, ' ');

  const reference = number ? `Ingredient ${number}` : 'Ingredient';
  const recipeCount = recipes.length;

  return (
    <>
      <PageHead
        left={`NN · ${reference} · ${ingredient.name}`}
        leftNarrow={`NN · ${reference}`}
        right={`${aisle} · ${cardinal(recipeCount)} recipe${recipeCount === 1 ? '' : 's'}`}
      />

      <div className="flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12 shell:gap-11 shell:px-15 shell:pt-8.5 shell:pb-18">
        {/* §1.3. The trail at 1280, two chips at 360. */}
        <div className="flex flex-row flex-wrap items-center gap-2 shell:hidden">
          <Mark>{reference}</Mark>
          <MarkQuiet>{aisle}</MarkQuiet>
        </div>
        <Breadcrumb
          className="hidden shell:block"
          items={[
            { label: 'Ingredients', href: '/ingredients' },
            { label: aisle },
            { label: ingredient.name },
          ]}
        />

        <PageHero
          kicker={`${reference} · ${aisle}`}
          title={ingredient.name}
          ledeClassName="shell:max-w-185"
          lede={ingredient.description ?? undefined}
        />

        {/* The ledger. A `f-desk` band at 1280 and bare rows of statistics at
            360, where the design drops the ground entirely
            (`m360-classes-ingredients.html:4992`). */}
        <div className="flex w-full flex-row flex-wrap items-start gap-x-5 gap-y-4 shell:gap-0 shell:bg-desk shell:px-6.5 shell:py-5.5">
          {number ? (
            <Stat
              grow
              size="lg"
              sizeNarrow="sm"
              className="min-w-25"
              label="Item no."
              value={number}
            />
          ) : null}
          <Stat
            grow
            size="lg"
            sizeNarrow="sm"
            className="min-w-25"
            label="Aisle"
            value={aisle}
          />
          {ingredient.densityGPerMl ? (
            <Stat
              grow
              size="lg"
              sizeNarrow="sm"
              className="min-w-25"
              label="Density"
              value={`${ingredient.densityGPerMl} g/ml`}
            />
          ) : null}
          {ingredient.defaultUnit ? (
            <Stat
              grow
              size="lg"
              sizeNarrow="sm"
              className="min-w-25"
              label="Usual unit"
              value={ingredient.defaultUnit}
            />
          ) : null}
          <Stat
            grow
            size="lg"
            sizeNarrow="sm"
            className="min-w-25"
            label="Recipes"
            value={recipeCount}
          />
        </div>

        {ingredient.aliases.length > 0 ? (
          <div className="flex w-full flex-col items-start gap-2 shell:flex-row shell:items-center shell:gap-4">
            <span className={ROW_LABEL}>Also called</span>
            <div className="flex flex-row flex-wrap items-center gap-2">
              {ingredient.aliases.map((alias) => (
                /* THE SAME OBJECT AS THE `/classes` PILL, to the pixel at both
                   widths: `p-[ 4px_9px_4px_10px ]` with a 13px name at 1280
                   (`ingredients-1280.html:1817`) and `p-[ 5px_8px_5px_10px ]`
                   with a 12px one at 360 (`m360-classes-ingredients.html:5106`)
                   — which is exactly what `Tag`'s `pill` was carried forward
                   from M4 to draw. It is NOT `F/List mark`: that chip is 13px
                   at both widths and `list-row.tsx` keeps the two apart on
                   purpose.

                   No `href`. An alias has no page of its own; it resolves to
                   this one, which is what the line beside it says. */
                <Tag key={alias} pill name={alias} />
              ))}
            </div>
            <p className="m-0 text-13 font-serif text-ink-3 italic">
              — the index filter finds this page by either name
            </p>
          </div>
        ) : null}

        {substitutes.length > 0 ? (
          <>
            <SectionHead
              ordinal={roman(1)}
              title="Substitutes"
              meta={cardinal(substitutes.length)}
            />
            <div className="flex w-full flex-col items-start gap-0">
              {substitutes.map((substitute) => {
                const substituteNumber = numbers.get(substitute.slug);

                return (
                  <div
                    key={substitute.slug}
                    className={cn(
                      'flex w-full shrink-0 flex-col items-start gap-3 pt-4.5 pb-5',
                      'shell:flex-row shell:items-start shell:gap-6',
                      '[border-style:solid] [border-width:1px_0px_0px_0px] border-t-hair',
                    )}
                  >
                    <div className="flex w-full shrink-0 flex-col items-start gap-2 shell:w-65">
                      <p className="m-0 text-21 leading-115 font-serif font-medium tracking-flat text-ink">
                        {substitute.name}
                      </p>
                      {/* The design draws the two states of this line:
                          `INGREDIENT 23` for a substitute the catalogue
                          stocks, `NOT STOCKED` for one it only names. */}
                      <span className="text-09 font-mono tracking-label uppercase text-ink-3">
                        {substituteNumber
                          ? `Ingredient ${substituteNumber}`
                          : 'Not stocked'}
                      </span>
                    </div>
                    {substitute.note ? (
                      <p className="m-0 w-full text-14 leading-170 font-sans text-ink-2 shell:flex-1 shell:basis-0">
                        {substitute.note}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        {notes.length > 0 ? <NoteList notes={notes} /> : null}

        <SectionHead
          ordinal={roman(substitutes.length > 0 ? 2 : 1)}
          title="Recipes using it"
          meta={cardinal(recipeCount)}
        />
        {recipeCount === 0 ? (
          <p className="m-0 text-19 font-serif text-ink-3 italic">
            Nothing in the catalogue calls for it yet.
          </p>
        ) : (
          <div className="flex w-full flex-col items-start gap-0">
            {recipes.map((recipe) => {
              const cuisine = recipe.terms.find(
                (term) => term.categoryType === 'cuisine',
              );

              return (
                <BatchLine
                  key={recipe.slug}
                  className="pt-4 pb-4.5 [border-style:solid] [border-width:1px_0px_0px_0px] border-t-hair"
                  /* F/Batch line's lead is a free run, not a date: the design
                     fills it with a catalogue number on this exact list
                     (`ingredients-1280.html:2137`). We have no catalogue
                     number, so it holds the one fact the row does not repeat
                     — which of the five kinds of document this is. */
                  lead={recipeKindLabel(recipe.kind)}
                  title={recipe.title}
                  href={`/recipes/${recipe.slug}`}
                  text={recipe.subtitle ?? recipe.summary ?? undefined}
                  meta={[
                    cuisine?.label,
                    revisionOrdinal(recipe.revisionNumber),
                    citationDate(recipe.updatedAt),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
