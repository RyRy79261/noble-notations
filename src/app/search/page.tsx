import type { Metadata } from 'next';
import Link from 'next/link';

import { Breadcrumb } from '@/components/f/breadcrumb';
import { Button, FOCUS_RING, PROSE_LINK } from '@/components/f/button';
import { Field } from '@/components/f/field';
import { Empty, Notice } from '@/components/f/notice';
import { PageHead, PageHero } from '@/components/f/page-head';
import { SectionHead } from '@/components/f/section-label';
import { DatabaseNotice } from '@/components/database-notice';
import { RecipeGrid } from '@/components/recipe-card';
import { RECIPE_KINDS } from '@/lib/domain/schemas';
import { getStats, listCategories, searchRecipes } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { Cardinal, cardinal, KIND_LABELS, site } from '@/lib/site';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Search',
  description:
    'Search the repository by text, cuisine, technique and ingredient — including ingredients to exclude.',
  alternates: { canonical: '/search' },
  robots: { index: true, follow: true },
};

/** `Main`, the breadcrumb form. `list-search-archive-1280.html:2956`. */
const MAIN = cn(
  'flex w-full flex-col items-start gap-7 px-4 pt-5.5 pb-12',
  'shell:gap-10 shell:px-15 shell:pt-8.5 shell:pb-18',
);

/** A row of fields: stacked at 360, side by side at 1280. `gap-[ 20px ]`. */
const FIELD_ROW = cn(
  'flex w-full shrink-0 flex-col items-start gap-5',
  'shell:flex-row shell:items-start',
);

/**
 * One cell of that row. `F/Field` is `w-full shrink-0` so it fills a 360
 * column; in a 1280 row three of those overflow, so the cell grows from a
 * zero basis instead. The `shell:` variants sort after the base utilities in
 * the generated sheet, so they win without an `!important`.
 */
const FIELD_CELL = 'shell:w-auto shell:shrink shell:grow shell:basis-0';

/**
 * `ISSUE 01` — the first segment of the document issue.
 *
 * `site.issue` is `Issue 01 · 08 Sep 2026` and D-07 says it is one constant.
 * The design's kicker on this screen carries the number without the date
 * (`SIX RECIPES INDEXED · ISSUE 01`), so it is taken from the constant
 * rather than typed a second time and left to drift.
 */
const ISSUE_NUMBER = site.issue.split('·')[0]?.trim() ?? site.issue;

/** The 9px mono micro-labels around the form. */
const NOTE = 'text-09 font-mono tracking-label uppercase text-ink-3';

type SearchParams = Promise<{
  q?: string;
  cuisine?: string;
  technique?: string;
  ingredient?: string;
  exclude?: string;
  kind?: string;
}>;

/** Comma-separated filter values, trimmed and emptied of blanks. */
function list(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** `a`, `a and b`, `a, b and c` — the design's own prose joins. */
function series(values: string[]): string {
  if (values.length <= 1) return values.join('');
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

/**
 * `/search` — §10.5, R-SCR-17, R-SCR-18, R-CON-03, and
 * `design/exports/png/KH81f.png`.
 *
 * A PLAIN GET FORM AND NOTHING ELSE. No `"use client"`, no `onChange`, no
 * submit handler: the browser serialises the six fields into the address bar
 * and asks the server again. That is what makes every search a link, and it
 * is why the design gives the screen a block that prints the address the
 * form produces — the URL is the API, so the screen shows it.
 *
 * The design draws two numbered sections and no spine: `I Query` over the
 * fields, `II Results` over the cards. Between them sit the two things that
 * make the query legible — the address, and R-SCR-18's sentence saying in
 * English what the filters add up to.
 *
 * THE FIELD NAMES ARE THE BUILD'S, NOT THE DESIGN'S. The drawn address
 * reads `?q=…&with=…&without=…`; this build has answered to
 * `?q=…&ingredient=…&exclude=…` since before the design, `e2e/site.spec.ts`
 * asserts one of them, and every published `/llms.txt` and MCP answer names
 * them. Renaming a public query parameter to match a picture would break
 * saved links for a word. Recorded for the designer.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? '';
  const cuisine = list(params.cuisine);
  const technique = list(params.technique);
  const ingredient = list(params.ingredient);
  const exclude = list(params.exclude);
  const kind = RECIPE_KINDS.includes(params.kind as 'recipe')
    ? (params.kind as 'recipe')
    : undefined;

  /* R-SCR-18. A condition is a FIELD that was filled in, which is how the
     design counts them: "one answers all six conditions" on a screen with
     six of the six filled. */
  const conditions = [
    Boolean(query),
    cuisine.length > 0,
    technique.length > 0,
    ingredient.length > 0,
    exclude.length > 0,
    Boolean(kind),
  ].filter(Boolean).length;
  const hasFilters = conditions > 0;

  const [results, categories, stats] = await Promise.all([
    hasFilters
      ? safeRead(
          () =>
            searchRecipes({
              query: query || undefined,
              categories: {
                ...(cuisine.length ? { cuisine } : {}),
                ...(technique.length ? { technique } : {}),
              },
              ingredients: ingredient,
              excludeIngredients: exclude,
              kind,
              limit: 60,
              offset: 0,
            }),
          { results: [], total: 0 },
        )
      : Promise.resolve({
          data: { results: [], total: 0 },
          configured: true,
          failed: false,
        }),
    safeRead(() => listCategories(), []),
    safeRead(() => getStats(), {
      recipes: 0,
      revisions: 0,
      ingredients: 0,
      terms: 0,
      notes: 0,
      experiments: 0,
    }),
  ]);

  const cuisines = categories.data.filter((t) => t.categoryType === 'cuisine');
  const techniques = categories.data.filter(
    (t) => t.categoryType === 'technique',
  );
  const indexed = stats.data.recipes;
  const total = results.data.total;
  /* R-STA-01. `getStats` falls back to zeroes when the database is not
     configured, and "ZERO RECIPES INDEXED" is a claim about the repository
     rather than a report about the connection. Every slot that names a
     figure is dropped instead when the read did not happen. */
  const counted = stats.configured && !stats.failed;
  const tagsKnown = categories.configured && !categories.failed;

  /* The design's own address block. It prints what the form produces, in
     the order the fields are drawn, so the reader can copy the query
     rather than reverse-engineer it. */
  const address = new URLSearchParams();
  if (query) address.set('q', query);
  if (ingredient.length) address.set('ingredient', ingredient.join(','));
  if (exclude.length) address.set('exclude', exclude.join(','));
  if (cuisine.length) address.set('cuisine', cuisine.join(','));
  if (technique.length) address.set('technique', technique.join(','));
  if (kind) address.set('kind', kind);
  const addressText = address.size > 0 ? `/search?${address}` : '/search';

  /* R-SCR-18's sentence. Each clause is only written when its field was
     filled in, so the sentence is always true of the query that produced
     it. */
  /*
   * THE SENTENCE IS ENGLISH, SO IT USES THE LABEL AND NOT THE SLUG. The
   * query string carries `cuisine=south-african`; the design writes "whose
   * cuisine is South African and whose technique is air-drying"
   * (`png/KH81f.png`), and this printed "whose cuisine is south-african"
   * into a sentence that is otherwise prose. `listCategories` is already
   * read above for the two `<select>`s, so the label is in hand and no
   * second query is needed. A slug that matches nothing — a hand-typed
   * address, or a tag that has since gone — falls back to itself rather
   * than disappearing out of a sentence that says what was asked for.
   */
  const label = (terms: typeof cuisines, slug: string): string =>
    terms.find((term) => term.slug === slug)?.label ?? slug;
  const cuisineLabels = cuisine.map((slug) => label(cuisines, slug));
  const techniqueLabels = technique.map((slug) => label(techniques, slug));

  const clauses = [
    query ? `that mention “${query}” somewhere in their text` : null,
    ingredient.length ? `that contain ${series(ingredient)}` : null,
    exclude.length ? `that do not contain ${series(exclude)}` : null,
    cuisine.length ? `whose cuisine is ${series(cuisineLabels)}` : null,
    technique.length ? `whose technique is ${series(techniqueLabels)}` : null,
  ].filter(Boolean) as string[];
  const asked = `You are asking for ${
    kind ? `recipes of the kind ${kind}` : 'recipes'
  }${clauses.length ? ` ${series(clauses)}` : ''}.`;

  /* The crumb takes the same labels, for the same reason. */
  const crumb =
    query ||
    cuisineLabels[0] ||
    techniqueLabels[0] ||
    ingredient[0] ||
    'Everything';

  return (
    <>
      <PageHead
        left="NN · Search"
        right={
          counted
            ? `${cardinal(indexed)} recipe${indexed === 1 ? '' : 's'} indexed · ${ISSUE_NUMBER}`
            : ISSUE_NUMBER
        }
      />

      <div className={MAIN}>
        <Breadcrumb items={[{ label: 'Search' }, { label: crumb }]} />

        <PageHero
          kicker="Section VI · Search"
          title="Search"
          lede="A plain form. It submits with GET, so the whole query lives in the address and every search you run is a link you can keep, send or bookmark. Nothing on this page needs scripting."
          ledeClassName="shell:max-w-205"
        />

        {/* R-CON-03. A plain GET form: shareable URLs, works without
            JavaScript, and the query string is the whole state. */}
        <form
          method="GET"
          action="/search"
          className="flex w-full shrink-0 flex-col items-start gap-5"
        >
          <SectionHead
            ordinal="I"
            title="Query"
            meta="Method GET · Action /search"
          />

          <div className={FIELD_ROW}>
            <Field
              className={FIELD_CELL}
              label="Free text"
              type="search"
              name="q"
              defaultValue={query}
              placeholder="biltong, demi-glace, focaccia"
            />
          </div>

          <div className={FIELD_ROW}>
            <Field
              className={FIELD_CELL}
              label="Ingredients that must be in it"
              type="text"
              name="ingredient"
              defaultValue={ingredient.join(', ')}
              placeholder="beef silverside, coriander seed"
            />
            <Field
              className={FIELD_CELL}
              label="Ingredients that must not be in it"
              type="text"
              name="exclude"
              defaultValue={exclude.join(', ')}
              placeholder="chilli"
            />
          </div>

          <div className={FIELD_ROW}>
            <Field
              className={FIELD_CELL}
              as="select"
              label="Cuisine"
              name="cuisine"
              defaultValue={cuisine[0] ?? ''}
            >
              <option value="">Any</option>
              {cuisines.map((term) => (
                <option key={term.id} value={term.slug}>
                  {term.label} ({term.recipeCount})
                </option>
              ))}
            </Field>
            <Field
              className={FIELD_CELL}
              as="select"
              label="Technique"
              name="technique"
              defaultValue={technique[0] ?? ''}
            >
              <option value="">Any</option>
              {techniques.map((term) => (
                <option key={term.id} value={term.slug}>
                  {term.label} ({term.recipeCount})
                </option>
              ))}
            </Field>
            <Field
              className={FIELD_CELL}
              as="select"
              label="Kind"
              name="kind"
              defaultValue={kind ?? ''}
            >
              <option value="">Any</option>
              {RECIPE_KINDS.map((value) => (
                <option key={value} value={value}>
                  {KIND_LABELS[value] ?? value}
                </option>
              ))}
            </Field>
          </div>

          {tagsKnown ? (
            <p className={cn('m-0', NOTE)}>
              Each list shows how many recipes carry the tag · {cuisines.length}{' '}
              cuisines · {techniques.length} techniques · {RECIPE_KINDS.length}{' '}
              kinds
            </p>
          ) : null}

          <div className="flex w-full shrink-0 flex-row flex-wrap items-center gap-4">
            <Button type="submit">Search</Button>
            {/* The design's bare text control — 10px mono on no ground at
                all, and explicitly NOT F/Button (see `button.tsx`). A link
                back to the empty address clears all six fields with no
                script, which is the only way that works under R-CON-03. */}
            <Link
              href="/search"
              className={cn(
                'text-10 font-mono tracking-label uppercase text-ink-3 no-underline hover:text-ink',
                '-my-1.5 inline-flex min-h-6 items-center',
                FOCUS_RING,
              )}
            >
              Clear all six fields
            </Link>
            <span
              className={cn(
                'ml-auto text-09 font-mono tracking-label uppercase text-accent',
              )}
            >
              Submits with GET · Works without JavaScript
            </span>
          </div>

          <div className="flex w-full shrink-0 flex-col items-start gap-2 bg-desk px-3.25 py-2.75">
            <span className={NOTE}>The address this form produces</span>
            {/* 12 over 18 is `leading-150`, and the size travels with it in
                ONE argument — TOKEN-MAP §4.3. `break-all` is this build's:
                a query with six filled fields is longer than the column and
                has no space in it to break at. */}
            <code className="w-full text-12 leading-150 font-mono break-all text-ink">
              {addressText}
            </code>
          </div>
        </form>

        {hasFilters && results.configured && !results.failed ? (
          <Notice title="What you are asking for, in words">
            {/* `asked` ends in a full stop, so the count that follows it
                opens a sentence and takes sentence case. */}
            {asked}{' '}
            {counted
              ? `${Cardinal(indexed)} recipe${indexed === 1 ? '' : 's'} were considered and `
              : ''}
            {cardinal(total)} {total === 1 ? 'answers' : 'answer'} all{' '}
            {cardinal(conditions)} condition{conditions === 1 ? '' : 's'}.
          </Notice>
        ) : null}

        <div className="flex w-full shrink-0 flex-col items-start gap-6">
          <SectionHead
            ordinal="II"
            title="Results"
            meta={
              !results.configured || results.failed
                ? 'Repository unavailable'
                : !hasFilters
                  ? 'Nothing asked for yet'
                  : counted
                    ? `${cardinal(total)} of ${cardinal(indexed)} recipe${indexed === 1 ? '' : 's'}`
                    : `${cardinal(total)} recipe${total === 1 ? '' : 's'}`
            }
          />

          {!results.configured || results.failed ? (
            <DatabaseNotice failed={results.failed} />
          ) : !hasFilters ? (
            <Empty>
              Fill in a field above, or{' '}
              <Link href="/recipes" className={PROSE_LINK}>
                browse everything
              </Link>
              .
            </Empty>
          ) : results.data.results.length === 0 ? (
            <Empty>
              Nothing matched. Try dropping a filter — they are combined with
              AND.
            </Empty>
          ) : (
            <>
              {/* The design draws one full-width card per row here, not a
                  grid: `Results` is a `gap-[ 24px ]` column and the card
                  inside it is `w-full`. */}
              <RecipeGrid recipes={results.data.results} columns={1} />
              {counted && total < indexed ? (
                <Empty>
                  Nothing else answered all {cardinal(conditions)} condition
                  {conditions === 1 ? '' : 's'}. Drop one and more appear.
                </Empty>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
