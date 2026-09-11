import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * What an omitted field means, on every write that can be called twice.
 *
 * Four tools update a record that already exists — `upsert_ingredient`,
 * `upsert_category`, `log_experiment` and `revise_recipe` — and all four
 * follow one rule: a field the caller did not send is left alone, and an
 * explicit `null` clears it. The rule exists because the alternative is
 * silent destruction. An agent that calls `upsert_ingredient` to fix a
 * spelling must not thereby erase a density somebody measured, and a
 * re-logged batch must not lose its cost because the second call was only
 * adding a weight.
 *
 * The rule is stated once in each function and enforced by a spread of
 * conditional keys, which is exactly the shape that rots quietly: drop one
 * `...(x !== undefined ? … : {})` and the field starts being blanked with
 * no error anywhere. `e2e/mcp-contract.spec.ts` covers a partial
 * `upsert_ingredient` keeping *some* fields and a re-log keeping *some*
 * others. This file walks every field of every one of the four, one at a
 * time, and then walks the clears — because "keeps on omission" and "clears
 * on null" are two different halves and only the pair says the field is
 * under control.
 *
 * `substitutes` and `aliases` are the deliberate exception, and they are
 * opposites: an alias list REPLACES what is stored, a substitute list only
 * ever ADDS. Both are asserted here together, because the two rules read
 * identically in the tool's signature.
 */

const ING_SLUG = 'data-carry-gochujang';
const SUB_A = 'data-carry-doenjang';
const SUB_B = 'data-carry-miso';
const TAG_PARENT = 'data-carry-fermenting';
const TAG_OTHER_PARENT = 'data-carry-curing';
const TAG_CHILD = 'data-carry-koji-fermenting';
const RUN_SLUG = 'data-carry-run';
const RUN_RECIPE = 'data-carry-run-recipe';
const REV_SLUG = 'data-carry-revised';

interface IngredientResult {
  ingredient: {
    slug: string;
    name: string;
    plural: string | null;
    category: string;
    description: string | null;
    densityGPerMl: number | null;
    defaultUnit: string | null;
    aliases: string[];
  };
  substitutes: { slug: string; name: string }[];
}

interface CategoryResult {
  categoryType: string;
  slug: string;
  created: boolean;
  parent: { slug: string; label: string } | null;
}

interface TermRow {
  slug: string;
  label: string;
  description: string | null;
  parent: { slug: string; label: string } | null;
}

interface ExperimentResult {
  slug: string;
  title: string;
  summary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  scaleFactor: number | null;
  outcome: string | null;
  costTotal: number | null;
  currency: string | null;
  recipe: { slug: string; title: string } | null;
  items: { label: string }[];
  observations: { metric: string; value: number | null }[];
}

interface RecipeResult {
  slug: string;
  subtitle: string | null;
  summary: string | null;
  revisionNumber: number;
  revision: {
    summary: string | null;
    yieldQuantity: number | null;
    yieldUnit: string | null;
    servings: number | null;
    totalTimeMinutes: number | null;
    activeTimeMinutes: number | null;
  };
  ingredients: { rawText: string; ingredient: { name: string } | null }[];
  steps: { instruction: string }[];
}

function rw() {
  return mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
}

/** One tag, read back off the list an agent actually gets. */
async function term(categoryType: string, slug: string): Promise<TermRow> {
  const rows = await rw().call<TermRow[]>('list_categories', { categoryType });
  const found = rows.find((row) => row.slug === slug);
  if (!found) throw new Error(`No tag "${slug}" in "${categoryType}".`);
  return found;
}

test.describe.configure({ mode: 'serial' });

test.describe('what an omitted field leaves alone', () => {
  test('an ingredient keeps every field a later call does not mention', async () => {
    const mcp = rw();

    await mcp.call('upsert_ingredient', {
      name: 'Carry gochujang',
      slug: ING_SLUG,
      plural: 'Carry gochujangs',
      category: 'condiment',
      description: 'A fermented chilli paste, sweet and salty at once.',
      densityGPerMl: 1.28,
      defaultUnit: 'tablespoon',
      aliases: ['carry gochu jang'],
    });

    // The call an agent makes when it is only correcting a name. Every other
    // field is absent, and every other field has to survive it.
    await mcp.call('upsert_ingredient', {
      slug: ING_SLUG,
      name: 'Carry gochujang paste',
    });

    const { ingredient } = await mcp.call<IngredientResult>('get_ingredient', {
      slug: ING_SLUG,
    });

    expect(ingredient.name).toBe('Carry gochujang paste');
    expect(ingredient.plural).toBe('Carry gochujangs');
    expect(ingredient.category).toBe('condiment');
    expect(ingredient.description).toBe(
      'A fermented chilli paste, sweet and salty at once.',
    );
    // The density is the one that costs a wrong number on a shopping list:
    // it is what turns a volume into a mass in `toGrams`.
    expect(ingredient.densityGPerMl).toBe(1.28);
    // Folded onto its canonical spelling on the way in, and kept.
    expect(ingredient.defaultUnit).toBe('tbsp');
    expect(ingredient.aliases).toEqual(['carry gochu jang']);
  });

  test('an explicit null clears one field and only that field', async () => {
    const mcp = rw();

    await mcp.call('upsert_ingredient', {
      slug: ING_SLUG,
      name: 'Carry gochujang paste',
      densityGPerMl: null,
    });

    const { ingredient } = await mcp.call<IngredientResult>('get_ingredient', {
      slug: ING_SLUG,
    });

    expect(ingredient.densityGPerMl).toBeNull();
    // Everything the caller did not name is still there. A clear that took
    // its neighbours with it would be indistinguishable from the bug this
    // rule exists to stop.
    expect(ingredient.plural).toBe('Carry gochujangs');
    expect(ingredient.description).toBe(
      'A fermented chilli paste, sweet and salty at once.',
    );
    expect(ingredient.defaultUnit).toBe('tbsp');
    expect(ingredient.aliases).toEqual(['carry gochu jang']);
  });

  test('an alias list replaces; a substitute list only adds', async () => {
    const mcp = rw();

    for (const [slug, name] of [
      [SUB_A, 'Carry doenjang'],
      [SUB_B, 'Carry miso'],
    ] as const) {
      await mcp.call('upsert_ingredient', {
        slug,
        name,
        category: 'condiment',
      });
    }

    await mcp.call('upsert_ingredient', {
      slug: ING_SLUG,
      name: 'Carry gochujang paste',
      substitutes: ['Carry doenjang'],
    });
    await mcp.call('upsert_ingredient', {
      slug: ING_SLUG,
      name: 'Carry gochujang paste',
      substitutes: ['Carry miso'],
      aliases: ['carry red paste'],
    });

    const { ingredient, substitutes } = await mcp.call<IngredientResult>(
      'get_ingredient',
      { slug: ING_SLUG },
    );

    // Two rules, opposite directions, in one read. The alias list is the
    // set of names this ingredient answers to, so sending a new one states
    // the whole set; a substitute is a fact somebody learned in a kitchen,
    // so a second call adds to what is known rather than replacing it.
    expect(ingredient.aliases).toEqual(['carry red paste']);
    expect(new Set(substitutes.map((s) => s.slug))).toEqual(
      new Set([SUB_A, SUB_B]),
    );

    // And substitution is recorded both ways, because it is symmetric in a
    // kitchen: if miso stands in for gochujang, the reverse is worth
    // knowing when you are stood in front of the wrong tub.
    const back = await mcp.call<IngredientResult>('get_ingredient', {
      slug: SUB_B,
    });
    expect(back.substitutes.map((s) => s.slug)).toContain(ING_SLUG);
  });

  test('a tag keeps its description and its parent when neither is sent', async () => {
    const mcp = rw();

    for (const [slug, label] of [
      [TAG_PARENT, 'Carry fermenting'],
      [TAG_OTHER_PARENT, 'Carry curing'],
    ] as const) {
      await mcp.call('upsert_category', {
        categoryType: 'technique',
        slug,
        label,
        description: `${label}: a broad technique that groups narrower ones.`,
      });
    }

    const created = await mcp.call<CategoryResult>('upsert_category', {
      categoryType: 'technique',
      slug: TAG_CHILD,
      label: 'Carry koji fermenting',
      description: 'Fermenting with a cultured grain rather than a brine.',
      parentSlug: TAG_PARENT,
    });

    // The parent the caller just set, reported back. Before this was in the
    // result, an agent that named a parent got `{"created": …}` and had no
    // way at all to see what its own call had done to the hierarchy.
    expect(created.parent).toEqual({
      slug: TAG_PARENT,
      label: 'Carry fermenting',
    });

    // A call that only fixes a label. Neither `description` nor
    // `parentSlug` is sent, so neither may move.
    const relabelled = await mcp.call<CategoryResult>('upsert_category', {
      categoryType: 'technique',
      slug: TAG_CHILD,
      label: 'Carry koji fermentation',
    });
    expect(relabelled.parent).toEqual({
      slug: TAG_PARENT,
      label: 'Carry fermenting',
    });

    const stored = await term('technique', TAG_CHILD);
    expect(stored.label).toBe('Carry koji fermentation');
    expect(stored.description).toBe(
      'Fermenting with a cultured grain rather than a brine.',
    );
    expect(stored.parent).toEqual({
      slug: TAG_PARENT,
      label: 'Carry fermenting',
    });
  });

  test('a parent can be moved, and cleared, and each is visible', async () => {
    const mcp = rw();

    const moved = await mcp.call<CategoryResult>('upsert_category', {
      categoryType: 'technique',
      slug: TAG_CHILD,
      label: 'Carry koji fermentation',
      parentSlug: TAG_OTHER_PARENT,
    });
    expect(moved.parent).toEqual({
      slug: TAG_OTHER_PARENT,
      label: 'Carry curing',
    });
    // The update branch, read back off the list rather than off the result
    // that reported it. This is the defect behind the report that a
    // `parentSlug` was discarded: it was written and then readable nowhere,
    // which from the outside is the same thing.
    expect((await term('technique', TAG_CHILD)).parent).toEqual({
      slug: TAG_OTHER_PARENT,
      label: 'Carry curing',
    });

    const cleared = await mcp.call<CategoryResult>('upsert_category', {
      categoryType: 'technique',
      slug: TAG_CHILD,
      label: 'Carry koji fermentation',
      parentSlug: null,
    });
    expect(cleared.parent).toBeNull();
    expect((await term('technique', TAG_CHILD)).parent).toBeNull();

    // A description clears the same way, and clearing one does not clear
    // the other.
    await mcp.call('upsert_category', {
      categoryType: 'technique',
      slug: TAG_CHILD,
      label: 'Carry koji fermentation',
      description: null,
    });
    expect((await term('technique', TAG_CHILD)).description).toBeNull();
  });

  test('a re-logged run keeps every field the second call leaves out', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Carry run subject',
      slug: RUN_RECIPE,
      kind: 'recipe',
      rationale: 'Something for the run to have been cooking.',
      ingredients: [{ name: 'Carry beef topside', quantity: 5, unit: 'kg' }],
      steps: [{ instruction: 'Hang it.' }],
    });

    await mcp.call('log_experiment', {
      slug: RUN_SLUG,
      title: 'Carry batch one',
      recipeSlug: RUN_RECIPE,
      summary: 'The first run, weighed in and out.',
      startedAt: '2026-01-04',
      completedAt: '2026-01-11',
      scaleFactor: 1.5,
      outcome: 'Good, but the cut was thicker than it should have been.',
      costTotal: 41.5,
      currency: 'ZAR',
      items: [{ label: 'A1' }],
      observations: [{ item: 'A1', metric: 'initial_weight', value: 500 }],
    });

    // The call that adds one number to a finished batch. Everything else is
    // absent, and everything else has to survive it — including the
    // measurements, which are the whole value of a batch log and have no
    // revision history to be recovered from.
    await mcp.call('log_experiment', {
      slug: RUN_SLUG,
      title: 'Carry batch one',
    });

    const run = await mcp.call<ExperimentResult>('get_experiment', {
      slug: RUN_SLUG,
    });

    expect(run.summary).toBe('The first run, weighed in and out.');
    expect(run.startedAt).toBe('2026-01-04');
    expect(run.completedAt).toBe('2026-01-11');
    expect(run.scaleFactor).toBe(1.5);
    expect(run.outcome).toBe(
      'Good, but the cut was thicker than it should have been.',
    );
    expect(run.costTotal).toBe(41.5);
    // The currency has a column default of EUR, so a carry-forward that
    // failed here would not read as empty — it would read as a different
    // number of a different currency.
    expect(run.currency).toBe('ZAR');
    expect(run.recipe?.slug).toBe(RUN_RECIPE);
    expect(run.items.map((item) => item.label)).toEqual(['A1']);
    expect(run.observations.map((o) => o.value)).toEqual([500]);
  });

  test('an explicit null unlinks a run from every recipe', async () => {
    const mcp = rw();

    await mcp.call('log_experiment', {
      slug: RUN_SLUG,
      title: 'Carry batch one',
      recipeSlug: null,
    });

    const run = await mcp.call<ExperimentResult>('get_experiment', {
      slug: RUN_SLUG,
    });
    // Omission carries the link forward, so without an explicit null a run
    // attached to the wrong recipe could be moved and never detached.
    expect(run.recipe).toBeNull();
    // And nothing else went with it.
    expect(run.costTotal).toBe(41.5);
    expect(run.items.map((item) => item.label)).toEqual(['A1']);
  });

  test('a revision carries forward every field it does not restate', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Carry revision subject',
      slug: REV_SLUG,
      kind: 'recipe',
      subtitle: 'The one with the long rest',
      summary: 'A braise that gets better on the second day.',
      rationale: 'The version everything else is measured against.',
      yieldQuantity: 2.4,
      yieldUnit: 'kg',
      servings: 8,
      totalTimeMinutes: 300,
      activeTimeMinutes: 45,
      ingredients: [
        { name: 'Carry short rib', quantity: 2, unit: 'kg' },
        { name: 'Carry star anise', quantity: 3, unit: 'piece' },
      ],
      steps: [
        { instruction: 'Brown the ribs.' },
        { instruction: 'Braise for four hours.' },
      ],
    });

    // A revision whose only change is the reason for it. Nothing else is
    // sent, so everything else comes forward from the version being
    // superseded — including both lists, which is what lets a steps-only
    // revision exist at all.
    await mcp.call('revise_recipe', {
      slug: REV_SLUG,
      rationale: 'Recorded that the rest is the point, not the braise time.',
    });

    const carried = await mcp.call<RecipeResult>('get_recipe', {
      slug: REV_SLUG,
    });

    expect(carried.revisionNumber).toBe(2);
    expect(carried.revision.summary).toBe(
      'A braise that gets better on the second day.',
    );
    expect(carried.revision.yieldQuantity).toBe(2.4);
    expect(carried.revision.yieldUnit).toBe('kg');
    expect(carried.revision.servings).toBe(8);
    expect(carried.revision.totalTimeMinutes).toBe(300);
    expect(carried.revision.activeTimeMinutes).toBe(45);
    expect(carried.subtitle).toBe('The one with the long rest');
    expect(
      carried.ingredients.map((line) => line.ingredient?.name).sort(),
    ).toEqual(['Carry short rib', 'Carry star anise']);
    expect(carried.steps.map((step) => step.instruction)).toEqual([
      'Brown the ribs.',
      'Braise for four hours.',
    ]);
  });

  test('a revision that replaces one list carries the other', async () => {
    const mcp = rw();

    // Ingredients only. The steps are not sent, so they come forward.
    await mcp.call('revise_recipe', {
      slug: REV_SLUG,
      rationale: 'Dropped the star anise; it fought the wine.',
      ingredients: [{ name: 'Carry short rib', quantity: 2, unit: 'kg' }],
    });

    const afterLines = await mcp.call<RecipeResult>('get_recipe', {
      slug: REV_SLUG,
    });
    expect(afterLines.ingredients.map((line) => line.ingredient?.name)).toEqual(
      ['Carry short rib'],
    );
    expect(afterLines.steps.map((step) => step.instruction)).toEqual([
      'Brown the ribs.',
      'Braise for four hours.',
    ]);

    // Steps only. The lines come forward, and so does the yield, four
    // revisions from where it was written.
    await mcp.call('revise_recipe', {
      slug: REV_SLUG,
      rationale: 'A third step: the rest, which is the whole point.',
      steps: [
        { instruction: 'Brown the ribs.' },
        { instruction: 'Braise for four hours.' },
        { instruction: 'Cool, then rest overnight in the braise.' },
      ],
    });

    const afterSteps = await mcp.call<RecipeResult>('get_recipe', {
      slug: REV_SLUG,
    });
    expect(afterSteps.steps).toHaveLength(3);
    expect(afterSteps.ingredients.map((line) => line.ingredient?.name)).toEqual(
      ['Carry short rib'],
    );
    expect(afterSteps.revision.yieldQuantity).toBe(2.4);
    expect(afterSteps.revision.servings).toBe(8);
  });
});
