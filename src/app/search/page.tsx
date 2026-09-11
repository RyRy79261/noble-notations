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
import {
  getStats,
  listCategories,
  searchExperiments,
  searchNotes,
  searchRecipes,
} from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import {
  batchLogPath,
  Cardinal,
  cardinal,
  KIND_LABELS,
  KIND_NOUNS,
  NOTE_KIND_LABELS,
  site,
} from '@/lib/site';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Search',
  description:
    'Search the repository by text, cuisine, technique and ingredient — including ingredients to exclude. Free text also reaches batch logs and notes.',
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

/**
 * Where to send a reader who found a note.
 *
 * A note is not a page and has no address of its own. It is read on the
 * record it hangs off, which is the whole reason a result has to name that
 * record — a hit with nowhere to go is the same dead end as not finding it.
 * The five parent kinds collapse to three destinations: a note on a recipe,
 * on one of its revisions or on a step of one all lead to the recipe; an
 * ingredient and a run lead to their own pages.
 *
 * Route knowledge stays here and not in `read.ts`, so the MCP payload can
 * keep returning slugs and a type rather than site addresses.
 */
function noteHref(note: {
  attachedTo: { type: string; slug: string | null };
}): string | null {
  const { type, slug } = note.attachedTo;
  if (!slug) return null;
  switch (type) {
    case 'recipe':
    case 'revision':
    case 'step':
      return `/recipes/${slug}`;
    case 'ingredient':
      return `/ingredients/${slug}`;
    case 'experiment':
      /* The run's own live address, which depends on whether it names a
         recipe — D-01. `searchNotes` does not carry that, and a link to
         `/batch-logs/<slug>` is correct either way: it answers for both and
         redirects when the run has a recipe. */
      return `/batch-logs/${slug}`;
    default:
      return null;
  }
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
 * and asks the server again. That is what makes every search a link.
 *
 * THE SCREEN NO LONGER SAYS ANY OF THAT. It used to. The design's reading
 * was "the URL is the API, so the screen shows it", and the page carried a
 * block printing the address the form produces, an accent line reading
 * `SUBMITS WITH GET · WORKS WITHOUT JAVASCRIPT`, a note explaining how the
 * dropdowns were populated, and a clear link that counted its own fields.
 * Issue #21 is an agent reporting that a cook has no use for the HTTP
 * method, and that the screen read as a debug view of itself. The
 * guarantees are unchanged and R-CON-03 still holds — the form is still a
 * bare GET and still works with scripting off. What went is the screen
 * boasting about it. `e2e/screen-states.spec.ts` turns JavaScript off and
 * drives the form, which is a better record of R-SCR-17 than a caption
 * that was never once checked against the behaviour it claimed.
 *
 * The design draws two numbered sections and no spine: `I Query` over the
 * fields, `II Results` over the cards. Between them sits R-SCR-18's
 * sentence saying in English what the filters add up to.
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

  /* The screen counted filled fields and printed the number — "zero answer
     all six conditions". It only ever needed to know whether ANY field was
     filled, and the count produced "all one condition" whenever exactly one
     was, which is issue #21's grammar complaint. */
  const hasFilters =
    Boolean(query) ||
    cuisine.length > 0 ||
    technique.length > 0 ||
    ingredient.length > 0 ||
    exclude.length > 0 ||
    Boolean(kind);

  const [results, categories, stats, runs, noteHits] = await Promise.all([
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
    /* THE OTHER TWO HALVES ARE MATCHED ON THE TEXT ALONE, and only when
       there is text. The cuisine, technique, ingredient and kind filters
       are properties of a recipe — a note has no cuisine — so applying
       them here would silently return nothing rather than everything, and
       a reader would read that as "there are none". */
    query
      ? safeRead(() => searchExperiments({ query, limit: 20 }), {
          results: [],
          total: 0,
        })
      : Promise.resolve({
          data: { results: [], total: 0 },
          configured: true,
          failed: false,
        }),
    query
      ? safeRead(() => searchNotes({ query, limit: 20, offset: 0 }), {
          results: [],
          total: 0,
        })
      : Promise.resolve({
          data: { results: [], total: 0 },
          configured: true,
          failed: false,
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

  /*
   * THE SENTENCE NOW REPORTS, RATHER THAN RESTATING THE FORM.
   *
   * It read "You are asking for recipes that mention X. Six recipes were
   * considered and zero answer all one condition." Three faults in one
   * breath: it told the reader what they had just typed, it published the
   * size of the catalogue and the number of predicates evaluated, and
   * "all one condition" is not English — the plural agreement was
   * hardcoded against a design mock that happened to draw six filled
   * fields. Issue #21 quotes all three.
   *
   * What a reader wants is the answer, so the count is now the subject:
   * "No recipes mention “demi-glace”." The clauses are kept — they are the
   * honest half, and they are what makes an empty result legible — but
   * they now hang off the finding rather than off the asking.
   */
  const noun = KIND_NOUNS[kind ?? 'recipe'] ?? {
    one: 'recipe',
    many: 'recipes',
  };
  const one = total === 1;
  /* "No recipes mention X" rather than "Zero recipes mention X". `Cardinal`
     is right everywhere else on this page, but an empty result is the one
     sentence a reader is most likely to read closely, and "zero" is a
     figure where "no" is English. */
  const subject = `${total === 0 ? 'No' : Cardinal(total)} ${
    one ? noun.one : noun.many
  }`;

  const clauses = [
    query ? `${one ? 'mentions' : 'mention'} “${query}”` : null,
    ingredient.length
      ? `${one ? 'contains' : 'contain'} ${series(ingredient)}`
      : null,
    exclude.length ? `leave${one ? 's' : ''} out ${series(exclude)}` : null,
    cuisine.length ? `${one ? 'is' : 'are'} ${series(cuisineLabels)}` : null,
    technique.length ? `use${one ? 's' : ''} ${series(techniqueLabels)}` : null,
  ].filter(Boolean) as string[];

  const found = clauses.length
    ? `${subject} ${series(clauses)}.`
    : `${subject} ${one ? 'is' : 'are'} in the catalogue.`;

  /*
   * AND THE SENTENCE SAYS WHAT ELSE WAS LOOKED AT.
   *
   * This is the other half of issue #18, and the more important half. A
   * reader searched for a batch log that existed, was told "zero of six
   * recipes", and concluded the work had never been saved. The screen was
   * accurate and still produced the wrong conclusion, because the one fact
   * that mattered — that batch logs and notes were not searched at all —
   * was not among the many facts it printed. Now they are searched, and
   * the sentence says so whenever a free-text query ran, including when
   * the answer is none.
   */
  const runTotal = runs.data.total;
  const noteTotal = noteHits.data.total;
  const otherHalves = query
    ? ` ${runTotal === 0 ? 'No' : Cardinal(runTotal)} batch log` +
      `${runTotal === 1 ? '' : 's'} and ${
        noteTotal === 0 ? 'no' : cardinal(noteTotal)
      } note${noteTotal === 1 ? '' : 's'} also mention it.`
    : '';

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
          lede="Every search you run is a link you can keep, send or bookmark."
          ledeClassName="shell:max-w-205"
        />

        {/* R-CON-03. A plain GET form: shareable URLs, works without
            JavaScript, and the query string is the whole state. The screen
            no longer says so — see the note at the top of this file. */}
        <form
          method="GET"
          action="/search"
          className="flex w-full shrink-0 flex-col items-start gap-5"
        >
          {/* The design draws a meta on this head too, so the slot is kept
              and filled with what the reader can act on — how much there is
              to filter by — rather than with the form's method and action. */}
          <SectionHead
            ordinal="I"
            title="Query"
            meta={
              tagsKnown
                ? `${cardinal(cuisines.length)} cuisines · ${cardinal(techniques.length)} techniques`
                : undefined
            }
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

          <div className="flex w-full shrink-0 flex-row flex-wrap items-center gap-4">
            <Button type="submit">Search</Button>
            {/* The design's bare text control — 10px mono on no ground at
                all, and explicitly NOT F/Button (see `button.tsx`). A link
                back to the empty address clears the form with no script,
                which is the only way that works under R-CON-03. The label
                counted the fields; the reader does not need the number. */}
            <Link
              href="/search"
              className={cn(
                'text-10 font-mono tracking-label uppercase text-ink-3 no-underline hover:text-ink',
                '-my-1.5 inline-flex min-h-6 items-center',
                FOCUS_RING,
              )}
            >
              Clear the search
            </Link>
          </div>
        </form>

        {hasFilters && results.configured && !results.failed ? (
          <Notice title="What you asked for">
            {/* The hook is on the sentence, not on the Notice. `Notice`
                spreads props onto its root, and that root also holds the
                title span — so a hook there would capture "What you asked
                for" as well, and the test asserting the exact sentence
                would read the title with it. */}
            <span data-search-summary="">{found}</span>
            {otherHalves ? (
              <span data-search-elsewhere="">{otherHalves}</span>
            ) : null}
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
                  : total === 0
                    ? 'Nothing found'
                    : `${cardinal(total)} ${total === 1 ? noun.one : noun.many}`
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
              Nothing matched. Each field makes the search narrower. Remove one
              and try again.
            </Empty>
          ) : (
            <>
              {/* The design draws one full-width card per row here, not a
                  grid: `Results` is a `gap-[ 24px ]` column and the card
                  inside it is `w-full`. */}
              <RecipeGrid recipes={results.data.results} columns={1} />
              {counted && total < indexed ? (
                <Empty>
                  Nothing else matched. Remove a filter and more recipes appear.
                </Empty>
              ) : null}
            </>
          )}
        </div>

        {/*
          III and IV. Only drawn when there is free text, because that is
          the only field these two are matched on — see the read above.
          NOT `<article>`: `RecipeGrid` draws one per recipe and several
          tests count `main article` to mean "recipes came back". A batch
          log row that answered to that count would make an empty recipe
          result look full.
        */}
        {query && runs.configured && !runs.failed ? (
          <div className="flex w-full shrink-0 flex-col items-start gap-6">
            <SectionHead
              ordinal="III"
              title="Batch logs"
              meta={
                runTotal === 0
                  ? 'Nothing found'
                  : `${cardinal(runTotal)} run${runTotal === 1 ? '' : 's'}`
              }
            />
            {runTotal === 0 ? (
              <Empty>No batch log mentions it.</Empty>
            ) : (
              <ul
                data-search-runs=""
                className="m-0 flex w-full list-none flex-col items-start gap-4 p-0"
              >
                {runs.data.results.map((run) => (
                  <li key={run.slug} className="w-full">
                    <Link
                      href={batchLogPath(run)}
                      className={cn('text-16 font-sans', PROSE_LINK)}
                    >
                      {run.title}
                    </Link>
                    {run.summary ? (
                      <p className="m-0 text-14 leading-170 font-sans text-ink-2">
                        {run.summary}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {query && noteHits.configured && !noteHits.failed ? (
          <div className="flex w-full shrink-0 flex-col items-start gap-6">
            <SectionHead
              ordinal="IV"
              title="Notes"
              meta={
                noteTotal === 0
                  ? 'Nothing found'
                  : `${cardinal(noteTotal)} note${noteTotal === 1 ? '' : 's'}`
              }
            />
            {noteTotal === 0 ? (
              <Empty>No note mentions it.</Empty>
            ) : (
              <ul
                data-search-notes=""
                className="m-0 flex w-full list-none flex-col items-start gap-4 p-0"
              >
                {noteHits.data.results.map((note) => (
                  <li key={note.id} className="w-full">
                    <p className="m-0 text-14 leading-170 font-sans text-ink">
                      <span className="text-09 font-mono tracking-label uppercase text-ink-3">
                        {NOTE_KIND_LABELS[note.kind] ?? note.kind}
                      </span>{' '}
                      {note.title ? <strong>{note.title}. </strong> : null}
                      {note.excerpt}
                      {note.truncated ? '…' : ''}
                    </p>
                    {/* A note is not a page. The link goes to the record it
                        hangs off, which is where a reader can actually read
                        it — the whole point of returning notes at all. */}
                    {noteHref(note) ? (
                      <Link href={noteHref(note)!} className={PROSE_LINK}>
                        {note.attachedTo.title ?? note.attachedTo.slug}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
