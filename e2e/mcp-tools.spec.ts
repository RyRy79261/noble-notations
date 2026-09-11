import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * The tools and the arguments the contract suite never reaches.
 *
 * `mcp-contract.spec.ts` is organised around the defects that were reported.
 * This file is organised around a coverage audit: every one of these tests
 * exists because a named piece of behaviour could be deleted from
 * `src/lib/queries/` and the whole suite would stay green. Each block says
 * which piece, and what a reader or an agent would be handed instead.
 *
 * Everything here writes under its own `mcp-tools-` prefix, so it shares no
 * row with another spec and can be read on its own.
 */

const GALANGAL = 'mcp-tools-galangal';
const GALANGAL_NAME = 'Contract galangal';
const KHA_SLUG = 'mcp-tools-tom-kha';

const RUN_SLUG = 'mcp-tools-run-weighed';
const RUN_NO_FINISH_SLUG = 'mcp-tools-run-not-weighed-out';
const RUN_TWO_UNITS_SLUG = 'mcp-tools-run-two-units';
const RUN_RECIPE_SLUG = 'mcp-tools-biltong-run';

const COUNTED_INGREDIENT = 'mcp-tools-counted';
const COUNTED_TAG = 'mcp-tools-counted-tag';
const COUNTED_RECIPE = 'mcp-tools-counted-recipe';
const COUNTED_RUN = 'mcp-tools-counted-run';

const ZORB_BEEF = 'mcp-tools-zorb-beef';
const ZORB_CHILLI = 'mcp-tools-zorb-chilli';
const ZORB_STEW = 'mcp-tools-zorbulax-stew';
const ZORB_PASTE = 'mcp-tools-zorbulax-paste';

const NOTED_RECIPE = 'mcp-tools-noted-recipe';
const NOTED_RUN = 'mcp-tools-noted-run';

const SUB_A = 'mcp-tools-espelette';
const SUB_B = 'mcp-tools-aleppo';
const SUB_C = 'mcp-tools-cayenne';

const SHOP_SALT = 'mcp-tools-shop-salt';
const SHOP_PEPPER = 'mcp-tools-shop-pepper';
const SHOP_ONE = 'mcp-tools-shop-one';
const SHOP_TWO = 'mcp-tools-shop-two';

const RACE_SLUG = 'mcp-tools-lardo-race';
const ROLLBACK_SLUG = 'mcp-tools-rollback';

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
  description: string | null;
  densityGPerMl: number | null;
  defaultUnit: string | null;
  aliases: string[];
  recipeCount: number;
}

interface IngredientResult {
  ingredient: IngredientRow;
  substitutes: { slug: string; name: string }[];
  notes: { id: string; kind: string; title: string | null; body: string }[];
}

interface ExperimentRow {
  slug: string;
  title: string;
  startedAt: string | null;
  costTotal: number | null;
  currency: string | null;
  revisionNumber: number | null;
  raw: { value: number; unit: string } | null;
  finished: { value: number; unit: string } | null;
  recipe: { slug: string; title: string } | null;
}

interface ExperimentResult {
  slug: string;
  notes: { id: string; kind: string; title: string | null }[];
}

interface SearchResult {
  total: number;
  results: { slug: string; title: string; kind: string }[];
}

interface RecipeResult {
  slug: string;
  revision: { revisionNumber: number };
  notes: { id: string; kind: string; title: string | null }[];
  revisions: { revisionNumber: number; rationale: string | null }[];
}

interface WriteResult {
  slug: string;
  revisionNumber: number;
}

interface ShoppingResult {
  recipes: { slug: string; title: string }[];
  missing: string[];
  groups: {
    category: string;
    entries: {
      slug: string | null;
      name: string;
      amounts: string[];
      unquantified: boolean;
      from: { slug: string; title: string; text: string }[];
    }[];
  }[];
}

/**
 * The message off a refused call, without the throw.
 *
 * The same helper `mcp-contract.spec.ts` carries, and for the same reason:
 * half of what these tests assert is what a message must NOT say, and a
 * negated `rejects.toThrow` cannot tell a call that failed differently from
 * one that never failed at all.
 */
async function refusal(call: Promise<unknown>): Promise<string> {
  try {
    await call;
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('The call was accepted. It had to be refused.');
}

function rw() {
  return mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
}

function stats(client: ReturnType<typeof rw>) {
  return client.call<Stats>('get_repository_stats', {});
}

function entries(list: ShoppingResult) {
  return list.groups.flatMap((group) => group.entries);
}

/** A recipe carrying one science note with no conditions on it — the state
    `describe_mechanism` exists to fill. */
function mcp_create_race_recipe(client: ReturnType<typeof rw>) {
  return client.call('create_recipe', {
    title: 'Lardo, for two connectors at once',
    slug: RACE_SLUG,
    kind: 'recipe',
    rationale: 'A version whose mechanism note states no conditions yet.',
    ingredients: [{ name: 'Pork back fat', quantity: 3, unit: 'kg' }],
    steps: [{ instruction: 'Bury the fat in salt and hold it cold.' }],
    notes: [
      {
        kind: 'science',
        title: 'Salt drives the water out',
        body: 'Salt lowers the water activity until spoilage organisms stop.',
      },
    ],
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('MCP tools', () => {
  // ───────────────────────────────────────────────────────────────────────
  // list_ingredients
  // ───────────────────────────────────────────────────────────────────────

  /**
   * `list_ingredients` was called by no test at all. It appeared only in the
   * registry name list, which asserts that the tool exists and nothing about
   * what it answers.
   *
   * It is the tool the guide tells an agent to call before naming an
   * ingredient — "coriander and cilantro should be one ingredient with an
   * alias, not two" — so the fields that make that decision possible are the
   * product: the aliases, and the count that says whether anything uses the
   * row. A list that carried names alone would read as a working answer and
   * would send an agent to create a duplicate.
   */
  test('list_ingredients gives every stored field, and counts what uses one', async () => {
    const mcp = rw();

    await mcp.call('upsert_ingredient', {
      name: GALANGAL_NAME,
      slug: GALANGAL,
      plural: 'Contract galangals',
      category: 'produce',
      description: 'A rhizome. Sharper and more resinous than ginger.',
      densityGPerMl: 0.6,
      defaultUnit: 'g',
      aliases: ['contract kha', 'contract laos root'],
    });

    const listed = async () =>
      (await mcp.call<IngredientRow[]>('list_ingredients', {})).find(
        (row) => row.slug === GALANGAL,
      )!;

    const bare = await listed();
    expect(bare.name).toBe(GALANGAL_NAME);
    expect(bare.plural).toBe('Contract galangals');
    expect(bare.category).toBe('produce');
    expect(bare.description).toMatch(/rhizome/);
    expect(bare.densityGPerMl).toBe(0.6);
    expect(bare.defaultUnit).toBe('g');
    expect(bare.aliases.sort()).toEqual(['contract kha', 'contract laos root']);
    // Nothing uses it yet, and the count says so rather than being absent.
    expect(bare.recipeCount).toBe(0);

    await mcp.call('create_recipe', {
      title: 'Tom kha, for the ingredient index',
      slug: KHA_SLUG,
      kind: 'recipe',
      rationale: 'One recipe, so the ingredient has a user to be counted.',
      ingredients: [{ name: GALANGAL_NAME, quantity: 30, unit: 'g' }],
      steps: [{ instruction: 'Bruise the galangal and simmer it in coconut.' }],
    });

    const used = await listed();
    expect(used.recipeCount).toBe(1);

    // The index and the detail read the same row. A list that drifts from
    // `get_ingredient` is worse than one that is missing, because an agent
    // decides from the list and writes against the detail.
    const detail = await mcp.call<IngredientResult>('get_ingredient', {
      slug: GALANGAL,
    });
    expect(detail.ingredient.name).toBe(used.name);
    expect(detail.ingredient.aliases.sort()).toEqual(used.aliases.sort());
    expect(detail.ingredient.densityGPerMl).toBe(used.densityGPerMl);
    expect(detail.ingredient.recipeCount).toBe(used.recipeCount);
  });

  // ───────────────────────────────────────────────────────────────────────
  // list_experiments
  // ───────────────────────────────────────────────────────────────────────

  /**
   * `list_experiments` was called once in the whole suite, incidentally,
   * inside a re-log test that read one field off it.
   *
   * The two figures it computes are drawn nowhere else. `raw` and `finished`
   * are sums over `experiment_observations` made by `experimentWeights`,
   * and both batch-log indexes print them as RAW and DRIED with a YIELD
   * derived from the pair. Every one of those numbers could be wrong — or
   * silently absent — with the whole suite green.
   *
   * The two negative cases are the ones that carry a rule rather than a
   * value. A run that never weighed anything out must have no DRIED figure
   * (R-STA-05), not a zero; and a metric recorded in two units must be
   * dropped, because a sum across two units is a number with no meaning.
   */
  test('list_experiments sums what went in and what came out', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Biltong, for the run index',
      slug: RUN_RECIPE_SLUG,
      kind: 'recipe',
      rationale: 'A recipe for the runs below to be cooking.',
      ingredients: [{ name: 'Beef silverside', quantity: 2, unit: 'kg' }],
      steps: [{ instruction: 'Hang the strips in moving air.' }],
    });

    await mcp.call('log_experiment', {
      slug: RUN_SLUG,
      title: 'A run that was weighed at both ends',
      recipeSlug: RUN_RECIPE_SLUG,
      revisionNumber: 1,
      startedAt: '2026-02-01',
      costTotal: 34.5,
      currency: 'EUR',
      items: [{ label: 'A1' }, { label: 'A2' }],
      observations: [
        { item: 'A1', metric: 'net_weight', value: 1000, unit: 'g' },
        { item: 'A2', metric: 'net_weight', value: 500, unit: 'g' },
        { item: 'A1', metric: 'final_weight', value: 420, unit: 'g' },
      ],
    });

    const row = async (slug: string) =>
      (await mcp.call<ExperimentRow[]>('list_experiments', {})).find(
        (candidate) => candidate.slug === slug,
      )!;

    const weighed = await row(RUN_SLUG);
    expect(weighed.recipe).toEqual({
      slug: RUN_RECIPE_SLUG,
      title: 'Biltong, for the run index',
    });
    expect(weighed.revisionNumber).toBe(1);
    expect(weighed.startedAt).toBe('2026-02-01');
    expect(weighed.costTotal).toBe(34.5);
    expect(weighed.currency).toBe('EUR');
    // Two items, one figure: the index adds them, and keeps the unit.
    expect(weighed.raw).toEqual({ value: 1500, unit: 'g' });
    expect(weighed.finished).toEqual({ value: 420, unit: 'g' });

    // R-STA-05: nothing came out, so there is no figure for what came out.
    // A zero here would draw a 0% yield on a run that is still hanging.
    await mcp.call('log_experiment', {
      slug: RUN_NO_FINISH_SLUG,
      title: 'A run that is still hanging',
      recipeSlug: RUN_RECIPE_SLUG,
      startedAt: '2026-02-02',
      items: [{ label: 'B1' }],
      observations: [
        { item: 'B1', metric: 'net_weight', value: 800, unit: 'g' },
      ],
    });
    const hanging = await row(RUN_NO_FINISH_SLUG);
    expect(hanging.raw).toEqual({ value: 800, unit: 'g' });
    expect(hanging.finished).toBeNull();

    // One metric, two units. 1 kg and 300 g are not 301 of anything, and
    // they are not 1.3 kg either unless somebody converts them — which this
    // aggregate deliberately does not do. The figure is dropped.
    await mcp.call('log_experiment', {
      slug: RUN_TWO_UNITS_SLUG,
      title: 'A run weighed in two units',
      recipeSlug: RUN_RECIPE_SLUG,
      startedAt: '2026-02-03',
      items: [{ label: 'C1' }, { label: 'C2' }],
      observations: [
        { item: 'C1', metric: 'net_weight', value: 1, unit: 'kg' },
        { item: 'C2', metric: 'net_weight', value: 300, unit: 'g' },
      ],
    });
    const mixed = await row(RUN_TWO_UNITS_SLUG);
    expect(mixed.raw).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────
  // get_repository_stats
  // ───────────────────────────────────────────────────────────────────────

  /**
   * The only assertion this tool had was `resolves.toBeTruthy()`.
   *
   * It returns the six counts the home page prints. Every one of them could
   * have been reading the wrong table, and the site and the connector would
   * have agreed on the same wrong number, because both read this function.
   *
   * The cross-check is the honest way to test it against a database the rest
   * of the suite is also writing to: four of the six counts have a tool that
   * lists the same rows, so the count and the list must agree without either
   * one being pinned to a constant. `search_recipes` with no filter counts
   * active recipes through a completely separate SQL statement, which is
   * what makes it a check rather than a restatement.
   */
  test('the six counts agree with the tools that list the same rows', async () => {
    const mcp = rw();
    const counted = await stats(mcp);

    const ingredients = await mcp.call<IngredientRow[]>('list_ingredients', {});
    expect(counted.ingredients).toBe(ingredients.length);

    const terms = await mcp.call<unknown[]>('list_categories', {});
    expect(counted.terms).toBe(terms.length);

    const runs = await mcp.call<ExperimentRow[]>('list_experiments', {});
    expect(counted.experiments).toBe(runs.length);

    // `total` is a window count over every matching row, so one result is
    // enough to read the whole figure.
    const search = await mcp.call<SearchResult>('search_recipes', {
      limit: 1,
    });
    expect(counted.recipes).toBe(search.total);
  });

  /**
   * The other two counts — revisions and notes — have no listing tool, so
   * they are pinned by what a write moves.
   *
   * Each step below asserts the count it should move AND the five it should
   * not. That is the assertion that survives a shared database: two counts
   * wired to each other's table pass a test that only checks one of them.
   */
  test('each write moves exactly the count it belongs to', async () => {
    const mcp = rw();

    const before = await stats(mcp);

    await mcp.call('upsert_ingredient', {
      name: 'Contract counted spice',
      slug: COUNTED_INGREDIENT,
      category: 'spice',
    });
    const withIngredient = await stats(mcp);
    expect(withIngredient).toEqual({
      ...before,
      ingredients: before.ingredients + 1,
    });

    await mcp.call('upsert_category', {
      categoryType: 'technique',
      slug: COUNTED_TAG,
      label: 'Contract counting',
    });
    const withTag = await stats(mcp);
    expect(withTag).toEqual({
      ...withIngredient,
      terms: withIngredient.terms + 1,
    });

    // One recipe, one revision, one note — and an ingredient line naming the
    // canonical row that already exists, so nothing new is created for it.
    await mcp.call('create_recipe', {
      title: 'A recipe that is counted',
      slug: COUNTED_RECIPE,
      kind: 'recipe',
      rationale: 'Written to be counted, and for no other reason.',
      ingredients: [{ name: 'Contract counted spice', quantity: 5, unit: 'g' }],
      steps: [{ instruction: 'Toast the spice until it smells of itself.' }],
      notes: [
        {
          kind: 'observation',
          body: 'One note, so the note count has one thing to count.',
        },
      ],
    });
    const withRecipe = await stats(mcp);
    expect(withRecipe).toEqual({
      ...withTag,
      recipes: withTag.recipes + 1,
      revisions: withTag.revisions + 1,
      notes: withTag.notes + 1,
    });

    await mcp.call('revise_recipe', {
      slug: COUNTED_RECIPE,
      rationale: 'A second version, so the revision count moves alone.',
    });
    const withRevision = await stats(mcp);
    expect(withRevision).toEqual({
      ...withRecipe,
      revisions: withRecipe.revisions + 1,
    });

    await mcp.call('add_note', {
      recipeSlug: COUNTED_RECIPE,
      kind: 'idea',
      body: 'A second note, added on its own.',
    });
    const withNote = await stats(mcp);
    expect(withNote).toEqual({
      ...withRevision,
      notes: withRevision.notes + 1,
    });

    await mcp.call('log_experiment', {
      slug: COUNTED_RUN,
      title: 'A run that is counted',
      recipeSlug: COUNTED_RECIPE,
    });
    const withRun = await stats(mcp);
    expect(withRun).toEqual({
      ...withNote,
      experiments: withNote.experiments + 1,
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // search_recipes
  // ───────────────────────────────────────────────────────────────────────

  /**
   * `search_recipes` is called twice in the whole suite, with `query` and
   * with `ingredients`. Five of its seven arguments were never sent.
   *
   * `excludeIngredients` is the one that matters most. It is the allergy
   * filter — the tool description sells it as "dan dan noodles without
   * sesame paste" — and the loop that applies it could iterate an empty
   * array with nothing failing. A filter that silently stops filtering
   * hands back a recipe containing the thing somebody asked to avoid, and
   * says nothing about it.
   */
  test('every search filter narrows, and the excluded ingredient is ruled out', async () => {
    const mcp = rw();

    await mcp.call('upsert_ingredient', {
      name: 'Contract zorb beef',
      slug: ZORB_BEEF,
      category: 'protein',
    });
    await mcp.call('upsert_ingredient', {
      name: 'Contract zorb chilli',
      slug: ZORB_CHILLI,
      category: 'spice',
    });

    await mcp.call('create_recipe', {
      title: 'Zorbulax stew',
      slug: ZORB_STEW,
      kind: 'recipe',
      rationale: 'One of two recipes that share a word nothing else uses.',
      categories: { cuisine: ['Contract Zorbland'] },
      ingredients: [{ name: 'Contract zorb beef', quantity: 1, unit: 'kg' }],
      steps: [{ instruction: 'Simmer the beef until it gives.' }],
    });
    await mcp.call('create_recipe', {
      title: 'Zorbulax paste',
      slug: ZORB_PASTE,
      kind: 'preparation',
      rationale: 'The second of the pair, and the one with no beef in it.',
      ingredients: [{ name: 'Contract zorb chilli', quantity: 60, unit: 'g' }],
      steps: [{ instruction: 'Pound the chillies to a paste.' }],
    });

    const slugs = async (args: Record<string, unknown>) =>
      (await mcp.call<SearchResult>('search_recipes', args)).results.map(
        (hit) => hit.slug,
      );

    // The word is in both titles and nothing else in the repository.
    const both = await mcp.call<SearchResult>('search_recipes', {
      query: 'Zorbulax',
    });
    expect(both.results.map((hit) => hit.slug).sort()).toEqual(
      [ZORB_PASTE, ZORB_STEW].sort(),
    );
    expect(both.total).toBe(2);

    // The filter that must hold: the beef recipe is not in the answer.
    const withoutBeef = await slugs({
      query: 'Zorbulax',
      excludeIngredients: ['Contract zorb beef'],
    });
    expect(withoutBeef).toEqual([ZORB_PASTE]);

    // And on its own, with no free text beside it, which is the shape an
    // agent building "what can I cook without X" actually sends.
    expect(
      await slugs({ excludeIngredients: ['Contract zorb beef'] }),
    ).not.toContain(ZORB_STEW);

    // The positive filter, for the same pair, so the two are read against
    // each other rather than against nothing.
    expect(await slugs({ ingredients: ['Contract zorb beef'] })).toContain(
      ZORB_STEW,
    );
    expect(await slugs({ ingredients: ['Contract zorb beef'] })).not.toContain(
      ZORB_PASTE,
    );

    // `kind`, which separates a component from a dish everywhere on the site.
    expect(await slugs({ query: 'Zorbulax', kind: 'preparation' })).toEqual([
      ZORB_PASTE,
    ]);
    expect(await slugs({ query: 'Zorbulax', kind: 'recipe' })).toEqual([
      ZORB_STEW,
    ]);

    // A category filter, on the tag the stew carries and the paste does not.
    expect(
      await slugs({
        query: 'Zorbulax',
        categories: { cuisine: ['Contract Zorbland'] },
      }),
    ).toEqual([ZORB_STEW]);

    // Paging. `total` is the whole match, not the page, which is what lets a
    // caller know there is a second page at all.
    const first = await mcp.call<SearchResult>('search_recipes', {
      query: 'Zorbulax',
      limit: 1,
    });
    expect(first.results).toHaveLength(1);
    expect(first.total).toBe(2);

    const second = await mcp.call<SearchResult>('search_recipes', {
      query: 'Zorbulax',
      limit: 1,
      offset: 1,
    });
    expect(second.results).toHaveLength(1);
    expect(second.total).toBe(2);
    expect(second.results[0]!.slug).not.toBe(first.results[0]!.slug);
  });

  // ───────────────────────────────────────────────────────────────────────
  // add_note — the three targets nothing ever used
  // ───────────────────────────────────────────────────────────────────────

  /**
   * `add_note` resolves four targets. Every call in the suite used one of
   * them.
   *
   * A note attached to an ingredient is drawn on `/ingredients/[slug]`; one
   * attached to a run is drawn on `/batch-logs/[log]`; one attached to a
   * version is drawn on that version and on no other. If any of the three
   * had silently attached to nothing, the write would still have answered
   * with a note id and nothing would have failed.
   *
   * The last pair of assertions is the one that gives `revisionNumber` its
   * meaning. A recipe-level note follows the recipe forward into every
   * version; a revision-level note stays on the version it was written
   * about. A revision note that leaked forward would tell a cook that this
   * version has a problem the next version fixed.
   */
  test('a note attaches to an ingredient, to a run, and to one version', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'A recipe with notes in three places',
      slug: NOTED_RECIPE,
      kind: 'recipe',
      rationale: 'The first version, and the one the revision note is about.',
      ingredients: [{ name: GALANGAL_NAME, quantity: 20, unit: 'g' }],
      steps: [{ instruction: 'Slice the galangal thin.' }],
    });
    await mcp.call('log_experiment', {
      slug: NOTED_RUN,
      title: 'A run with a note of its own',
      recipeSlug: NOTED_RECIPE,
    });

    await mcp.call('add_note', {
      ingredientSlug: GALANGAL,
      kind: 'observation',
      title: 'It goes woody at the wide end',
      body: 'Cut from the narrow end. The wide end is fibrous enough to blunt a knife.',
    });
    const ingredient = await mcp.call<IngredientResult>('get_ingredient', {
      slug: GALANGAL,
    });
    expect(ingredient.notes.map((note) => note.title)).toContain(
      'It goes woody at the wide end',
    );

    await mcp.call('add_note', {
      experimentSlug: NOTED_RUN,
      kind: 'result',
      title: 'The run came out light',
      body: 'The strips lost more than the usual share of their weight.',
    });
    const run = await mcp.call<ExperimentResult>('get_experiment', {
      slug: NOTED_RUN,
    });
    expect(run.notes.map((note) => note.title)).toContain(
      'The run came out light',
    );

    // A note about version 1, written after version 2 exists.
    await mcp.call('add_note', {
      recipeSlug: NOTED_RECIPE,
      kind: 'warning',
      title: 'Version one cut the galangal too thick',
      body: 'The slices did not give up their aroma in the time the step allows.',
      revisionNumber: 1,
    });
    // And a note about the recipe itself, which belongs to no one version.
    await mcp.call('add_note', {
      recipeSlug: NOTED_RECIPE,
      kind: 'idea',
      title: 'Try it with fresh turmeric beside the galangal',
      body: 'Untried. The two rhizomes are used together further south.',
    });
    await mcp.call('revise_recipe', {
      slug: NOTED_RECIPE,
      rationale: 'Thinner slices, so the aroma has time to come out.',
      steps: [
        { instruction: 'Slice the galangal to the thickness of a coin.' },
      ],
    });

    const titles = (recipe: RecipeResult) =>
      recipe.notes.map((note) => note.title);

    const first = await mcp.call<RecipeResult>('get_recipe', {
      slug: NOTED_RECIPE,
      revisionNumber: 1,
    });
    expect(titles(first)).toContain('Version one cut the galangal too thick');

    const current = await mcp.call<RecipeResult>('get_recipe', {
      slug: NOTED_RECIPE,
    });
    expect(current.revision.revisionNumber).toBe(2);
    // The version note stayed on the version it was written about.
    expect(titles(current)).not.toContain(
      'Version one cut the galangal too thick',
    );
    // The recipe note came forward, because it was never about a version.
    expect(titles(current)).toContain(
      'Try it with fresh turmeric beside the galangal',
    );
    expect(titles(first)).toContain(
      'Try it with fresh turmeric beside the galangal',
    );
  });

  /**
   * Each target has its own refusal, and each one was unexercised.
   *
   * A note whose target could not be found must not be written anywhere.
   * The count assertion at the end is what says so: six refusals, and the
   * repository holds exactly as many notes as it did before.
   */
  test('a note that names nothing is refused, and names what it looked for', async () => {
    const mcp = rw();
    const before = await stats(mcp);

    const missingIngredient = await refusal(
      mcp.call('add_note', {
        ingredientSlug: 'mcp-tools-no-such-ingredient',
        kind: 'observation',
        body: 'Attached to an ingredient that is not there.',
      }),
    );
    expect(missingIngredient).toContain('mcp-tools-no-such-ingredient');
    expect(missingIngredient).not.toMatch(/internal error/i);

    const missingRun = await refusal(
      mcp.call('add_note', {
        experimentSlug: 'mcp-tools-no-such-run',
        kind: 'observation',
        body: 'Attached to a run that is not there.',
      }),
    );
    expect(missingRun).toContain('mcp-tools-no-such-run');
    expect(missingRun).not.toMatch(/internal error/i);

    // The recipe exists; the version does not. The message has to name the
    // number, because a caller that guessed a version has no other way to
    // learn how many there are.
    const missingRevision = await refusal(
      mcp.call('add_note', {
        recipeSlug: NOTED_RECIPE,
        revisionNumber: 99,
        kind: 'observation',
        body: 'Attached to a version that was never written.',
      }),
    );
    expect(missingRevision).toContain(NOTED_RECIPE);
    expect(missingRevision).toContain('99');
    expect(missingRevision).not.toMatch(/internal error/i);

    // A version number with no recipe beside it names nothing at all. It
    // used to be dropped without a word.
    expect(
      await refusal(
        mcp.call('add_note', {
          revisionNumber: 1,
          kind: 'observation',
          body: 'A version of what?',
        }),
      ),
    ).toMatch(/revisionNumber/);

    // No target, and two targets. Both are the same mistake seen from the
    // two sides, and the message names all three fields either way.
    for (const args of [
      {},
      { recipeSlug: NOTED_RECIPE, ingredientSlug: GALANGAL },
    ]) {
      const message = await refusal(
        mcp.call('add_note', {
          ...args,
          kind: 'observation',
          body: 'Exactly one target, please.',
        }),
      );
      expect(message).toMatch(/recipeSlug/);
      expect(message).toMatch(/ingredientSlug/);
      expect(message).toMatch(/experimentSlug/);
    }

    expect(await stats(mcp)).toEqual(before);
  });

  // ───────────────────────────────────────────────────────────────────────
  // upsert_ingredient — substitutes
  // ───────────────────────────────────────────────────────────────────────

  /**
   * `substitutes` is the one field of `upsert_ingredient` with no test.
   *
   * It has two rules, both deliberate and neither visible from the result:
   * the relation is written in both directions, because a cook standing in
   * front of the wrong chilli asks the question from whichever side they
   * are on; and a later call adds rather than replaces, unlike `aliases`.
   * `get_ingredient` reads one direction only, so a write that stopped
   * recording the reverse would leave "what can stand in for this" answering
   * correctly from one row and emptily from the other.
   */
  test('a substitute is recorded both ways, and a later call adds to it', async () => {
    const mcp = rw();

    for (const [slug, name] of [
      [SUB_A, 'Contract espelette'],
      [SUB_B, 'Contract aleppo'],
      [SUB_C, 'Contract cayenne'],
    ] as const) {
      await mcp.call('upsert_ingredient', { name, slug, category: 'spice' });
    }

    const subs = async (slug: string) =>
      (await mcp.call<IngredientResult>('get_ingredient', { slug })).substitutes
        .map((row) => row.slug)
        .sort();

    await mcp.call('upsert_ingredient', {
      name: 'Contract espelette',
      slug: SUB_A,
      substitutes: ['Contract aleppo'],
    });
    expect(await subs(SUB_A)).toEqual([SUB_B]);
    // The half nothing read: the relation was written from B as well.
    expect(await subs(SUB_B)).toEqual([SUB_A]);

    // A second call names a different stand-in. The first one is still true.
    await mcp.call('upsert_ingredient', {
      name: 'Contract espelette',
      slug: SUB_A,
      substitutes: ['Contract cayenne'],
    });
    expect(await subs(SUB_A)).toEqual([SUB_B, SUB_C].sort());

    // And an omitted list changes nothing, the way every other omitted
    // field on this tool does.
    await mcp.call('upsert_ingredient', {
      name: 'Contract espelette',
      slug: SUB_A,
      description: 'A mild Basque chilli, more fruit than heat.',
    });
    expect(await subs(SUB_A)).toEqual([SUB_B, SUB_C].sort());
  });

  // ───────────────────────────────────────────────────────────────────────
  // build_shopping_list — the unquantified flag
  // ───────────────────────────────────────────────────────────────────────

  /**
   * R-SCR-20: a line with no amount is flagged, never guessed at.
   *
   * The flag is set in `buildShoppingList` and printed by the checklist as
   * "some". No test drove a line with no quantity through to a list, so the
   * flag could have been dropped and every shopping assertion in the suite
   * would still have passed — the reader would simply be told to buy 5 g of
   * pepper when one of the two recipes wants an unstated amount more.
   */
  test('a line with no amount is flagged rather than guessed at', async () => {
    const mcp = rw();

    await mcp.call('upsert_ingredient', {
      name: 'Contract shop salt',
      slug: SHOP_SALT,
      category: 'condiment',
    });
    await mcp.call('upsert_ingredient', {
      name: 'Contract shop pepper',
      slug: SHOP_PEPPER,
      category: 'spice',
    });

    await mcp.call('create_recipe', {
      title: 'The recipe that does not say how much pepper',
      slug: SHOP_ONE,
      kind: 'recipe',
      rationale: 'One line with an amount, one line without.',
      ingredients: [
        { name: 'Contract shop salt', quantity: 10, unit: 'g' },
        // No quantity at all. "Pepper, to taste" is how a real recipe
        // writes this, and it is not a zero.
        { name: 'Contract shop pepper' },
      ],
      steps: [{ instruction: 'Season it.' }],
    });
    await mcp.call('create_recipe', {
      title: 'The recipe that does say how much pepper',
      slug: SHOP_TWO,
      kind: 'recipe',
      rationale: 'The second recipe on the list, and it states its amount.',
      ingredients: [{ name: 'Contract shop pepper', quantity: 5, unit: 'g' }],
      steps: [{ instruction: 'Grind the pepper over it.' }],
    });

    const list = await mcp.call<ShoppingResult>('build_shopping_list', {
      slugs: [SHOP_ONE, SHOP_TWO, 'mcp-tools-no-such-recipe'],
    });

    const pepper = entries(list).find((entry) => entry.slug === SHOP_PEPPER)!;
    // One row for the ingredient, carrying both recipes.
    expect(pepper.from.map((source) => source.slug).sort()).toEqual(
      [SHOP_ONE, SHOP_TWO].sort(),
    );
    // The amount that was stated is still summed and shown.
    expect(pepper.amounts).toEqual(['5 g']);
    // And the line that stated nothing is reported as such rather than
    // being added in as a zero or dropped.
    expect(pepper.unquantified).toBe(true);

    const salt = entries(list).find((entry) => entry.slug === SHOP_SALT)!;
    expect(salt.amounts).toEqual(['10 g']);
    expect(salt.unquantified).toBe(false);

    // A slug that is not a recipe is named rather than ignored, so a caller
    // that mistyped one is not handed a short list that looks complete.
    expect(list.missing).toEqual(['mcp-tools-no-such-recipe']);
    expect(list.recipes.map((recipe) => recipe.slug).sort()).toEqual(
      [SHOP_ONE, SHOP_TWO].sort(),
    );
  });

  // ───────────────────────────────────────────────────────────────────────
  // The two tools that reach a stored record
  // ───────────────────────────────────────────────────────────────────────

  /**
   * `add_mass_flow` and `describe_mechanism` each fill a field that has never
   * held a value, and each refuses a second write. That refusal is the whole
   * reason they are allowed to exist beside the revision rule — a figure
   * that can be rewritten is a measurement that can be quietly replaced.
   *
   * The suite tested the SEQUENTIAL refusal. The connector is multi-client by
   * design, and `docs/mcp-connector.md` argues at length that the sequential
   * check is advisory on its own: under READ COMMITTED two connectors both
   * read an empty field, both pass the guard, and the second overwrites the
   * first — and the measurement a scientist recorded is gone with no error
   * anywhere. `describeMechanism` therefore takes `FOR UPDATE` and repeats
   * the emptiness test inside the `UPDATE`'s own `WHERE`. Nothing tested it.
   *
   * `add_mass_flow` is the other half of that pair and is deliberately NOT
   * driven here. Its concurrent guard is `uq_mass_flow_revision`, a database
   * unique index that `global-setup` rebuilds from the committed migrations
   * on every run — so an assertion about it cannot be made to fail by
   * changing any line of TypeScript, and an assertion that cannot fail reads
   * as coverage while providing none. Its sequential refusal is covered in
   * `mcp-contract.spec.ts`.
   *
   * Two clients, not one: each `mcpClient` negotiates its own session, so the
   * two calls are two connections and really are in flight together.
   *
   * The assertion holds under every interleaving — including the one where
   * the two calls happen not to overlap — so this test cannot be flaky in the
   * direction that matters. It says: exactly one call succeeded, and the
   * value that is stored is that call's.
   */
  test('two connectors describing the same note at once: one wins, and it is the stored one', async () => {
    const first = rw();
    const second = mcpClient(
      test.info().project.use.baseURL!,
      tokens().readWrite,
    );

    await mcp_create_race_recipe(first);

    const recipe = await first.call<{
      notes: { id: string; kind: string; conditions: string[] }[];
    }>('get_recipe', { slug: RACE_SLUG });
    const note = recipe.notes.find((row) => row.kind === 'science')!;
    expect(note.conditions).toEqual([]);

    // Both sessions are already negotiated, so `Promise.all` below sends two
    // tool calls and nothing else.
    await Promise.all([
      first.call('get_repository_stats', {}),
      second.call('get_repository_stats', {}),
    ]);

    const settled = await Promise.allSettled([
      first.call('describe_mechanism', {
        noteId: note.id,
        conditions: ['4 °C', 'first caller'],
      }),
      second.call('describe_mechanism', {
        noteId: note.id,
        conditions: ['20 °C', 'second caller'],
      }),
    ]);

    const won = settled.filter((r) => r.status === 'fulfilled');
    const lost = settled.filter((r) => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost[0]!.reason.message).toMatch(/conditions/);

    const after = await first.call<{
      notes: { id: string; conditions: string[] }[];
    }>('get_recipe', { slug: RACE_SLUG });
    const stored = after.notes.find((row) => row.id === note.id)!.conditions;
    // Whichever call won, the stored value is that call's and not a mixture
    // of the two, and not the loser's written over the winner's.
    expect(stored).toEqual(
      (won[0] as PromiseFulfilledResult<{ conditions: string[] }>).value
        .conditions,
    );
  });

  // ───────────────────────────────────────────────────────────────────────
  // withTransaction
  // ───────────────────────────────────────────────────────────────────────

  /**
   * AGENTS.md: "A recipe whose revision landed but whose ingredients did not
   * is worse than no recipe, because the site renders it as an empty dish."
   * No test forced a failure in the middle of a write and asserted that
   * nothing was left behind.
   *
   * This is the one refusal in the write layer that fires AFTER a row has
   * been inserted. `reviseRecipe` inserts the `recipe_revisions` row, then
   * reads the carried-forward ingredient lines, then refuses a step whose
   * name fits two of them. Without the rollback the recipe keeps a revision
   * that has no ingredients, no steps and no pointer to it — a number in the
   * history list, and a `/recipes/[slug]/revisions/N` page showing an empty
   * dish.
   *
   * `mcp-contract.spec.ts` covers the refusal and the message. What it does
   * not do is look for the row, which is the half that fails silently.
   */
  test('a write refused halfway leaves no row behind', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'A recipe with two lines of one name',
      slug: ROLLBACK_SLUG,
      kind: 'recipe',
      rationale: 'Two lines share a name, so a later step can be ambiguous.',
      ingredients: [
        {
          name: 'Contract shop salt',
          quantity: 10,
          unit: 'g',
          component: 'The cure',
        },
        {
          name: 'Contract shop salt',
          quantity: 4,
          unit: 'g',
          component: 'To finish',
        },
      ],
      steps: [{ instruction: 'Rub the cure in and hold it cold.' }],
    });

    const before = await stats(mcp);
    const beforeRecipe = await mcp.call<RecipeResult>('get_recipe', {
      slug: ROLLBACK_SLUG,
    });
    expect(beforeRecipe.revisions).toHaveLength(1);

    // Steps without ingredients. The revision row is inserted before the
    // carried-forward lines are read, so this refusal happens with a row
    // already written inside the transaction.
    await expect(
      mcp.call('revise_recipe', {
        slug: ROLLBACK_SLUG,
        rationale: 'A step that names a line, when two lines answer to it.',
        steps: [
          {
            instruction: 'Add the salt.',
            uses: ['Contract shop salt'],
          },
        ],
      }),
    ).rejects.toThrow(/The cure|To finish/);

    const afterRecipe = await mcp.call<RecipeResult>('get_recipe', {
      slug: ROLLBACK_SLUG,
    });
    // No second version in the history, and the current one did not move.
    expect(afterRecipe.revisions.map((row) => row.revisionNumber)).toEqual([1]);
    expect(afterRecipe.revision.revisionNumber).toBe(1);
    // And no orphan anywhere else in the repository either. The recipe's own
    // history reads through the recipe; this counts the table.
    expect(await stats(mcp)).toEqual(before);

    // The recipe is not poisoned by the refusal: an unambiguous revision
    // still goes through immediately afterwards.
    const good = await mcp.call<WriteResult>('revise_recipe', {
      slug: ROLLBACK_SLUG,
      rationale: 'The same step, naming the line by the heading it sits under.',
      steps: [
        {
          instruction: 'Add the salt.',
          uses: ['The cure: Contract shop salt'],
        },
      ],
    });
    expect(good.revisionNumber).toBe(2);
  });
});
