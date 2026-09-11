import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * The reads an agent has, and the numbers they hand back.
 *
 * Three of the read tools had no test at all: `list_ingredients` was never
 * called, `list_experiments` only incidentally, and `get_repository_stats`
 * was asserted with `resolves.toBeTruthy()` — so all six counts the home
 * page prints could be wrong and nothing would go red. `search_recipes` was
 * called twice, with `query` and with `ingredients`, which leaves
 * `excludeIngredients`, `kind`, `categories`, `limit` and `offset`
 * unexercised. `excludeIngredients` is the allergy filter.
 *
 * WHY THE COUNTS ARE NOT HARD-CODED. The obvious test asserts the six exact
 * numbers of the seed. It would be green today and wrong tomorrow: this
 * suite writes to the same database, so the numbers move whenever anybody
 * adds a spec, and a test that has to be re-baselined by every other author
 * gets re-baselined without being read. Two shapes are used instead, and
 * between them they pin the same thing harder:
 *
 * - **Agreement.** Four of the six counts are also reachable through a read
 *   that lists the things being counted. A count that disagrees with its own
 *   list is wrong no matter what the seed holds.
 * - **Movement.** For the other two, a write of a known size is made and
 *   every count is asserted to move by exactly the amount that write added.
 */

const STATS_SLUG = 'data-reads-stats-subject';
const USAGE_SLUG = 'data-reads-usage-subject';
const WITH_SLUG = 'data-reads-with-sesame';
const WITHOUT_SLUG = 'data-reads-without-sesame';
const PREP_SLUG = 'data-reads-sesame-preparation';
const WEIGHED_RUN = 'data-reads-weighed-run';
const MIXED_RUN = 'data-reads-mixed-units-run';

const SEARCH_CUISINE = 'Data Reads Cuisine';

interface Stats {
  recipes: number;
  revisions: number;
  ingredients: number;
  terms: number;
  notes: number;
  experiments: number;
}

interface IngredientRow {
  slug: string;
  name: string;
  plural: string | null;
  category: string;
  aliases: string[];
  recipeCount: number;
}

interface ExperimentRow {
  slug: string;
  title: string;
  costTotal: number | null;
  currency: string | null;
  revisionNumber: number | null;
  raw: { value: number; unit: string } | null;
  finished: { value: number; unit: string } | null;
  recipe: { slug: string; title: string } | null;
}

interface SearchResult {
  results: { slug: string; title: string; kind: string }[];
  total: number;
}

function rw() {
  return mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
}

function stats(): Promise<Stats> {
  return rw().call<Stats>('get_repository_stats', {});
}

test.describe.configure({ mode: 'serial' });

test.describe('the read tools', () => {
  test('every count agrees with the list of the things it counts', async () => {
    const mcp = rw();

    // Sequential rather than in parallel: one client holds one MCP session,
    // and five calls racing to open it would each negotiate their own.
    const counts = await stats();
    const ingredients = await mcp.call<IngredientRow[]>('list_ingredients', {});
    const categories = await mcp.call<{ slug: string }[]>(
      'list_categories',
      {},
    );
    const experiments = await mcp.call<ExperimentRow[]>('list_experiments', {});
    const search = await mcp.call<SearchResult>('search_recipes', { limit: 1 });

    // A count is only useful if it counts the same thing the reader can
    // see. Each of these is the same fact read two ways: one aggregate
    // query in `getStats`, one list query somewhere else in `read.ts`.
    expect(counts.ingredients).toBe(ingredients.length);
    expect(counts.terms).toBe(categories.length);
    expect(counts.experiments).toBe(experiments.length);
    // `search_recipes` with no filter counts the active recipes, which is
    // what the recipe count means. `limit: 1` keeps the payload small; the
    // number under test is `total`, not the page.
    expect(counts.recipes).toBe(search.total);

    // Not zero, because every assertion above is satisfied by an empty
    // database and a broken connection reads exactly like one.
    expect(counts.recipes).toBeGreaterThan(0);
    expect(counts.revisions).toBeGreaterThanOrEqual(counts.recipes);
    expect(counts.notes).toBeGreaterThan(0);
  });

  test('each count moves by exactly what a write adds', async () => {
    const mcp = rw();
    const before = await stats();

    // One recipe, one revision, one ingredient nothing else uses, one tag
    // nothing else uses, two notes. Nothing here is incidental: a step with
    // a `technique` would mint a second tag, and a second new ingredient
    // name would move the ingredient count by two.
    await mcp.call('create_recipe', {
      title: 'Stats subject',
      slug: STATS_SLUG,
      kind: 'recipe',
      rationale: 'Written so the six counts can be watched moving.',
      categories: { cuisine: ['Data Reads Counting'] },
      ingredients: [{ name: 'Stats yuzu kosho', quantity: 2, unit: 'tsp' }],
      steps: [{ instruction: 'Stir it through at the end.' }],
      notes: [
        {
          kind: 'observation',
          title: 'It is saltier than it looks',
          body: 'Two teaspoons is enough for four people.',
        },
        {
          kind: 'idea',
          title: 'Try it on grilled leeks',
          body: 'Untested.',
        },
      ],
    });

    const afterCreate = await stats();
    expect(afterCreate.recipes).toBe(before.recipes + 1);
    expect(afterCreate.revisions).toBe(before.revisions + 1);
    expect(afterCreate.ingredients).toBe(before.ingredients + 1);
    expect(afterCreate.terms).toBe(before.terms + 1);
    expect(afterCreate.notes).toBe(before.notes + 2);
    expect(afterCreate.experiments).toBe(before.experiments);

    // A revision adds a version and no recipe. This is the count the home
    // page uses to say the repository keeps history rather than files.
    await mcp.call('revise_recipe', {
      slug: STATS_SLUG,
      rationale: 'Half the kosho. It buried the fish.',
      ingredients: [{ name: 'Stats yuzu kosho', quantity: 1, unit: 'tsp' }],
    });

    const afterRevise = await stats();
    expect(afterRevise.recipes).toBe(afterCreate.recipes);
    expect(afterRevise.revisions).toBe(afterCreate.revisions + 1);
    expect(afterRevise.ingredients).toBe(afterCreate.ingredients);
  });

  test('an ingredient is listed with its own fields and its usage', async () => {
    const mcp = rw();

    await mcp.call('upsert_ingredient', {
      name: 'Reads perilla',
      slug: 'data-reads-perilla',
      plural: 'Reads perillas',
      category: 'herb',
      aliases: ['reads shiso leaf'],
    });

    await mcp.call('create_recipe', {
      title: 'Usage subject',
      slug: USAGE_SLUG,
      kind: 'recipe',
      rationale: 'Uses the herb, so the usage count has something to count.',
      ingredients: [{ name: 'Reads perilla', quantity: 6, unit: 'leaf' }],
      steps: [{ instruction: 'Lay the leaves over the rice.' }],
    });

    const listed = (
      await mcp.call<IngredientRow[]>('list_ingredients', {})
    ).find((row) => row.slug === 'data-reads-perilla')!;

    expect(listed.name).toBe('Reads perilla');
    expect(listed.plural).toBe('Reads perillas');
    expect(listed.category).toBe('herb');
    expect(listed.aliases).toEqual(['reads shiso leaf']);
    expect(listed.recipeCount).toBe(1);

    // The count is over CURRENT revisions. A recipe that dropped the
    // ingredient last month must not still be counted as using it — that
    // number is what an agent reads to decide whether a name is already in
    // use before it invents a second one.
    await mcp.call('revise_recipe', {
      slug: USAGE_SLUG,
      rationale: 'The perilla was lost under the sauce. Out it goes.',
      ingredients: [{ name: 'Reads sushi rice', quantity: 300, unit: 'g' }],
    });

    const afterDrop = (
      await mcp.call<IngredientRow[]>('list_ingredients', {})
    ).find((row) => row.slug === 'data-reads-perilla')!;
    expect(afterDrop.recipeCount).toBe(0);

    // …and the detail read agrees with the list.
    const detail = await mcp.call<{
      ingredient: IngredientRow;
      recipes: { slug: string }[];
    }>('get_ingredient', { slug: 'data-reads-perilla' });
    expect(detail.recipes.map((r) => r.slug)).not.toContain(USAGE_SLUG);
    expect(detail.ingredient.recipeCount).toBe(0);
  });

  test('a filter that must not match is as load-bearing as one that must', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Dan dan noodles, with the paste',
      slug: WITH_SLUG,
      kind: 'recipe',
      rationale: 'The version somebody with a sesame allergy must not cook.',
      categories: { cuisine: [SEARCH_CUISINE] },
      ingredients: [
        { name: 'Reads sesame paste', quantity: 3, unit: 'tbsp' },
        { name: 'Reads wheat noodles', quantity: 400, unit: 'g' },
      ],
      steps: [{ instruction: 'Loosen the paste with stock.' }],
    });

    await mcp.call('create_recipe', {
      title: 'Dan dan noodles, without the paste',
      slug: WITHOUT_SLUG,
      kind: 'recipe',
      rationale: 'The same dish for somebody who cannot eat sesame.',
      categories: { cuisine: [SEARCH_CUISINE] },
      ingredients: [
        { name: 'Reads sunflower butter', quantity: 3, unit: 'tbsp' },
        { name: 'Reads wheat noodles', quantity: 400, unit: 'g' },
      ],
      steps: [{ instruction: 'Loosen the butter with stock.' }],
    });

    // The filter that must match.
    const included = await mcp.call<SearchResult>('search_recipes', {
      ingredients: ['Reads sesame paste'],
      limit: 100,
    });
    expect(included.results.map((r) => r.slug)).toEqual([WITH_SLUG]);

    // The filter that must NOT match. This is the one on `/search` labelled
    // "must exclude", and the one an agent uses for an allergy. A filter
    // that silently stops filtering returns MORE, so it reads as success.
    const excluded = await mcp.call<SearchResult>('search_recipes', {
      excludeIngredients: ['Reads sesame paste'],
      limit: 100,
    });
    const excludedSlugs = excluded.results.map((r) => r.slug);
    expect(excludedSlugs).not.toContain(WITH_SLUG);
    expect(excludedSlugs).toContain(WITHOUT_SLUG);

    // And the two halves partition the repository. This is the assertion
    // that catches the filter going quiet: an `excludeIngredients` that
    // stopped filtering returns everything, so `excluded.total` would equal
    // the whole and the two halves would overshoot it by exactly the number
    // of recipes that use sesame paste.
    const all = await mcp.call<SearchResult>('search_recipes', { limit: 1 });
    expect(included.total + excluded.total).toBe(all.total);
    expect(included.total).toBeGreaterThan(0);
  });

  test('every filter must agree, and a kind narrows the set', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Sesame paste, made at home',
      slug: PREP_SLUG,
      kind: 'preparation',
      rationale: 'A component, so `kind` has two values to tell apart.',
      categories: { cuisine: [SEARCH_CUISINE] },
      ingredients: [
        { name: 'Reads sesame seed', quantity: 300, unit: 'g' },
        { name: 'Reads sesame paste', quantity: 1, unit: 'tbsp' },
      ],
      steps: [{ instruction: 'Toast, then grind to a paste.' }],
    });

    const byCuisine = await mcp.call<SearchResult>('search_recipes', {
      categories: { cuisine: [SEARCH_CUISINE] },
      limit: 100,
    });
    expect(new Set(byCuisine.results.map((r) => r.slug))).toEqual(
      new Set([WITH_SLUG, WITHOUT_SLUG, PREP_SLUG]),
    );

    // Conjunctive: the cuisine AND the ingredient, not either.
    const both = await mcp.call<SearchResult>('search_recipes', {
      categories: { cuisine: [SEARCH_CUISINE] },
      ingredients: ['Reads sesame paste'],
      limit: 100,
    });
    expect(new Set(both.results.map((r) => r.slug))).toEqual(
      new Set([WITH_SLUG, PREP_SLUG]),
    );

    // …and the kind on top of both.
    const narrowed = await mcp.call<SearchResult>('search_recipes', {
      categories: { cuisine: [SEARCH_CUISINE] },
      ingredients: ['Reads sesame paste'],
      kind: 'preparation',
      limit: 100,
    });
    expect(narrowed.results.map((r) => r.slug)).toEqual([PREP_SLUG]);
    expect(narrowed.results[0]!.kind).toBe('preparation');
  });

  test('a page is a page of a total, and the total does not move with it', async () => {
    const mcp = rw();

    const scope = {
      categories: { cuisine: [SEARCH_CUISINE] },
      ingredients: ['Reads sesame paste'],
    };

    const whole = await mcp.call<SearchResult>('search_recipes', {
      ...scope,
      limit: 100,
    });
    expect(whole.total).toBe(2);

    const first = await mcp.call<SearchResult>('search_recipes', {
      ...scope,
      limit: 1,
      offset: 0,
    });
    const second = await mcp.call<SearchResult>('search_recipes', {
      ...scope,
      limit: 1,
      offset: 1,
    });

    expect(first.results).toHaveLength(1);
    expect(second.results).toHaveLength(1);
    // The count a caller pages against is the size of the whole answer, not
    // the size of the page. A `total` that followed `limit` would tell an
    // agent it had read everything after one page.
    expect(first.total).toBe(2);
    expect(second.total).toBe(2);
    // Two pages of one, and they are not the same recipe.
    expect(first.results[0]!.slug).not.toBe(second.results[0]!.slug);
    expect(new Set([first.results[0]!.slug, second.results[0]!.slug])).toEqual(
      new Set(whole.results.map((r) => r.slug)),
    );
  });

  test('a run is summed by what was measured, never by what was projected', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Weighed run subject',
      slug: 'data-reads-weighed-recipe',
      kind: 'recipe',
      rationale: 'A recipe for the run to have been cooking.',
      ingredients: [{ name: 'Reads beef silverside', quantity: 5, unit: 'kg' }],
      steps: [{ instruction: 'Hang until it is ready.' }],
    });

    await mcp.call('log_experiment', {
      slug: WEIGHED_RUN,
      title: 'Weighed run',
      recipeSlug: 'data-reads-weighed-recipe',
      startedAt: '2026-02-01',
      costTotal: 62.4,
      currency: 'EUR',
      items: [{ label: 'A1' }, { label: 'A2' }],
      observations: [
        // `net_weight` is the meat after the hook, and it is preferred over
        // `initial_weight` rather than added to it. Both are recorded here
        // on purpose: a sum of the two would read 1500.
        { item: 'A1', metric: 'net_weight', value: 500, unit: 'g' },
        { item: 'A2', metric: 'net_weight', value: 400, unit: 'g' },
        { item: 'A1', metric: 'initial_weight', value: 600, unit: 'g' },
        { item: 'A1', metric: 'final_weight', value: 220, unit: 'g' },
        { item: 'A2', metric: 'final_weight', value: 180, unit: 'g' },
        // A projection, not a measurement. It has no business in a ledger.
        { item: 'A1', metric: 'expected_dried_weight', value: 225, unit: 'g' },
      ],
    });

    const run = (await mcp.call<ExperimentRow[]>('list_experiments', {})).find(
      (row) => row.slug === WEIGHED_RUN,
    )!;

    expect(run.raw).toEqual({ value: 900, unit: 'g' });
    expect(run.finished).toEqual({ value: 400, unit: 'g' });
    expect(run.costTotal).toBe(62.4);
    expect(run.currency).toBe('EUR');
    expect(run.recipe?.slug).toBe('data-reads-weighed-recipe');
    // The run records which version it was cooking, which is what makes a
    // measurement citable in a later revision's rationale.
    expect(run.revisionNumber).toBe(1);
  });

  test('a metric recorded in two units is dropped, not added up', async () => {
    const mcp = rw();

    await mcp.call('log_experiment', {
      slug: MIXED_RUN,
      title: 'Mixed units run',
      startedAt: '2026-02-02',
      items: [{ label: 'B1' }, { label: 'B2' }],
      observations: [
        { item: 'B1', metric: 'net_weight', value: 500, unit: 'g' },
        { item: 'B2', metric: 'net_weight', value: 1.2, unit: 'kg' },
        { item: 'B1', metric: 'final_weight', value: 300, unit: 'g' },
      ],
    });

    const run = (await mcp.call<ExperimentRow[]>('list_experiments', {})).find(
      (row) => row.slug === MIXED_RUN,
    )!;

    // 500 and 1.2 are not 501.2 of anything, and the panel has no unit to
    // put on the number. So the figure is absent and the row draws what it
    // has, rather than drawing a number nobody measured.
    expect(run.raw).toBeNull();
    // The other figure is unaffected: one broken metric does not blank the
    // run.
    expect(run.finished).toEqual({ value: 300, unit: 'g' });
    // A run that names no recipe still lists, with a null recipe.
    expect(run.recipe).toBeNull();
  });
});
