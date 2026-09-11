/**
 * THE CENSUS. Call every exported read, and look for a deleted record in
 * what comes back.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS RATHER THAN FIFTEEN HAND-WRITTEN ASSERTIONS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `src/lib/queries/read.ts` must never return a deleted row. Three things
 * hold that line, and each one has a hole the next has to cover:
 *
 *   1. The six `_live` views. They only help a query that selects from them.
 *   2. The ESLint import ban scoped to `read.ts` in `eslint.config.mjs`. It
 *      makes naming a base table fail CI — but it reads imports, and it
 *      CANNOT SEE INSIDE A TEMPLATE LITERAL. `read.ts` has four raw-SQL
 *      sites: `searchRecipes`, `getStats`, `listIngredients`' join, and the
 *      `noteRecipeId` / `noteBelongsToRecipe` fragments.
 *   3. This.
 *
 * The property worth more than the assertions is the enumeration. This file
 * holds a call table, compares it against `Object.entries(read)`, and prints
 * the difference both ways. A SIXTEENTH exported read that nobody added to
 * the table fails the suite on the day it lands, naming itself. A test that
 * lists fifteen reads by hand goes stale in silence, and silence is the
 * failure mode this whole branch is defending against.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT IS A SCRIPT AND NOT A SPEC
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `read.ts` imports `server-only`, which resolves to a throwing client entry
 * outside Next. `e2e/data-archive.spec.ts` already runs the exporter the way
 * out of that — `tsx` under `NODE_OPTIONS=--conditions=react-server` — and
 * this follows it. The spec that reads this output is
 * `e2e/data-deleted.spec.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE TWO SENTINELS, AND WHY THE SECOND ONE IS NOT OPTIONAL
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `ZZBIN` is written into every field of every record the fixture then
 * deletes. `ZZKEEP` is written into records that stay. A census that only
 * counted `ZZBIN` would pass perfectly against a `read.ts` where every
 * function threw and returned nothing — so every call records BOTH counts
 * and its own error, and the spec asserts that every read except `getStats`
 * carries a live marker somewhere. That is a positive control PER FUNCTION,
 * not one for the whole run: a single read that quietly started returning
 * `[]` is named by the failure.
 *
 * `getStats` is the one exemption and it is structural: it returns six
 * integers, and no arrangement of a fixture puts a word in an integer. The
 * counts are asserted directly in `e2e/data-deleted.spec.ts` instead.
 *
 * WHY THE FORBIDDEN LIST IS NOT JUST THE SENTINEL. A slug is lower case by
 * regular expression, so it cannot carry `ZZBIN`, and `listRecipeSlugs`
 * returns slugs and nothing else — which is exactly the read the sitemap and
 * `pnpm export` walk. So the deleted slugs are in the forbidden list beside
 * the sentinel, and the live slugs are in the marker list beside `ZZKEEP`.
 *
 * Usage: `tsx --tsconfig tsconfig.json e2e/deleted-census.ts`, with
 * `DATABASE_URL` set and `CENSUS_FIXTURE` carrying the JSON the spec built.
 * Without the variable it falls back to the unstamped names below, so the
 * script can be run by hand against a database a suite has just left. The
 * JSON goes to stdout between two markers, because anything under it may
 * write a line of its own to the same stream.
 */
import * as read from '../src/lib/queries/read';
import { searchRecipesSchema } from '../src/lib/domain/schemas';
import {
  BIN,
  KEEP,
  BEGIN,
  END,
  type CensusFixture,
  type CensusReport,
} from './deleted-census-contract';

/**
 * Without `CENSUS_FIXTURE` the script falls back to the unstamped names, so
 * it can be run by hand against a database the suite has just left.
 */
const DEFAULTS: CensusFixture = {
  binRecipe: 'zzbin-recipe',
  keepRecipe: 'zzkeep-recipe',
  binRun: 'zzbin-run',
  keepRun: 'zzkeep-run',
  binIngredient: 'zzbin-allspice',
  keepIngredient: 'zzkeep-flour',
  binTag: 'zzbin-curing',
  keepTag: 'zzkeep-roasting',
  binTagLabel: `${BIN} curing`,
  binIngredientName: `${BIN} allspice`,
  forbidden: [
    BIN,
    'zzbin-recipe',
    'zzbin-run',
    'zzbin-allspice',
    'zzbin-curing',
  ],
  keepMarkers: [KEEP, 'zzkeep-recipe'],
};

const FIXTURE: CensusFixture = process.env.CENSUS_FIXTURE
  ? (JSON.parse(process.env.CENSUS_FIXTURE) as CensusFixture)
  : DEFAULTS;

const search = (input: Record<string, unknown>) =>
  read.searchRecipes(searchRecipesSchema.parse(input));

interface Call {
  /** What this call is, for a failure message that says which one leaked. */
  label: string;
  run: () => Promise<unknown>;
  /**
   * Drop a part of the result before the scan.
   *
   * One call needs it and the reason is worth writing down rather than
   * working around: `buildShoppingList` reports the slugs it could not find
   * in `missing`, and that array is THE CALLER'S OWN INPUT ECHOED BACK. A
   * deleted slug lands in it beside a typo, which is correct behaviour and
   * discloses nothing — the recipe's title, its lines and its tags are all
   * absent. Scanning it would fail the census on right code.
   */
  scrub?: (result: unknown) => unknown;
}

/**
 * One entry per exported read, and the arguments that would surface a
 * deleted record if the filter were missing.
 *
 * Every entry names the deleted fixture AND the live one. The deleted half
 * is the leak hunt; the live half is the proof the call ran at all.
 */
const CALLS: Record<string, Call[]> = {
  listRecipes: [
    { label: 'every recipe', run: () => read.listRecipes() },
    { label: 'the first page', run: () => read.listRecipes({ limit: 100 }) },
  ],

  searchRecipes: [
    { label: `free text "${BIN}"`, run: () => search({ query: BIN }) },
    { label: `free text "${KEEP}"`, run: () => search({ query: KEEP }) },
    {
      // The deleted tag's LABEL through free text. This is the one leak the
      // views cannot stop: `recipes.search_vector` is a stored column that
      // folds tag labels into weight B, and its triggers fire on
      // `recipe_terms`, not on the tag row. Nothing is displayed, so a
      // display sweep misses it entirely.
      label: "free text, the deleted tag's label",
      run: () => search({ query: FIXTURE.binTagLabel }),
    },
    {
      label: "free text, the deleted ingredient's name",
      run: () => search({ query: FIXTURE.binIngredientName }),
    },
    {
      label: 'filtered by the deleted tag',
      run: () => search({ categories: { technique: [FIXTURE.binTag] } }),
    },
    {
      label: 'filtered by the kept tag',
      run: () => search({ categories: { technique: [FIXTURE.keepTag] } }),
    },
    {
      label: 'filtered by the deleted ingredient',
      run: () => search({ ingredients: [FIXTURE.binIngredient] }),
    },
    { label: 'unfiltered, one page', run: () => search({ limit: 100 }) },
  ],

  getRecipeBySlug: [
    {
      label: 'the deleted recipe',
      run: () => read.getRecipeBySlug(FIXTURE.binRecipe),
    },
    {
      label: 'the deleted recipe, by revision number',
      run: () => read.getRecipeBySlug(FIXTURE.binRecipe, 1),
    },
    {
      // The dense one. This result carries the recipe, its whole revision
      // history, its lines, its steps, its notes, its links, its backlinks
      // and its runs — and the fixture points a link, a line, a tag and a
      // note of this live recipe at records that are deleted.
      label: 'the kept recipe',
      run: () => read.getRecipeBySlug(FIXTURE.keepRecipe),
    },
    {
      label: 'the kept recipe, revision 1',
      run: () => read.getRecipeBySlug(FIXTURE.keepRecipe, 1),
    },
  ],

  getRecipeIdentity: [
    {
      label: 'the deleted recipe',
      run: () => read.getRecipeIdentity(FIXTURE.binRecipe),
    },
    {
      label: 'the kept recipe',
      run: () => read.getRecipeIdentity(FIXTURE.keepRecipe),
    },
  ],

  listRecipeSlugs: [
    // What `pnpm export` walks and what the sitemap is built from. It
    // returns slugs and nothing else, which is why the forbidden list holds
    // the deleted slugs as well as the sentinel.
    { label: 'every slug', run: () => read.listRecipeSlugs() },
  ],

  listCategories: [
    { label: 'every tag', run: () => read.listCategories() },
    {
      label: 'the technique tags',
      run: () => read.listCategories('technique'),
    },
  ],

  getTerm: [
    {
      label: 'the deleted tag',
      run: () => read.getTerm('technique', FIXTURE.binTag),
    },
    {
      // Carried by both recipes, so its recipe list is where the deleted one
      // would show up.
      label: 'the kept tag',
      run: () => read.getTerm('technique', FIXTURE.keepTag),
    },
  ],

  listIngredients: [
    { label: 'every ingredient', run: () => read.listIngredients() },
  ],

  getIngredient: [
    {
      label: 'the deleted ingredient',
      run: () => read.getIngredient(FIXTURE.binIngredient),
    },
    {
      // Used by both recipes, so its recipe list is the leak site.
      label: 'the kept ingredient',
      run: () => read.getIngredient(FIXTURE.keepIngredient),
    },
  ],

  listExperiments: [
    { label: 'every run', run: () => read.listExperiments() },
    {
      label: "the deleted recipe's runs",
      run: () => read.listExperiments({ recipeSlug: FIXTURE.binRecipe }),
    },
    {
      label: "the kept recipe's runs",
      run: () => read.listExperiments({ recipeSlug: FIXTURE.keepRecipe }),
    },
  ],

  getExperiment: [
    { label: 'the deleted run', run: () => read.getExperiment(FIXTURE.binRun) },
    { label: 'the kept run', run: () => read.getExperiment(FIXTURE.keepRun) },
  ],

  listScienceIndex: [
    { label: 'the index', run: () => read.listScienceIndex() },
  ],

  getScienceStudy: [
    {
      label: 'the deleted recipe',
      run: () => read.getScienceStudy(FIXTURE.binRecipe),
    },
    {
      // The live study carries a deleted science note, so this is where a
      // note that outlived its filter appears as a mechanism.
      label: 'the kept recipe',
      run: () => read.getScienceStudy(FIXTURE.keepRecipe),
    },
  ],

  getStats: [
    // Six integers. No sentinel can reach them; `e2e/data-deleted.spec.ts`
    // asserts the counts themselves, by measuring a delete and a restore.
    { label: 'the six counts', run: () => read.getStats() },
  ],

  buildShoppingList: [
    {
      label: 'the kept recipe and the deleted one together',
      run: () =>
        read.buildShoppingList([FIXTURE.keepRecipe, FIXTURE.binRecipe]),
      scrub: (result) => {
        const { missing: _echoed, ...rest } = result as { missing: unknown };
        return rest;
      },
    },
  ],
};

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    count += 1;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count;
}

async function main(): Promise<void> {
  const exported = Object.entries(read)
    .filter(([, value]) => typeof value === 'function')
    .map(([name]) => name)
    .sort();
  const tabled = Object.keys(CALLS).sort();

  const report: CensusReport = {
    missing: exported.filter((name) => !tabled.includes(name)),
    extra: tabled.filter((name) => !exported.includes(name)),
    results: [],
  };

  for (const [name, calls] of Object.entries(CALLS)) {
    for (const call of calls) {
      try {
        const raw = await call.run();
        const value = call.scrub ? call.scrub(raw) : raw;
        const text = JSON.stringify(value ?? null);
        const found: Record<string, number> = {};
        for (const needle of FIXTURE.forbidden) {
          const hits = occurrences(text, needle);
          if (hits > 0) found[needle] = hits;
        }
        report.results.push({
          name,
          label: call.label,
          found,
          live: FIXTURE.keepMarkers.some((marker) => text.includes(marker)),
          bytes: text.length,
          error: null,
        });
      } catch (error) {
        report.results.push({
          name,
          label: call.label,
          found: {},
          live: false,
          bytes: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  process.stdout.write(
    `\n${BEGIN}\n${JSON.stringify(report, null, 2)}\n${END}\n`,
  );
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
