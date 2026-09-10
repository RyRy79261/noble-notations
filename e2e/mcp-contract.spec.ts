import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * The MCP surface as an agent meets it: over the wire, through the real
 * transport, with a real token.
 *
 * The existing suite drives the write functions and one lifecycle. These
 * are the contract tests — what a caller is told, what it is refused, and
 * what it is handed back — because every one of them covers something a
 * client actually hit and had no way to see.
 */

const SLUG = 'mcp-contract-laab';
const AMBIG_SLUG = 'mcp-contract-laab-ambiguous';
const CARRIED_SLUG = 'mcp-contract-laab-carried';
const SUM_SLUG = 'mcp-contract-nam-jim';
const COUNT_SLUG = 'mcp-contract-garlic-confit';
const FLOW_SLUG = 'mcp-contract-lardo';
const INGREDIENT_SLUG = 'mcp-contract-kapi';
const PARENT_SLUG = 'mcp-contract-braising';
const CHILD_SLUG = 'mcp-contract-pot-roasting';
const RUN_SLUG = 'mcp-contract-relog-run';
const TAG_SLUG = 'mcp-contract-laab-tags';
const NAME_SLUG = 'mcp-contract-silverside';
const ORDER_SLUG = 'mcp-contract-laab-ordered';
const ALIAS_HEAD_SLUG = 'mcp-contract-laab-alias-heading';
const QUALIFIED_SLUG = 'mcp-contract-laab-qualified';
const LIST_SLUG = 'mcp-contract-laab-for-the-shop';
const SPACING_SLUG = 'mcp-contract-laab-spacing';
const TWO_ROUTES_SLUG = 'mcp-contract-laab-two-routes';
const ONE_HEADING_SLUG = 'mcp-contract-laab-one-heading';
const WRONG_HEADING_SLUG = 'mcp-contract-laab-wrong-heading';
const NO_HEADING_SLUG = 'mcp-contract-laab-no-heading';
const TYPO_SLUG = 'mcp-contract-laab-typo';
const CARRY_SLUG = 'mcp-contract-laab-carried-heading';
const DROP_SLUG = 'mcp-contract-laab-one-line-left';
const HINT_SLUG = 'mcp-contract-laab-hint';
const COLON_SLUG = 'mcp-contract-poached-chicken';
const COLON_AMBIG_SLUG = 'mcp-contract-chilli-twice';
const SHADOW_SLUG = 'mcp-contract-two-salts';
const LONG_SLUG = 'mcp-contract-long-cure';

/**
 * The second spelling of one ingredient, the remedy the ambiguity refusal
 * now prescribes. It is an alias of `glutinous-rice` and not a new
 * ingredient, which is the whole point: two lines, one canonical row, one
 * shopping entry.
 */
const ALIAS_SPELLING = 'Glutinous rice for the table';

/**
 * The whole registry, sorted.
 *
 * Asserted as a set rather than a count, and asserted at all because two
 * tools and four advertised fields landed in M5.5 without a single test
 * moving. The scopes on `/connect` and in `docs/mcp-connector.md` name this
 * list; a tool that appears or disappears without those two moving with it
 * is drift, and this is the line that says so.
 */
const TOOLS = [
  'add_mass_flow',
  'add_note',
  'backfill_revision',
  'build_shopping_list',
  'create_recipe',
  'describe_mechanism',
  'get_experiment',
  'get_ingredient',
  'get_recipe',
  'get_repository_stats',
  'get_started',
  'list_categories',
  'list_experiments',
  'list_ingredients',
  'log_experiment',
  'report_issue',
  'revise_recipe',
  'search_recipes',
  'upsert_category',
  'upsert_ingredient',
];

interface WriteResult {
  slug: string;
  revisionNumber: number;
  message: string;
  needsDescription: {
    categories: { categoryType: string; slug: string; label: string }[];
    ingredients: { slug: string; name: string; missing: string[] }[];
    needsDensity: { slug: string; name: string; unit: string }[];
  };
}

interface RecipeResult {
  slug: string;
  title: string;
  ingredients: {
    rawText: string;
    component: string | null;
    quantity: number | null;
    unit: string | null;
    ingredient: { slug: string; name: string } | null;
  }[];
}

/**
 * The same read, plus the two fields that say which line a step bound to.
 * A chip is only right if it points at one line, so the assertion is on the
 * id and not on the name it happens to show.
 */
interface StepRecipeResult {
  ingredients: {
    id: string;
    component: string | null;
    quantity: number | null;
  }[];
  steps: {
    instruction: string;
    uses: { recipeIngredientId: string; name: string }[];
  }[];
}

interface FlowRecipeResult {
  slug: string;
  revision: {
    revisionNumber: number;
    massFlow:
      { label: string; value: string | null; emphasis: boolean }[] | null;
    massFlowSummary: string[];
  };
  notes: {
    id: string;
    kind: string;
    title: string | null;
    conditions: string[];
  }[];
}

interface ShoppingResult {
  groups: {
    category: string;
    entries: {
      name: string;
      slug: string | null;
      amounts: string[];
      from: { slug: string; title: string; text: string }[];
    }[];
  }[];
}

/** Every stored field of a canonical ingredient, as `get_ingredient` gives it. */
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
}

interface CategoryRow {
  categoryType: string;
  slug: string;
  label: string;
}

interface ExperimentResult {
  slug: string;
  summary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  scaleFactor: number | null;
  outcome: string | null;
  costTotal: number | null;
  currency: string | null;
  recipe: { slug: string; title: string } | null;
  items: { label: string; note: string | null }[];
  observations: { metric: string; value: number | null }[];
}

/**
 * The message off a refused call, without the throw.
 *
 * `expect().rejects.toThrow(/…/)` says a pattern matched. Half of what these
 * tests assert is what the message must NOT say — "An internal error
 * occurred" is the whole of defect E — and a negated `toThrow` cannot tell a
 * call that failed with a different message from one that never failed at
 * all. So the message is taken as a string and asserted on directly.
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

test.describe.configure({ mode: 'serial' });

test.describe('MCP contract', () => {
  test('create then read: what went in is what comes back', async () => {
    const mcp = rw();

    const created = await mcp.call<WriteResult>('create_recipe', {
      title: 'Laab ped',
      slug: SLUG,
      kind: 'recipe',
      rationale: 'First working version, written through the connector.',
      categories: {
        cuisine: ['Thai'],
        technique: ['dry-toasting'],
        equipment: ['mortar and pestle'],
      },
      ingredients: [
        // Deliberately the same ingredient twice, in two components, the
        // way the real write did: toasted rice powder is made from raw
        // grains, and more rice is served alongside.
        {
          name: 'Glutinous rice',
          quantity: 40,
          unit: 'g',
          component: 'Khao khua',
        },
        {
          name: 'Glutinous rice',
          quantity: 400,
          unit: 'g',
          component: 'To serve',
        },
        { name: 'Lemongrass', quantity: 2, unit: 'stalk' },
        { name: 'Duck breast', quantity: 500, unit: 'g' },
      ],
      steps: [
        // The step names the duck, not the rice. "Glutinous rice" is on two
        // lines here, so a step that named it would point at both — which is
        // refused, and is the test below.
        {
          instruction: 'Sear the duck breast skin-side down.',
          uses: ['Duck breast'],
        },
      ],
    });

    expect(created.slug).toBe(SLUG);

    const recipe = await mcp.call<RecipeResult>('get_recipe', { slug: SLUG });
    expect(recipe.title).toBe('Laab ped');

    // Both rice lines survive as their own lines, under their own headings.
    const rice = recipe.ingredients.filter((line) =>
      /glutinous rice/i.test(line.ingredient?.name ?? line.rawText),
    );
    expect(rice).toHaveLength(2);
    expect(rice.map((line) => line.quantity).sort((a, b) => a! - b!)).toEqual([
      40, 400,
    ]);
    expect(new Set(rice.map((line) => line.component))).toEqual(
      new Set(['Khao khua', 'To serve']),
    );
  });

  test('a step name that fits two lines is refused, and says which two', async () => {
    const mcp = rw();

    const body = (riceToServe: string) => ({
      title: 'Laab ped, the ambiguous one',
      kind: 'recipe',
      rationale: 'Proving what happens when one name fits two lines.',
      ingredients: [
        {
          name: 'Glutinous rice',
          quantity: 40,
          unit: 'g',
          component: 'Khao khua',
        },
        {
          name: riceToServe,
          quantity: 400,
          unit: 'g',
          component: 'To serve',
        },
        { name: 'Duck breast', quantity: 500, unit: 'g' },
      ],
      steps: [
        {
          instruction: 'Glutinous rice for the table into cold water.',
          uses: [riceToServe],
        },
      ],
    });

    // The shape that put a 40 g figure beside a step about the 400 g line on
    // the live site. It is not a typo and both lines are right, so the write
    // is refused rather than bound to whichever line came first.
    const message = await refusal(
      mcp.call('create_recipe', {
        ...body('Glutinous rice'),
        slug: AMBIG_SLUG,
      }),
    );
    expect(message).toMatch(/Khao khua \(40 g\).*To serve \(400 g\)/s);

    // And the refusal says what to do about it, in one line the caller can
    // act on without reading the schema.
    expect(message).toMatch(/must point to one line/);

    // Nothing was written. A refused create leaves no recipe behind.
    await expect(mcp.call('get_recipe', { slug: AMBIG_SLUG })).rejects.toThrow(
      /No recipe/i,
    );

    // And it prescribes the alias, not a bare rename. A bare rename is what
    // a caller reaches for, and `resolveIngredient` inserts on a name it
    // cannot match — so "Glutinous rice, to serve" would mint a second
    // canonical ingredient, split the shopping list in two rows that can
    // never sum, and leave a row nothing in this repository can delete.
    expect(message).toMatch(/upsert_ingredient/);
    expect(message).toMatch(/aliases/);

    // Follow it. Read the stored other names first, because `aliases`
    // replaces the whole list.
    const rice = await mcp.call<IngredientResult>('get_ingredient', {
      slug: 'glutinous-rice',
    });
    await mcp.call('upsert_ingredient', {
      name: rice.ingredient.name,
      slug: 'glutinous-rice',
      aliases: [...rice.ingredient.aliases, ALIAS_SPELLING],
    });

    // The same recipe now goes in, under the second spelling. This is the
    // half of the rule that must not have moved: a name that fits exactly
    // one line still resolves.
    const created = await mcp.call<WriteResult>('create_recipe', {
      ...body(ALIAS_SPELLING),
      slug: AMBIG_SLUG,
    });
    expect(created.slug).toBe(AMBIG_SLUG);

    // The step binds to the 400 g line, which is the line it names. Under
    // the old index it bound to the 40 g one and the 400 g line was
    // reachable from no step at all.
    const recipe = await mcp.call<StepRecipeResult>('get_recipe', {
      slug: AMBIG_SLUG,
    });
    const toServe = recipe.ingredients.find(
      (line) => line.component === 'To serve',
    )!;
    expect(toServe.quantity).toBe(400);
    expect(recipe.steps[0]!.uses.map((u) => u.recipeIngredientId)).toEqual([
      toServe.id,
    ]);

    // And the reason the remedy is an alias and not a new name: both lines
    // are still one ingredient, so the shopping list adds them up. A rename
    // gives two rows here, 40 g and 400 g, for ever.
    const list = await mcp.call<ShoppingResult>('build_shopping_list', {
      slugs: [AMBIG_SLUG],
    });
    const riceRows = list.groups
      .flatMap((group) => group.entries)
      .filter((entry) => /glutinous rice/i.test(entry.name));
    expect(riceRows).toHaveLength(1);
    expect(riceRows[0]!.amounts).toEqual(['440 g']);
  });

  /**
   * The same defect on the path that has no spelling left to go on.
   *
   * A step's `uses` comes back out of storage as the canonical ingredient
   * name — the spelling that said which line it meant is not a column. So a
   * revision that replaces `ingredients` and lets the steps come forward
   * arrives with a carried reference to "Glutinous rice" and two lines that
   * both answer to it, and `writeRevisionBody` used to bind it to whichever
   * came first. That is the reported production defect, reached through the
   * call shape `revise_recipe`'s own description recommends, and it survived
   * the guard on the mirror path because that one only fires on a
   * steps-only revision.
   *
   * The revision here drops the heading off the 400 g line, and that is
   * what makes it still a tie. `copySteps` now carries the heading forward
   * in front of the name, so a caller that keeps its headings keeps its
   * bindings and this call would be accepted — which is the test above.
   * A caller that leaves the headings off has taken away the one thing that
   * separated the two lines, and gets this refusal instead of a binding
   * nobody asked for.
   */
  test('a carried step that fits two lines is refused when no heading separates them', async () => {
    const mcp = rw();

    const lines = (riceToServe: string, heading: string | undefined) => [
      {
        name: 'Glutinous rice',
        quantity: 45,
        unit: 'g',
        component: 'Khao khua',
      },
      {
        name: riceToServe,
        quantity: 400,
        unit: 'g',
        component: heading,
      },
      { name: 'Duck breast', quantity: 500, unit: 'g' },
    ];

    const message = await refusal(
      mcp.call('revise_recipe', {
        slug: AMBIG_SLUG,
        rationale: 'A little more rice in the powder.',
        ingredients: lines(ALIAS_SPELLING, undefined),
      }),
    );
    // A line with no heading is named by its amount, which is the only
    // handle it has left.
    expect(message).toMatch(
      /2 lines of that ingredient: Khao khua \(45 g\), 400 g\./,
    );
    expect(message).toMatch(/must point to one line/);
    // And only the line that still has a heading is offered a component
    // spelling. The other one is what the alias paragraph is for.
    expect(message).toMatch(/Write "Khao khua: Glutinous rice"\./);
    // The paragraph that offers it must say so. It is an imperative and it
    // comes first, so a caller that means the 400 g line would otherwise
    // follow it, write the one spelling on offer and bind its step to the
    // 40 g line — the laab-ped defect, written back by the message that
    // exists to stop it.
    expect(message).toMatch(/This does not give a spelling for every line\./);
    // The way out on this path is the other list, not a rename: the caller
    // holds the lines already and only the steps are missing.
    expect(message).toMatch(/Send `steps` alongside `ingredients`/);
    expect(message).not.toMatch(/internal error/i);

    // Nothing was written.
    const refused = await mcp.call<StepRecipeResult>('get_recipe', {
      slug: AMBIG_SLUG,
    });
    expect(
      refused.ingredients.find((l) => l.component === 'Khao khua')!.quantity,
    ).toBe(40);

    // Send both lists and it goes through, still bound to the 400 g line.
    await mcp.call('revise_recipe', {
      slug: AMBIG_SLUG,
      rationale: 'A little more rice in the powder.',
      ingredients: lines(ALIAS_SPELLING, 'To serve'),
      steps: [
        {
          instruction: 'Glutinous rice for the table into cold water.',
          uses: [ALIAS_SPELLING],
        },
      ],
    });
    const fixed = await mcp.call<StepRecipeResult>('get_recipe', {
      slug: AMBIG_SLUG,
    });
    const toServe = fixed.ingredients.find((l) => l.component === 'To serve')!;
    expect(toServe.quantity).toBe(400);
    expect(fixed.steps[0]!.uses.map((u) => u.recipeIngredientId)).toEqual([
      toServe.id,
    ]);

    // The rule sits only where the tie is real. An ingredients-only revision
    // that leaves one line per ingredient still goes through, and a caller
    // that drops the ingredient a carried step named means to drop it — the
    // reference goes with the line, the way it always has.
    await expect(
      mcp.call('revise_recipe', {
        slug: AMBIG_SLUG,
        rationale: 'No rice at all. It goes with sticky rice from the shop.',
        ingredients: [{ name: 'Duck breast', quantity: 500, unit: 'g' }],
      }),
    ).resolves.toBeTruthy();

    const dropped = await mcp.call<StepRecipeResult>('get_recipe', {
      slug: AMBIG_SLUG,
    });
    expect(dropped.steps[0]!.uses).toEqual([]);
  });

  /**
   * The alias remedy only works if a written name outranks a canonical one,
   * and the order of the lines decides whether it did.
   *
   * `writeRevisionBody` keys each line under the name as written and under
   * the canonical ingredient name, first-wins. Indexing both together let
   * line 1's canonical name take the key of line 2's *written* name, so a
   * recipe that puts the alias line first bound the next line's own name to
   * the wrong line — silently, through `create_recipe`, in one call. That is
   * the deployed defect, reproduced after the guard that was supposed to
   * close it, because the guard counts written names and these two differ.
   *
   * The lines here are the same two as the test above, in the other order.
   */
  test('a line written under an alias does not take the next line’s name', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Laab ped, the rice listed the other way round',
      slug: ORDER_SLUG,
      kind: 'recipe',
      rationale: 'The table rice is listed first. The powder rice second.',
      ingredients: [
        {
          name: ALIAS_SPELLING,
          quantity: 400,
          unit: 'g',
          component: 'To serve',
        },
        {
          name: 'Glutinous rice',
          quantity: 40,
          unit: 'g',
          component: 'Khao khua',
        },
      ],
      steps: [
        {
          instruction: 'Dry-toast the rice for the powder.',
          uses: ['Glutinous rice'],
        },
      ],
    });

    const recipe = await mcp.call<StepRecipeResult>('get_recipe', {
      slug: ORDER_SLUG,
    });
    const powder = recipe.ingredients.find(
      (line) => line.component === 'Khao khua',
    )!;
    expect(powder.quantity).toBe(40);
    // "Glutinous rice" is the second line's own name. It must reach it.
    expect(recipe.steps[0]!.uses.map((u) => u.recipeIngredientId)).toEqual([
      powder.id,
    ]);

    // And the alias still reaches the line that carries it.
    await mcp.call('revise_recipe', {
      slug: ORDER_SLUG,
      rationale: 'A step for the table rice as well.',
      ingredients: [
        {
          name: ALIAS_SPELLING,
          quantity: 400,
          unit: 'g',
          component: 'To serve',
        },
        {
          name: 'Glutinous rice',
          quantity: 40,
          unit: 'g',
          component: 'Khao khua',
        },
      ],
      steps: [
        {
          instruction: 'Dry-toast the rice for the powder.',
          uses: ['Glutinous rice'],
        },
        {
          instruction: 'Steam the rice for the table.',
          uses: [ALIAS_SPELLING],
        },
      ],
    });

    const both = await mcp.call<StepRecipeResult>('get_recipe', {
      slug: ORDER_SLUG,
    });
    const byComponent = Object.fromEntries(
      both.ingredients.map((line) => [line.component, line.id]),
    );
    expect(
      both.steps.map((step) => [
        step.instruction,
        step.uses.map((u) => u.recipeIngredientId),
      ]),
    ).toEqual([
      ['Dry-toast the rice for the powder.', [byComponent['Khao khua']]],
      ['Steam the rice for the table.', [byComponent['To serve']]],
    ]);
  });

  /**
   * The same rule, on the path the parse boundary cannot see.
   *
   * A revision that sends `steps` and no `ingredients` carries the lines
   * forward, so Zod has no list to check the names against and
   * `reviseRecipe` cross-checks them itself. Without this half a caller
   * still reaches the wrong chip in two calls: create the two lines with no
   * step naming them, which is legal and stays legal, then add the step in a
   * second call and get the silent first-wins binding through a tool that
   * never saw both lists at once.
   *
   * The last two assertions are the ones that keep the rule survivable. A
   * name that fits one line must still resolve against carried-forward
   * lines, and a revision that sends neither list must still go through —
   * every recipe that already holds two lines of one name depends on it, and
   * refusing that would leave them revisable by nobody.
   */
  test('a carried-forward line that fits two names is refused on a steps-only revision', async () => {
    const mcp = rw();

    // Two rice lines and no step that names them. Both lines are right, so
    // this is accepted, and that is the state the second call arrives into.
    await mcp.call<WriteResult>('create_recipe', {
      title: 'Laab ped, written in two calls',
      slug: CARRIED_SLUG,
      kind: 'recipe',
      rationale: 'The lines first. The steps come in the next call.',
      ingredients: [
        {
          name: 'Glutinous rice',
          quantity: 40,
          unit: 'g',
          component: 'Khao khua',
        },
        {
          name: 'Glutinous rice',
          quantity: 400,
          unit: 'g',
          component: 'To serve',
        },
        { name: 'Duck breast', quantity: 500, unit: 'g' },
      ],
      steps: [{ instruction: 'Sear the duck breast skin-side down.' }],
    });

    const message = await refusal(
      mcp.call('revise_recipe', {
        slug: CARRIED_SLUG,
        rationale: 'Adding the soaking step.',
        steps: [
          {
            instruction: 'Glutinous rice for the table into cold water.',
            uses: ['Glutinous rice'],
          },
        ],
      }),
    );
    expect(message).toMatch(/Khao khua \(40 g\).*To serve \(400 g\)/s);
    // And it says the way out, which on this path is not the same sentence
    // as on the parse path: the lines are not in the caller's hand.
    expect(message).toMatch(/Send `ingredients` alongside `steps`/);

    // Nothing was written. A refused revision leaves the current version
    // where it was.
    const refused = await mcp.call<StepRecipeResult>('get_recipe', {
      slug: CARRIED_SLUG,
    });
    expect(refused.steps.map((step) => step.instruction)).toEqual([
      'Sear the duck breast skin-side down.',
    ]);

    // A name that fits exactly one carried-forward line still resolves.
    await expect(
      mcp.call('revise_recipe', {
        slug: CARRIED_SLUG,
        rationale: 'The duck gets a step of its own.',
        steps: [
          {
            instruction: 'Sear the duck breast skin-side down.',
            uses: ['Duck breast'],
          },
        ],
      }),
    ).resolves.toBeTruthy();

    // And a revision that sends neither list still goes through, with both
    // rice lines intact. This is the assertion that says the refusal sits
    // only where a caller supplied the steps.
    await expect(
      mcp.call('revise_recipe', {
        slug: CARRIED_SLUG,
        rationale: 'A note-only revision. Neither list is sent.',
      }),
    ).resolves.toBeTruthy();

    const carried = await mcp.call<RecipeResult>('get_recipe', {
      slug: CARRIED_SLUG,
    });
    const rice = carried.ingredients.filter((line) =>
      /glutinous rice/i.test(line.ingredient?.name ?? line.rawText),
    );
    expect(rice.map((line) => line.quantity).sort((a, b) => a! - b!)).toEqual([
      40, 400,
    ]);
  });

  /**
   * The second way out of the tie, and the cheap one.
   *
   * #9 turned "one name, two lines" into a refusal, which stopped a wrong
   * number reaching a cook. It left exactly one way through: give one line
   * a second spelling, and register that spelling on the ingredient in a
   * call of its own before the recipe may be written. That works. It costs
   * two calls and an invented name.
   *
   * A step can instead name the heading its line sits under. Both lines
   * here carry the SAME name, which is the shape the alias route cannot
   * express without changing one of them, and it is the shape the deployed
   * recipe has: laab-ped lists 40 g of glutinous rice for the toasted
   * powder and 400 g to serve.
   *
   * The assertion is on the line id and not on the amount beside the chip.
   * A chip reading "40 g" against the table rice is wrong in a way a reader
   * can see. A chip bound to the wrong row is wrong in a way only the id
   * shows, and that binding is the whole of what this branch changes.
   */
  test('a step that names a component binds to that line', async () => {
    const mcp = rw();

    await mcp.call<WriteResult>('create_recipe', {
      title: 'Laab ped, the rice named by its heading',
      slug: QUALIFIED_SLUG,
      kind: 'recipe',
      rationale: 'One ingredient on two lines, and a step for each of them.',
      ingredients: [
        {
          name: 'Glutinous rice',
          quantity: 40,
          unit: 'g',
          component: 'Khao khua',
        },
        {
          name: 'Glutinous rice',
          quantity: 400,
          unit: 'g',
          component: 'To serve',
        },
        { name: 'Duck breast', quantity: 500, unit: 'g' },
      ],
      steps: [
        {
          instruction: 'Dry-toast the rice for the powder.',
          uses: ['Khao khua: Glutinous rice'],
        },
        {
          instruction: 'Glutinous rice for the table into cold water.',
          uses: ['To serve: Glutinous rice'],
        },
        // A bare name over a line that carries no heading. It is looked up
        // before the string is ever scanned for a colon, so it resolves the
        // way it always has.
        {
          instruction: 'Sear the duck breast skin-side down.',
          uses: ['Duck breast'],
        },
      ],
    });

    const recipe = await mcp.call<StepRecipeResult>('get_recipe', {
      slug: QUALIFIED_SLUG,
    });
    const powder = recipe.ingredients.find(
      (line) => line.component === 'Khao khua',
    )!;
    const toServe = recipe.ingredients.find(
      (line) => line.component === 'To serve',
    )!;
    const duck = recipe.ingredients.find((line) => line.component === null)!;
    // The two numbers the ids have to keep apart.
    expect(powder.quantity).toBe(40);
    expect(toServe.quantity).toBe(400);

    expect(
      recipe.steps.map((step) => [
        step.instruction,
        step.uses.map((u) => u.recipeIngredientId),
      ]),
    ).toEqual([
      ['Dry-toast the rice for the powder.', [powder.id]],
      ['Glutinous rice for the table into cold water.', [toServe.id]],
      ['Sear the duck breast skin-side down.', [duck.id]],
    ]);
  });

  /**
   * The reason the component route exists at all, rather than the alias one
   * being made cheaper.
   *
   * A second spelling that is not registered as an alias mints a second
   * canonical ingredient, and `build_shopping_list` then reports 40 g and
   * 400 g as two rows that can never sum — the defect the refusal's last
   * sentence warns about, and one no write path in this repository can undo.
   * Naming the heading renames nothing: the two lines stay one ingredient,
   * so the list still adds them.
   *
   * The step chips are right in both worlds. The shopping list is right in
   * only one, so this is the assertion that says the branch met its point
   * and not merely its API.
   *
   * The recipe is written here rather than read off the one above, so that
   * this assertion fails in this test when the component route stops
   * working. A test that only read a recipe another test wrote would be
   * skipped behind that test's failure and prove nothing.
   */
  test('a component reference leaves the shopping list one row', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Laab ped, written for the shop',
      slug: LIST_SLUG,
      kind: 'recipe',
      rationale: 'Two rice lines, and a list that has to add them.',
      ingredients: [
        {
          name: 'Glutinous rice',
          quantity: 40,
          unit: 'g',
          component: 'Khao khua',
        },
        {
          name: 'Glutinous rice',
          quantity: 400,
          unit: 'g',
          component: 'To serve',
        },
      ],
      steps: [
        {
          instruction: 'Dry-toast the rice for the powder.',
          uses: ['Khao khua: Glutinous rice'],
        },
        {
          instruction: 'Steam the rice for the table.',
          uses: ['To serve: Glutinous rice'],
        },
      ],
    });

    const list = await mcp.call<ShoppingResult>('build_shopping_list', {
      slugs: [LIST_SLUG],
    });
    const rice = list.groups
      .flatMap((group) => group.entries)
      .filter((entry) => /rice/i.test(entry.name));

    // One row, one canonical ingredient, and 40 g plus 400 g added.
    expect(rice).toHaveLength(1);
    expect(rice[0]!.slug).toBe('glutinous-rice');
    expect(rice[0]!.amounts).toEqual(['440 g']);
  });

  /**
   * The separator is the colon alone, and both halves are matched the way
   * the bare index matches them: trimmed and lowercased.
   *
   * Requiring ": " exactly would turn a one-character slip into a refused
   * write and buy nothing, because the split is on the last colon and the
   * space adds no information. And a model that has just read "To serve"
   * off a page writes it back in whatever case the page used.
   */
  test('a component reference ignores case and spacing', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Laab ped, the heading written three ways',
      slug: SPACING_SLUG,
      kind: 'recipe',
      rationale: 'Three spellings of one heading, all meaning one line.',
      ingredients: [
        {
          name: 'Glutinous rice',
          quantity: 40,
          unit: 'g',
          component: 'Khao khua',
        },
        {
          name: 'Glutinous rice',
          quantity: 400,
          unit: 'g',
          component: 'To serve',
        },
      ],
      steps: [
        {
          instruction: 'Rinse the rice for the table.',
          uses: ['to serve:glutinous rice'],
        },
        {
          instruction: 'Soak the rice for the table.',
          uses: ['To serve : Glutinous rice'],
        },
        {
          instruction: 'Drain the rice for the table.',
          uses: ['  TO SERVE:   GLUTINOUS RICE  '],
        },
      ],
    });

    const recipe = await mcp.call<StepRecipeResult>('get_recipe', {
      slug: SPACING_SLUG,
    });
    const toServe = recipe.ingredients.find(
      (line) => line.component === 'To serve',
    )!;
    expect(toServe.quantity).toBe(400);
    expect(
      recipe.steps.map((step) => step.uses.map((u) => u.recipeIngredientId)),
    ).toEqual([[toServe.id], [toServe.id], [toServe.id]]);
  });

  /**
   * The regression guard for every recipe in the archive.
   *
   * A bare name is looked up first at all three sites and returns before
   * the string is scanned for a colon, so nothing that binds today can
   * move. The sharp edge is a written name that itself holds a colon: it
   * binds bare, and it is never split into a heading that some other line
   * happens to carry. That is why bare-first is a rule and not a
   * performance choice — 42 ingredient names and 49 alias spellings in the
   * archive hold no colon, but nothing stops the next one.
   *
   * The last step proves the other half of the split rule. The name is what
   * follows the LAST colon, so a heading that ends in one — the frozen
   * prose archive is full of "For the boil:" — stays writable with no
   * escape character.
   */
  test('a bare name that fits one line still binds, colon or not', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Poached chicken with a chilli dressing',
      slug: COLON_SLUG,
      kind: 'recipe',
      rationale: 'A written name that holds a colon, beside the split.',
      ingredients: [
        // This name holds a colon, and "Chilli" is the heading over the
        // line below it. Split the string first and the reference lands on
        // the wrong line, with the wrong number.
        {
          name: "Chilli: bird's eye",
          quantity: 6,
          unit: 'g',
          component: 'Dressing',
        },
        {
          name: "Bird's eye",
          quantity: 2,
          unit: 'g',
          component: 'Chilli',
        },
        { name: 'Water', quantity: 2, unit: 'l', component: 'For the boil:' },
      ],
      steps: [
        {
          instruction: 'Pound the dressing chilli to a paste.',
          uses: ["Chilli: bird's eye"],
        },
        {
          instruction: 'Slice the garnish chilli into rings.',
          uses: ["Bird's eye"],
        },
        // Both halves are trimmed, so a heading that ends in a colon needs
        // no escape: the last colon is the separator and the one before it
        // belongs to the heading.
        {
          instruction: 'Bring the water to a boil.',
          uses: ['For the boil:: Water'],
        },
      ],
    });

    const recipe = await mcp.call<StepRecipeResult>('get_recipe', {
      slug: COLON_SLUG,
    });
    const byComponent = Object.fromEntries(
      recipe.ingredients.map((line) => [line.component, line]),
    );
    expect(byComponent['Dressing']!.quantity).toBe(6);
    expect(byComponent['Chilli']!.quantity).toBe(2);

    expect(
      recipe.steps.map((step) => step.uses.map((u) => u.recipeIngredientId)),
    ).toEqual([
      [byComponent['Dressing']!.id],
      [byComponent['Chilli']!.id],
      [byComponent['For the boil:']!.id],
    ]);
  });

  /**
   * The refusal has two ways out to name now, and it must name only the
   * ones that work.
   *
   * The component route leads, because it is one call against the alias
   * route's two and it invents no name. The alias route stays, because it
   * is the only thing that separates two lines sharing a heading as well as
   * a name — and a message that offered a component spelling for that pair
   * would be a second refusal dressed as a remedy.
   */
  test('the ambiguity refusal names both ways out, and only the ones that work', async () => {
    const mcp = rw();

    const separable = await refusal(
      mcp.call('create_recipe', {
        title: 'Laab ped, refused with two ways out',
        slug: TWO_ROUTES_SLUG,
        kind: 'recipe',
        rationale: 'A bare name over two lines, so the message can be read.',
        ingredients: [
          {
            name: 'Glutinous rice',
            quantity: 40,
            unit: 'g',
            component: 'Khao khua',
          },
          {
            name: 'Glutinous rice',
            quantity: 400,
            unit: 'g',
            component: 'To serve',
          },
        ],
        steps: [{ instruction: 'Rinse the rice.', uses: ['Glutinous rice'] }],
      }),
    );

    expect(separable).toMatch(/Khao khua \(40 g\).*To serve \(400 g\)/s);
    expect(separable).toMatch(/must point to one line/);
    // Route one. Both spellings are offered, because either line may be the
    // one the caller meant and the message cannot know which.
    expect(separable).toMatch(/Put the line's `component` in front of the/);
    expect(separable).toMatch(
      /"Khao khua: Glutinous rice" or "To serve: Glutinous rice"/,
    );
    expect(separable).toMatch(/A colon separates the two/);
    // Route two, kept whole and kept second.
    expect(separable).toMatch(/Or give one line a second spelling/);
    expect(separable).toMatch(/upsert_ingredient/);
    expect(separable).toMatch(/aliases/);

    // Nothing was written.
    await expect(
      mcp.call('get_recipe', { slug: TWO_ROUTES_SLUG }),
    ).rejects.toThrow(/No recipe/i);

    // One name, one heading, twice. A component carries nothing that tells
    // these two apart, so the paragraph that offers one must not be printed.
    const inseparable = await refusal(
      mcp.call('create_recipe', {
        title: 'Laab ped, both lines under one heading',
        slug: ONE_HEADING_SLUG,
        kind: 'recipe',
        rationale: 'Two lines that no heading can separate.',
        ingredients: [
          {
            name: 'Glutinous rice',
            quantity: 40,
            unit: 'g',
            component: 'Khao khua',
          },
          {
            name: 'Glutinous rice',
            quantity: 40,
            unit: 'g',
            component: 'Khao khua',
          },
        ],
        steps: [{ instruction: 'Rinse the rice.', uses: ['Glutinous rice'] }],
      }),
    );

    expect(inseparable).not.toMatch(/`component` in front of the/);
    expect(inseparable).not.toMatch(/A colon separates the two/);
    // The alias route stands alone here, and it opens the sentence rather
    // than following one that is not there.
    expect(inseparable).toMatch(/Give one line a second spelling/);
    expect(inseparable).toMatch(/upsert_ingredient/);
    expect(inseparable).toMatch(/aliases/);
    // And the two lines are still told apart in the sentence. One heading
    // and one amount describe them identically, so each takes its position
    // in the list — otherwise the message names one line twice.
    expect(inseparable).toMatch(
      /Khao khua \(40 g\) \(line 1\), Khao khua \(40 g\) \(line 2\)/,
    );
  });

  /**
   * A heading the list cannot answer is refused, not quietly dropped.
   *
   * Falling back to the bare name would bind the step to a line the caller
   * did not name, in exactly the class of recipe where the wrong line costs
   * a real number. That is the defect #9 exists to stop. The heading is
   * information the caller volunteered; if it is wrong then either the
   * heading or the caller's model of the dish is wrong, and both are worth
   * one round trip.
   *
   * The message names the two halves separately, because a caller cannot
   * see which half it got wrong from a sentence that quotes the whole
   * string — and "not in the ingredient list" would send it to check the
   * name, which is the half that is right.
   */
  test('a component no line carries is refused, and the message names it', async () => {
    const mcp = rw();

    const wrongHeading = await refusal(
      mcp.call('create_recipe', {
        title: 'Laab ped, a heading this list does not have',
        slug: WRONG_HEADING_SLUG,
        kind: 'recipe',
        rationale: 'The heading is wrong. Both lines are right.',
        ingredients: [
          {
            name: 'Glutinous rice',
            quantity: 40,
            unit: 'g',
            component: 'Khao khua',
          },
          {
            name: 'Glutinous rice',
            quantity: 400,
            unit: 'g',
            component: 'To serve',
          },
        ],
        steps: [
          {
            instruction: 'Rinse the rice.',
            uses: ['To table: Glutinous rice'],
          },
        ],
      }),
    );

    expect(wrongHeading).toMatch(/Step 1 uses "To table: Glutinous rice"/);
    expect(wrongHeading).toMatch(/This reads as a component and a name/);
    expect(wrongHeading).toMatch(
      /No line has the component "To table" with the name "Glutinous rice"/,
    );
    // The answer, and not only the complaint: the headings it could have
    // written are in the sentence.
    expect(wrongHeading).toMatch(
      /The components in this list are: Khao khua, To serve/,
    );
    expect(wrongHeading).toMatch(
      /Write a component this list has, or write the name with no component/,
    );
    expect(wrongHeading).not.toMatch(/internal error/i);

    // Nothing was written.
    await expect(
      mcp.call('get_recipe', { slug: WRONG_HEADING_SLUG }),
    ).rejects.toThrow(/No recipe/i);

    // A list with no headings at all says so, rather than listing nothing
    // and leaving the caller to read an empty sentence.
    const noHeadings = await refusal(
      mcp.call('create_recipe', {
        title: 'Laab ped, a list with no headings',
        slug: NO_HEADING_SLUG,
        kind: 'recipe',
        rationale: 'No line here carries a component.',
        ingredients: [{ name: 'Duck breast', quantity: 500, unit: 'g' }],
        steps: [
          {
            instruction: 'Sear the duck breast skin-side down.',
            uses: ['To serve: Duck breast'],
          },
        ],
      }),
    );
    // And the advice that follows fits the list it was given. "Write a
    // component this list has" contradicted the sentence before it, on the
    // commonest recipe shape there is.
    expect(noHeadings).toMatch(
      /No line in this list has a component\. Write the name with no component\./,
    );
    expect(noHeadings).not.toMatch(/Write a component this list has/);

    // And an ordinary typo keeps the ordinary words, byte for byte. A
    // caller that misspelt a name must not be sent hunting for a heading it
    // never wrote.
    const typo = await refusal(
      mcp.call('create_recipe', {
        title: 'Laab ped, a misspelt name',
        slug: TYPO_SLUG,
        kind: 'recipe',
        rationale: 'A name that is in no list at all.',
        ingredients: [{ name: 'Duck breast', quantity: 500, unit: 'g' }],
        steps: [{ instruction: 'Bruise the leaf.', uses: ['Pandan leaf'] }],
      }),
    );
    expect(typo).toMatch(
      /uses "Pandan leaf", which is not in the ingredient list\. Add it to `ingredients` or remove it from `uses`\./,
    );
    expect(typo).not.toMatch(/reads as a component/);
  });

  /**
   * A kept step has to survive the revision that replaces the lines under
   * it, or the component route works once and dies.
   *
   * `revise_recipe` with `ingredients` and no `steps` copies the steps
   * forward, and a step's `uses` comes back out of storage as the canonical
   * ingredient name: the spelling that said which line it meant is not a
   * column. So `copySteps` writes the heading back in front of the name
   * whenever two lines of that revision answer to it, and a caller that
   * keeps its headings keeps its bindings. Without that half, the first
   * ingredients-only revision would send the caller back to re-typing every
   * step by hand — which is the heavy path this branch removes.
   *
   * The second half is what keeps it honest. A caller that renames the
   * heading has taken the pointer away, and the carried reference falls
   * back to the bare name and meets #9's refusal. It does not invent a
   * binding out of the half it can still read.
   */
  test('a carried component reference survives an ingredients-only revision', async () => {
    const mcp = rw();

    const lines = (heading: string, powder: number) => [
      {
        name: 'Glutinous rice',
        quantity: powder,
        unit: 'g',
        component: 'Khao khua',
      },
      {
        name: 'Glutinous rice',
        quantity: 400,
        unit: 'g',
        component: heading,
      },
      { name: 'Duck breast', quantity: 500, unit: 'g' },
    ];

    await mcp.call('create_recipe', {
      title: 'Laab ped, revised without its steps',
      slug: CARRY_SLUG,
      kind: 'recipe',
      rationale: 'The lines will be replaced. The step must keep its line.',
      ingredients: lines('To serve', 40),
      steps: [
        {
          instruction: 'Glutinous rice for the table into cold water.',
          uses: ['To serve: Glutinous rice'],
        },
      ],
    });

    // The headings are kept, so the carried reference still fits. This is
    // the call that is refused without `copySteps` carrying the heading.
    await mcp.call('revise_recipe', {
      slug: CARRY_SLUG,
      rationale: 'A little more rice in the powder.',
      ingredients: lines('To serve', 45),
    });

    const kept = await mcp.call<StepRecipeResult>('get_recipe', {
      slug: CARRY_SLUG,
    });
    expect(
      kept.ingredients.find((line) => line.component === 'Khao khua')!.quantity,
    ).toBe(45);
    const toServe = kept.ingredients.find(
      (line) => line.component === 'To serve',
    )!;
    expect(toServe.quantity).toBe(400);
    expect(kept.steps[0]!.uses.map((u) => u.recipeIngredientId)).toEqual([
      toServe.id,
    ]);

    // Rename the heading and the pointer is gone. The reference degrades to
    // the bare name, which fits both lines, and is refused rather than
    // bound to whichever comes first.
    const renamed = await refusal(
      mcp.call('revise_recipe', {
        slug: CARRY_SLUG,
        rationale: 'The table rice gets a new heading.',
        ingredients: lines('At the table', 45),
      }),
    );
    expect(renamed).toMatch(/Khao khua \(45 g\).*At the table \(400 g\)/s);
    expect(renamed).toMatch(/must point to one line/);
    // The way out names the heading the caller has just written, not the
    // one it dropped.
    expect(renamed).toMatch(
      /"Khao khua: Glutinous rice" or "At the table: Glutinous rice"/,
    );
    expect(renamed).toMatch(/Send `steps` alongside `ingredients`/);
    // The alias example is built from the bare name. A carried reference
    // arrives here already spelling a heading, and "To serve: Glutinous
    // rice, at the table" is not a spelling anyone should register as a
    // second name for an ingredient.
    expect(renamed).toMatch(/such as "Glutinous rice, at the table"/);
    expect(renamed).not.toMatch(/internal error/i);

    // Nothing was written. The heading and the binding are where they were.
    const refused = await mcp.call<StepRecipeResult>('get_recipe', {
      slug: CARRY_SLUG,
    });
    const still = refused.ingredients.find(
      (line) => line.component === 'To serve',
    )!;
    expect(still.quantity).toBe(400);
    expect(refused.steps[0]!.uses.map((u) => u.recipeIngredientId)).toEqual([
      still.id,
    ]);
  });

  /**
   * The line the review found untested, and it is load bearing.
   *
   * A qualified key is pushed twice for one line: once under the name the
   * caller WROTE, and once under the ingredient's CANONICAL name. The second
   * push is what this covers.
   *
   * The shape is a line written under an alias. `create_recipe` indexes a
   * qualified key by the written name, so the step names the alias and
   * binds. An ingredients-only revision then carries that step forward
   * through `copySteps`, which returns the CANONICAL name — so the carried
   * reference arrives spelling a name this line was never written under.
   * Only the second push makes it resolve.
   *
   * Drop that one line and this call is refused with "must point to one
   * line", because the carried reference falls back to its bare tail and the
   * bare tail fits both lines. Every other contract test stays green.
   */
  test('a carried reference resolves a line written under an alias', async () => {
    const mcp = rw();

    // One ingredient, two spellings. This is the whole point: the two lines
    // stay one ingredient, so a shopping list still adds their amounts.
    await mcp.call('upsert_ingredient', {
      name: 'Glutinous rice',
      slug: 'glutinous-rice',
      category: 'grain',
      aliases: ['Sticky rice'],
    });

    const lines = (powder: number) => [
      {
        name: 'Glutinous rice',
        quantity: powder,
        unit: 'g',
        component: 'Khao khua',
      },
      // Written under the alias, not the canonical name.
      {
        name: 'Sticky rice',
        quantity: 400,
        unit: 'g',
        component: 'To serve',
      },
    ];

    await mcp.call('create_recipe', {
      title: 'Laab ped, one line written under an alias',
      slug: ALIAS_HEAD_SLUG,
      kind: 'recipe',
      rationale: 'The table rice is written under the name it is sold as.',
      ingredients: lines(40),
      steps: [
        {
          instruction: 'The rice for the table into cold water.',
          // The written spelling. This is what `create_recipe` indexes.
          uses: ['To serve: Sticky rice'],
        },
      ],
    });

    const made = await mcp.call<StepRecipeResult>('get_recipe', {
      slug: ALIAS_HEAD_SLUG,
    });
    const served = made.ingredients.find(
      (line) => line.component === 'To serve',
    )!;
    expect(served.quantity).toBe(400);
    expect(made.steps[0]!.uses.map((u) => u.recipeIngredientId)).toEqual([
      served.id,
    ]);

    // The revision sends no steps. `copySteps` carries the reference
    // forward under the CANONICAL name, which this line was never written
    // under. It must still resolve, and to the same line.
    await mcp.call('revise_recipe', {
      slug: ALIAS_HEAD_SLUG,
      rationale: 'A little more rice in the powder.',
      ingredients: lines(45),
    });

    const revised = await mcp.call<StepRecipeResult>('get_recipe', {
      slug: ALIAS_HEAD_SLUG,
    });
    // The powder line moved, which is how we know the revision landed.
    expect(
      revised.ingredients.find((line) => line.component === 'Khao khua')!
        .quantity,
    ).toBe(45);
    const stillServed = revised.ingredients.find(
      (line) => line.component === 'To serve',
    )!;
    expect(stillServed.quantity).toBe(400);
    // The step kept an ingredient, and it kept the right one.
    expect(revised.steps[0]!.uses.map((u) => u.recipeIngredientId)).toEqual([
      stillServed.id,
    ]);
  });

  /**
   * The mirror of the test above, and the hole it left open.
   *
   * That one keeps both lines. This one leaves ONE of the two, which is
   * where the two layers disagreed. `checkCarriedUses` resolves the carried
   * "Khao khua: Glutinous rice" by its bare tail, finds the one surviving
   * line and lets the revision through. `writeRevisionBody` looked up the
   * heading, missed, and wrote no link at all. The call was accepted,
   * `unresolvedLinks` came back empty, `message` said nothing, and a step
   * that had an ingredient before the revision had none after it.
   *
   * It reaches recipes that never write a qualified `uses` at all.
   * `copySteps` puts the heading in front of a carried name whenever two
   * lines of the PREVIOUS revision answer to one canonical name — which is
   * exactly what #9's alias route produces — so a caller that has never
   * typed a colon meets this on its next ingredients-only revision.
   *
   * The assertion is on the id, because a lost link is invisible in every
   * other field of the result.
   */
  test('an ingredients-only revision that leaves one line keeps the step', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Laab ped, revised down to one rice line',
      slug: DROP_SLUG,
      kind: 'recipe',
      rationale: 'Two rice lines, and one step for each of them.',
      ingredients: [
        {
          name: 'Glutinous rice',
          quantity: 40,
          unit: 'g',
          component: 'Khao khua',
        },
        {
          name: 'Glutinous rice',
          quantity: 400,
          unit: 'g',
          component: 'To serve',
        },
        { name: 'Duck breast', quantity: 500, unit: 'g' },
      ],
      steps: [
        {
          instruction: 'Dry-toast the rice for the powder.',
          uses: ['Khao khua: Glutinous rice'],
        },
        {
          instruction: 'Glutinous rice for the table into cold water.',
          uses: ['To serve: Glutinous rice'],
        },
      ],
    });

    // One rice line is left, under a heading that neither carried reference
    // names. Both of them degrade to the bare name, which now fits exactly
    // one line, so both steps keep an ingredient.
    await mcp.call('revise_recipe', {
      slug: DROP_SLUG,
      rationale:
        'The powder is bought ready-made. Only the table rice is left.',
      ingredients: [
        {
          name: 'Glutinous rice',
          quantity: 400,
          unit: 'g',
          component: 'At the table',
        },
        { name: 'Duck breast', quantity: 500, unit: 'g' },
      ],
    });

    const revised = await mcp.call<StepRecipeResult>('get_recipe', {
      slug: DROP_SLUG,
    });
    const rice = revised.ingredients.find(
      (line) => line.component === 'At the table',
    )!;
    expect(rice.quantity).toBe(400);
    expect(
      revised.steps.map((step) => step.uses.map((u) => u.recipeIngredientId)),
    ).toEqual([[rice.id], [rice.id]]);
  });

  /**
   * An ambiguous bare name is refused as the ambiguity it is, colon or not.
   *
   * The bare lookup settles a reference before the string is scanned for a
   * colon, and the ambiguous answer settles it too. `writeRevisionBody`
   * takes any bare hit as authoritative and keeps the first of two, so a
   * string approved through the qualified index would be validated against
   * one line and written against another — a wrong amount rather than a
   * missing one.
   *
   * The refusal also has to be the one that carries a remedy. An ingredient
   * name may hold a colon, and the split takes the LAST one, so no
   * qualified spelling reaches such a line: "Dressing: Chilli: bird's eye"
   * reads as the component "Dressing: Chilli". The alias route is the only
   * way out of that pair, and only the ambiguity message names it.
   */
  test('an ambiguous bare name is refused as an ambiguity, colon or not', async () => {
    const mcp = rw();

    const colon = await refusal(
      mcp.call('create_recipe', {
        title: 'A dressing and a garnish from one chilli',
        slug: COLON_AMBIG_SLUG,
        kind: 'recipe',
        rationale: 'One name that holds a colon, written on two lines.',
        ingredients: [
          {
            name: "Chilli: bird's eye",
            quantity: 6,
            unit: 'g',
            component: 'Dressing',
          },
          {
            name: "Chilli: bird's eye",
            quantity: 2,
            unit: 'g',
            component: 'Garnish',
          },
        ],
        steps: [
          {
            instruction: 'Pound the chilli to a paste.',
            uses: ["Chilli: bird's eye"],
          },
        ],
      }),
    );
    expect(colon).toMatch(
      /2 lines of that ingredient: Dressing \(6 g\), Garnish \(2 g\)/,
    );
    expect(colon).toMatch(/must point to one line/);
    // The route that works is named. The one that cannot work is not
    // offered, because no component spelling of this name resolves.
    expect(colon).toMatch(/Give one line a second spelling/);
    expect(colon).toMatch(/upsert_ingredient/);
    expect(colon).toMatch(/aliases/);
    expect(colon).not.toMatch(/`component` in front of the/);
    expect(colon).not.toMatch(/reads as a component/);
    // And the alias it suggests is built from the whole written name, not
    // from the half after the colon.
    expect(colon).toMatch(/such as "Chilli: bird's eye, garnish"/);

    // The shape where the two ladders disagreed. The bare name fits two
    // lines, and a third line carries the component and the name that
    // splitting it would produce. Reading the qualified index here approved
    // the 5 g line while the writer bound the step to the first 10 g one.
    const shadowed = await refusal(
      mcp.call('create_recipe', {
        title: 'A cure with two salts',
        slug: SHADOW_SLUG,
        kind: 'recipe',
        rationale: 'A name with a colon, twice, beside a line that mimics it.',
        ingredients: [
          { name: 'Salt: kosher', quantity: 10, unit: 'g' },
          { name: 'Salt: kosher', quantity: 20, unit: 'g' },
          { name: 'kosher', quantity: 5, unit: 'g', component: 'Salt' },
        ],
        steps: [{ instruction: 'Mix the cure.', uses: ['Salt: kosher'] }],
      }),
    );
    expect(shadowed).toMatch(/2 lines of that ingredient: 10 g, 20 g/);
    expect(shadowed).toMatch(/must point to one line/);
    expect(shadowed).not.toMatch(/reads as a component/);

    // Neither call wrote anything.
    await expect(
      mcp.call('get_recipe', { slug: COLON_AMBIG_SLUG }),
    ).rejects.toThrow(/No recipe/i);
    await expect(mcp.call('get_recipe', { slug: SHADOW_SLUG })).rejects.toThrow(
      /No recipe/i,
    );
  });

  /**
   * A refusal on a steps-only revision has to say what to send next.
   *
   * The caller here holds the steps and not the lines, so "write a
   * component this list has" names a list it did not send and cannot change
   * in this call. Its real intent may be to give a line that heading, and
   * the only way to do that is to send `ingredients` too. Every other
   * refusal on this path carries that direction; the qualifier one dropped
   * it.
   */
  test('a steps-only revision is told it may send the lines as well', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Laab ped, revised by its steps alone',
      slug: HINT_SLUG,
      kind: 'recipe',
      rationale: 'The lines first. A step names a heading in the next call.',
      ingredients: [
        {
          name: 'Glutinous rice',
          quantity: 40,
          unit: 'g',
          component: 'Khao khua',
        },
        {
          name: 'Glutinous rice',
          quantity: 400,
          unit: 'g',
          component: 'To serve',
        },
      ],
      steps: [{ instruction: 'Dry-toast the rice for the powder.' }],
    });

    const message = await refusal(
      mcp.call('revise_recipe', {
        slug: HINT_SLUG,
        rationale: 'The table rice gets a step.',
        steps: [
          {
            instruction: 'Glutinous rice for the table into cold water.',
            uses: ['At the table: Glutinous rice'],
          },
        ],
      }),
    );
    expect(message).toMatch(
      /No line has the component "At the table" with the name "Glutinous rice"/,
    );
    expect(message).toMatch(
      /The components in this list are: Khao khua, To serve/,
    );
    expect(message).toMatch(
      /Send `ingredients` alongside `steps` to give a line that component\./,
    );
    expect(message).not.toMatch(/internal error/i);
  });

  /**
   * The bound that would have truncated the feature in silence.
   *
   * A `component` is 120 characters and a `name` is 200, so the longest
   * reference a caller may legally write is 322 — and `uses` items were
   * bounded at 200. A caller with long headings would have met "expected
   * string to have <=200 characters" on a payload where every field it sent
   * was legal, and nothing in that sentence names the real problem.
   */
  test('a component reference may be as long as its two halves allow', async () => {
    const mcp = rw();

    const component = 'Day one, the long cure'.padEnd(120, 'x');
    const name = 'Coarse sea salt from the long shore'.padEnd(200, 'x');
    const reference = `${component}: ${name}`;
    expect(reference.length).toBe(322);

    await mcp.call('create_recipe', {
      title: 'A cure with a very long heading',
      slug: LONG_SLUG,
      kind: 'recipe',
      rationale: 'The longest reference the contract allows.',
      ingredients: [{ name, quantity: 300, unit: 'g', component }],
      steps: [
        { instruction: 'Rub the cure over the meat.', uses: [reference] },
      ],
    });

    const recipe = await mcp.call<StepRecipeResult>('get_recipe', {
      slug: LONG_SLUG,
    });
    expect(recipe.steps[0]!.uses.map((u) => u.recipeIngredientId)).toEqual([
      recipe.ingredients[0]!.id,
    ]);

    // One character more. The extra character is a space, which the split
    // trims away before it matches anything, so the bound is the only thing
    // refusing this.
    const tooLong = await refusal(
      mcp.call('create_recipe', {
        title: 'A cure with a heading one character too long',
        slug: `${LONG_SLUG}-refused`,
        kind: 'recipe',
        rationale: 'One character past the bound.',
        ingredients: [{ name, quantity: 300, unit: 'g', component }],
        steps: [
          {
            instruction: 'Rub the cure over the meat.',
            uses: [`${component}:  ${name}`],
          },
        ],
      }),
    );
    expect(tooLong).toMatch(/322 characters/);
  });

  /**
   * `categories` is the one write in this repository that deletes, and the
   * rule has two halves that pull in opposite directions.
   *
   * `applyTaxonomy` deletes every tag of the recipe and then rewrites only
   * the category types present in the object, so a revision adding one
   * cuisine tag destroys the course tag and the technique tag. That is
   * deliberate — per-type merging would make a tag unremovable — but it is
   * the most damaging thing a caller can do by accident, and three
   * paragraphs of wire text were the only thing holding it. The other half,
   * `if (!taxonomy) return;`, is what makes "an omitted field carries
   * forward" true for tags, and nothing asserted it either.
   */
  test('categories replace on send and carry forward on omission', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Laab ped, tagged three ways',
      slug: TAG_SLUG,
      kind: 'recipe',
      rationale: 'Three category types, so a revision can drop two of them.',
      categories: {
        cuisine: ['Thai'],
        course: ['Main'],
        technique: ['Dry-toasting'],
      },
      ingredients: [{ name: 'Duck breast', quantity: 500, unit: 'g' }],
    });

    const typesOf = (rows: { categoryType: string; slug: string }[]) =>
      rows.map((t) => `${t.categoryType}/${t.slug}`).sort();

    const made = await mcp.call<{
      terms: { categoryType: string; slug: string }[];
    }>('get_recipe', { slug: TAG_SLUG });
    expect(typesOf(made.terms)).toEqual([
      'course/main',
      'cuisine/thai',
      'technique/dry-toasting',
    ]);

    // A revision that sends no `categories` changes no tag.
    await mcp.call('revise_recipe', {
      slug: TAG_SLUG,
      rationale: 'A rationale-only revision. The tags are not mentioned.',
    });
    const kept = await mcp.call<{
      terms: { categoryType: string; slug: string }[];
    }>('get_recipe', { slug: TAG_SLUG });
    expect(typesOf(kept.terms)).toEqual([
      'course/main',
      'cuisine/thai',
      'technique/dry-toasting',
    ]);

    // A revision that sends one category type destroys the other two. This
    // is the documented rule, and the assertion is here so that a later
    // change to per-type merging is a decision and not a slip.
    await mcp.call('revise_recipe', {
      slug: TAG_SLUG,
      rationale: 'Adding a second cuisine, and only a cuisine.',
      categories: { cuisine: ['Thai', 'Lao'] },
    });
    const replaced = await mcp.call<{
      terms: { categoryType: string; slug: string }[];
    }>('get_recipe', { slug: TAG_SLUG });
    expect(typesOf(replaced.terms)).toEqual(['cuisine/lao', 'cuisine/thai']);

    // And an empty object is a send, not an omission. It removes every tag,
    // which is the value a caller reaches for when it means "no change".
    await mcp.call('revise_recipe', {
      slug: TAG_SLUG,
      rationale: 'An empty categories object.',
      categories: {},
    });
    const emptied = await mcp.call<{
      terms: { categoryType: string; slug: string }[];
    }>('get_recipe', { slug: TAG_SLUG });
    expect(emptied.terms).toEqual([]);
  });

  test('a write says what it left bare', async () => {
    const mcp = rw();

    // Re-read through a revision so the report is exercised on both paths.
    const revised = await mcp.call<WriteResult>('revise_recipe', {
      slug: SLUG,
      rationale: 'Bumped the duck; the first batch was thin.',
      ingredients: [
        {
          name: 'Glutinous rice',
          quantity: 40,
          unit: 'g',
          component: 'Khao khua',
        },
        {
          name: 'Glutinous rice',
          quantity: 400,
          unit: 'g',
          component: 'To serve',
        },
        { name: 'Lemongrass', quantity: 2, unit: 'stalk' },
        { name: 'Duck breast', quantity: 700, unit: 'g' },
      ],
    });

    // The tags this recipe minted are named, not left for the caller to
    // notice. "Created." with nothing else is what let seven unexplained
    // tags and fifteen bare ingredients through unremarked.
    const tagSlugs = revised.needsDescription.categories.map((c) => c.slug);
    expect(tagSlugs).toContain('dry-toasting');

    const bare = revised.needsDescription.ingredients.map((i) => i.slug);
    expect(bare).toContain('duck-breast');
    expect(
      revised.needsDescription.ingredients[0]!.missing.length,
    ).toBeGreaterThan(0);

    // And the message says it in prose, because that is what gets read.
    expect(revised.message).toMatch(/upsert_category/);
    expect(revised.message).toMatch(/upsert_ingredient/);
  });

  test('duplicate lines sum into one shopping row', async () => {
    const mcp = rw();
    const list = await mcp.call<ShoppingResult>('build_shopping_list', {
      slugs: [SLUG],
    });

    const rows = list.groups
      .flatMap((group) => group.entries)
      .filter((entry) => /glutinous rice/i.test(entry.name));

    // One row, both lines added: 40 g for the khao khua plus 400 g to serve.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amounts.join(' ')).toMatch(/440/);
  });

  test('lines that share a unit sum in that unit, without converting', async () => {
    const mcp = rw();

    // Two tablespoons plus one tablespoon. No conversion is needed anywhere
    // in this sum, and the old aggregation performed one anyway: it added in
    // millilitres because that is the base unit of volume, then reported the
    // base — "44.4 ml" — for a quantity every cook would call 3 tbsp.
    await mcp.call('create_recipe', {
      title: 'Nam jim jaew',
      slug: SUM_SLUG,
      kind: 'recipe',
      rationale: 'The dipping sauce, so the two spoon lines have a home.',
      ingredients: [
        { name: 'Fish sauce', quantity: 2, unit: 'tbsp', component: 'Sauce' },
        {
          name: 'Fish sauce',
          quantity: 1,
          unit: 'tbsp',
          component: 'To finish',
        },
        // Same kind, different units: this one genuinely has to convert,
        // and must keep doing so.
        { name: 'Palm sugar', quantity: 800, unit: 'g', component: 'Sauce' },
        { name: 'Palm sugar', quantity: 1, unit: 'kg', component: 'To finish' },
      ],
      steps: [{ instruction: 'Stir until the sugar dissolves.' }],
    });

    const list = await mcp.call<ShoppingResult>('build_shopping_list', {
      slugs: [SUM_SLUG],
    });
    const rows = new Map(
      list.groups
        .flatMap((group) => group.entries)
        .map((entry) => [entry.name, entry.amounts.join(' + ')]),
    );

    expect(rows.get('Fish sauce')).toBe('3 tbsp');
    expect(rows.get('Palm sugar')).toBe('1.8 kg');
  });

  /**
   * The other half of R-SCR-19, which the two tests above do not reach.
   *
   * "Two amounts MUST add together only when one unit converts into the
   * other. 800 g and 1 kg become 1.8 kg. Two cloves and ten heads stay
   * apart." The tests above cover the adding: same unit, and two units of
   * one kind. Both would still pass if every count unit shared a bucket,
   * because every count unit carries `toBase: 1` and a sum would look
   * arithmetically fine — "3 pieces" of a thing nobody sells by the piece.
   *
   * `/list` asserts this on the page from seeded recipes
   * (`shopping-journey.spec.ts`, "a count keeps its own noun and its
   * plural"). This asserts it on the tool, which is where an agent building
   * a list for a shop meets it, and it asserts the rule rather than one
   * drawing of it: the row carries two amounts, and the word the sum would
   * have produced appears nowhere in it.
   */
  test('lines whose units do not convert stay apart', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Garlic confit',
      slug: COUNT_SLUG,
      kind: 'recipe',
      rationale: 'Two garlic lines, in two units that no one can convert.',
      ingredients: [
        { name: 'Garlic', quantity: 1, unit: 'head', component: 'Confit' },
        { name: 'Garlic', quantity: 2, unit: 'clove', component: 'To finish' },
      ],
      steps: [{ instruction: 'Hold the garlic in oil at 90 °C.' }],
    });

    const list = await mcp.call<ShoppingResult>('build_shopping_list', {
      slugs: [COUNT_SLUG],
    });
    const garlic = list.groups
      .flatMap((group) => group.entries)
      .find((entry) => /^garlic$/i.test(entry.name))!;

    // One row for the ingredient, and two amounts inside it. A head of
    // garlic is roughly ten cloves, and the shop sells neither as the other.
    expect(garlic.amounts.length).toBe(2);
    expect(new Set(garlic.amounts)).toEqual(new Set(['1 head', '2 cloves']));
    // The sum that must not have happened. Both units carry `toBase: 1`, so
    // a shared bucket would have read "3 pieces" — or "3", with no noun.
    expect(garlic.amounts.join(' + ')).not.toMatch(/\b3\b/);
  });

  test('an alias that already resolves elsewhere is refused, and named', async () => {
    const mcp = rw();

    // "coriander" belongs to the leaf. Claiming it for the seed would make
    // every future herb line bind to a spice, silently.
    await expect(
      mcp.call('upsert_ingredient', {
        name: 'Coriander seed',
        slug: 'coriander-seed',
        category: 'spice',
        aliases: ['coriander seeds', 'coriander'],
      }),
    ).rejects.toThrow(/already resolves to .*[Cc]oriander leaf/);
  });

  test('an ingredient may keep its own aliases on re-upsert', async () => {
    const mcp = rw();
    // The collision check must not fire on an ingredient's own aliases, or
    // no ingredient could ever be updated twice.
    await expect(
      mcp.call('upsert_ingredient', {
        name: 'Coriander leaf',
        slug: 'coriander-leaf',
        category: 'herb',
        aliases: ['coriander', 'cilantro', 'fresh coriander'],
      }),
    ).resolves.toBeTruthy();
  });

  /**
   * An upsert writes what it is given and leaves the rest alone.
   *
   * This is the defect that cost the most and showed the least. Every
   * optional field went into the UPDATE with a `??` fallback, so a call that
   * sent a name and a slug wrote `description = NULL`, `default_unit =
   * NULL`, `aliases = '{}'` and `category = 'other'` over whatever was
   * stored. Nothing said so. There is no undo — the write layer has no
   * history for ingredients — and the guide tells an agent to call this tool
   * after every recipe, which is exactly when it holds the least of the
   * record. A spice demoted to `other` also moves in a shopping list, so the
   * loss reaches a screen a person reads.
   *
   * The pair of assertions is the point. An omitted field must keep its
   * value AND an explicit null must still clear one, or the fix has traded
   * a silent wipe for a field nobody can empty.
   */
  test('a partial upsert keeps the fields it does not send', async () => {
    const mcp = rw();

    const DESCRIPTION =
      'Salted, fermented krill, pressed into a block. It carries the salt ' +
      'and the funk of a curry paste, so a paste made without it tastes thin.';

    await mcp.call('upsert_ingredient', {
      name: 'Fermented shrimp paste',
      slug: INGREDIENT_SLUG,
      plural: 'Fermented shrimp pastes',
      description: DESCRIPTION,
      densityGPerMl: 1.2,
      defaultUnit: 'g',
      aliases: ['kapi', 'belacan'],
    });

    // No `category` was sent, so the new row takes the column default. That
    // is the INSERT half of the same code path and it must not move.
    const stored = await mcp.call<IngredientResult>('get_ingredient', {
      slug: INGREDIENT_SLUG,
    });
    expect(stored.ingredient.category).toBe('other');
    expect(stored.ingredient.aliases.sort()).toEqual(['belacan', 'kapi']);

    // The call an agent actually makes: one field is wrong, so it sends that
    // field. Everything it did not mention is none of its business.
    await mcp.call('upsert_ingredient', {
      name: 'Fermented shrimp paste',
      slug: INGREDIENT_SLUG,
      category: 'condiment',
    });

    const kept = await mcp.call<IngredientResult>('get_ingredient', {
      slug: INGREDIENT_SLUG,
    });
    expect(kept.ingredient.category).toBe('condiment');
    expect(kept.ingredient.description).toBe(DESCRIPTION);
    expect(kept.ingredient.defaultUnit).toBe('g');
    expect(kept.ingredient.aliases.sort()).toEqual(['belacan', 'kapi']);
    // The two the report never named, and the two that were lost with them.
    expect(kept.ingredient.plural).toBe('Fermented shrimp pastes');
    expect(kept.ingredient.densityGPerMl).toBe(1.2);

    // An explicit null is still a clear. It has to be: without it a
    // description written by mistake could never be taken back.
    await mcp.call('upsert_ingredient', {
      name: 'Fermented shrimp paste',
      slug: INGREDIENT_SLUG,
      description: null,
      defaultUnit: null,
    });

    const cleared = await mcp.call<IngredientResult>('get_ingredient', {
      slug: INGREDIENT_SLUG,
    });
    expect(cleared.ingredient.description).toBeNull();
    expect(cleared.ingredient.defaultUnit).toBeNull();
    // And the same call left the fields it did not name where they were.
    expect(cleared.ingredient.category).toBe('condiment');
    expect(cleared.ingredient.densityGPerMl).toBe(1.2);
    expect(cleared.ingredient.aliases.sort()).toEqual(['belacan', 'kapi']);
  });

  test('an alias list is replaced by the one that is sent', async () => {
    const mcp = rw();

    // The other half of the rule, and the reason "keep what you did not
    // send" cannot be applied to `aliases` by simply resending nothing: a
    // sent list replaces, so a wrong alias is removable. Omission carries
    // forward; an empty list clears. Both are stated on the wire, in
    // `upsert_ingredient`'s own description.
    await mcp.call('upsert_ingredient', {
      name: 'Fermented shrimp paste',
      slug: INGREDIENT_SLUG,
      aliases: ['kapi', 'trassi'],
    });

    const replaced = await mcp.call<IngredientResult>('get_ingredient', {
      slug: INGREDIENT_SLUG,
    });
    expect(replaced.ingredient.aliases.sort()).toEqual(['kapi', 'trassi']);

    // The empty list is the escape hatch the description promises, and the
    // only way to empty an alias list once omission means "keep". It is also
    // where the mutation that turns replace into merge lands first.
    await mcp.call('upsert_ingredient', {
      name: 'Fermented shrimp paste',
      slug: INGREDIENT_SLUG,
      aliases: [],
    });
    const emptied = await mcp.call<IngredientResult>('get_ingredient', {
      slug: INGREDIENT_SLUG,
    });
    expect(emptied.ingredient.aliases).toEqual([]);
    // And it cleared only what it named.
    expect(emptied.ingredient.category).toBe('condiment');
    expect(emptied.ingredient.densityGPerMl).toBe(1.2);
  });

  /**
   * The alias guard states an invariant — "two ingredients cannot answer to
   * the same name" — and checked every field except the one that names the
   * row.
   *
   * `upsert_ingredient {name: 'silverside'}` against a beef silverside that
   * carries "silverside" as an alias made a second canonical row and took
   * the name over: `resolveIngredient` matches by slug before it matches by
   * alias, so every later recipe line naming silverside bound to the new,
   * empty stub. The canonical list is what makes referential queries
   * possible, and no write path in this repository deletes a row.
   */
  test('a name another ingredient answers to is refused, and named', async () => {
    const mcp = rw();

    await mcp.call('upsert_ingredient', {
      name: 'Contract silverside',
      slug: NAME_SLUG,
      category: 'protein',
      aliases: ['silverside cut', 'bottom round cut'],
    });

    const message = await refusal(
      mcp.call('upsert_ingredient', {
        name: 'silverside cut',
        category: 'protein',
        description: 'The cut, described on a record of its own.',
      }),
    );
    expect(message).toContain(NAME_SLUG);
    expect(message).toContain('Contract silverside');
    expect(message).not.toMatch(/internal error/i);

    // Nothing was created. There is still one record for the cut.
    await expect(
      mcp.call('get_ingredient', { slug: 'silverside-cut' }),
    ).rejects.toThrow(/No ingredient|not found/i);

    // And the ordinary call is untouched: a name that this record already
    // answers to still updates this record.
    await mcp.call('upsert_ingredient', {
      name: 'Contract silverside',
      slug: NAME_SLUG,
      densityGPerMl: 1.05,
    });
    const stored = await mcp.call<IngredientResult>('get_ingredient', {
      slug: NAME_SLUG,
    });
    expect(stored.ingredient.name).toBe('Contract silverside');
    expect(stored.ingredient.densityGPerMl).toBe(1.05);
    expect(stored.ingredient.aliases.sort()).toEqual([
      'bottom round cut',
      'silverside cut',
    ]);
  });

  test('a unit outside the vocabulary is refused, and the error names the set', async () => {
    const mcp = rw();

    await expect(
      mcp.call('revise_recipe', {
        slug: SLUG,
        rationale: 'Trying a unit nobody can convert.',
        ingredients: [{ name: 'Duck breast', quantity: 2, unit: 'sachet' }],
      }),
    ).rejects.toThrow(/not a unit this repository uses.*piece/s);
  });

  test('common spellings fold rather than being refused', async () => {
    const mcp = rw();

    await mcp.call('revise_recipe', {
      slug: SLUG,
      rationale: 'Written with plural and abbreviated unit spellings.',
      ingredients: [
        { name: 'Duck breast', quantity: 700, unit: 'g' },
        { name: 'Lemongrass', quantity: 2, unit: 'stalks' },
        { name: 'Lime', quantity: 3, unit: 'pc' },
      ],
    });

    const recipe = await mcp.call<RecipeResult>('get_recipe', { slug: SLUG });
    const units = Object.fromEntries(
      recipe.ingredients.map((line) => [
        line.ingredient?.slug ?? line.rawText,
        line.unit,
      ]),
    );
    expect(units['lemongrass']).toBe('stalk');
    expect(units['lime']).toBe('piece');
  });

  test('a research note without a source is refused, naming the field', async () => {
    const mcp = rw();

    await expect(
      mcp.call('add_note', {
        recipeSlug: SLUG,
        kind: 'research',
        title: 'Where to buy duck',
        body: 'The Vietnamese grocer on the corner has whole ducks on Fridays.',
      }),
    ).rejects.toThrow(/sources/);
  });

  test('a research note with a source is accepted', async () => {
    const mcp = rw();
    await expect(
      mcp.call('add_note', {
        recipeSlug: SLUG,
        kind: 'research',
        title: 'Where to buy duck',
        body: 'The Vietnamese grocer on the corner has whole ducks on Fridays.',
        sources: [{ title: 'Asked at the counter, March 2026' }],
      }),
    ).resolves.toBeTruthy();
  });

  test('other note kinds still take no sources', async () => {
    const mcp = rw();
    await expect(
      mcp.call('add_note', {
        recipeSlug: SLUG,
        kind: 'observation',
        body: 'The rice caught at the edges; a lower heat next time.',
      }),
    ).resolves.toBeTruthy();
  });

  /**
   * A source has to name something.
   *
   * The rule above counts the array. Every field on a source is optional, so
   * `{}` is a legal object, and one of them satisfied the count while naming
   * nothing at all — the research kind exists to record where a claim came
   * from, and `sources: [{}]` records that it came from somewhere. The page
   * then drew the row as "Untitled source". A blank string did the same, and
   * so did a bare `accessedAt`, which says when something was read without
   * ever saying what.
   *
   * All five note paths take sources, so the last two assertions check that
   * the rule reaches a path other than `add_note` and lands on the row that
   * is wrong rather than on the note.
   */
  test('a source that names nothing is refused, and the message says so', async () => {
    const mcp = rw();

    const note = (sources: unknown[]) => ({
      recipeSlug: SLUG,
      kind: 'research',
      title: 'Where to buy duck',
      body: 'The Vietnamese grocer on the corner has whole ducks on Fridays.',
      sources,
    });

    const empty = await refusal(mcp.call('add_note', note([{}])));
    expect(empty).toMatch(/sources/);
    // A source is a url, a title or a citation. The message names all three,
    // because a caller that is refused has to know what would be accepted.
    expect(empty).toMatch(/url/);
    expect(empty).toMatch(/title/);
    expect(empty).toMatch(/citation/);

    // A string of spaces is as empty as no string.
    expect(
      await refusal(mcp.call('add_note', note([{ title: '   ' }]))),
    ).toMatch(/sources/);

    // A date qualifies a source. It cannot be one.
    expect(
      await refusal(mcp.call('add_note', note([{ accessedAt: '2026-03-01' }]))),
    ).toMatch(/sources/);

    // Every entry has to hold up, not just one of them. A real book beside a
    // blank row does not make the blank row provenance.
    expect(
      await refusal(
        mcp.call(
          'add_note',
          note([{ citation: '' }, { title: 'Escoffier, Le Guide Culinaire' }]),
        ),
      ),
    ).toMatch(/sources\[0\]/);

    // And the accepted shape is unchanged: one title, no url, still enough.
    await expect(
      mcp.call(
        'add_note',
        note([{ title: 'Asked at the counter, March 2026' }]),
      ),
    ).resolves.toBeTruthy();
  });

  test('the empty source is refused on the recipe paths too', async () => {
    const mcp = rw();

    // `create_recipe` rather than `add_note`, because the rule lives on the
    // source object and all five paths share it. The path in the message is
    // the assertion: it names the row, so a caller with ten sources on three
    // notes is told which one to fix.
    const message = await refusal(
      mcp.call('create_recipe', {
        title: 'A recipe with an empty citation',
        slug: 'mcp-contract-empty-source',
        kind: 'recipe',
        rationale: 'Proving the source rule reaches every note path.',
        ingredients: [{ name: 'Duck breast', quantity: 500, unit: 'g' }],
        steps: [{ instruction: 'Sear the duck breast skin-side down.' }],
        notes: [
          {
            kind: 'research',
            title: 'Where the technique comes from',
            body: 'Read somewhere, once.',
            sources: [{}],
          },
        ],
      }),
    );
    expect(message).toMatch(/notes\[0\]\.sources\[0\]/);

    // Nothing was written. The refusal happens before the transaction.
    await expect(
      mcp.call('get_recipe', { slug: 'mcp-contract-empty-source' }),
    ).rejects.toThrow(/No recipe/i);
  });

  /**
   * A refused write says what it refused, in words the caller can act on.
   *
   * `runTool` returns four error classes verbatim and reports everything
   * else as "An internal error occurred while processing your request." Both
   * refusals below were plain `Error`s, so a caller that named a parent tag
   * that does not exist — a typo, or a tag it meant to create first — was
   * told the server was broken. It cannot tell that from a bad argument, so
   * the sensible response is to retry, which fails the same way.
   *
   * The assertion is on the text and includes what the message must not say.
   * A message that merely matched /parent/ while still being the masked one
   * would pass a looser test.
   */
  test('a parent tag that does not exist is refused by name', async () => {
    const mcp = rw();

    const message = await refusal(
      mcp.call('upsert_category', {
        categoryType: 'technique',
        slug: CHILD_SLUG,
        label: 'Pot roasting',
        parentSlug: 'no-such-parent-tag',
      }),
    );
    expect(message).toContain('no-such-parent-tag');
    expect(message).toContain('technique');
    expect(message).not.toMatch(/internal error/i);
    // It also says the one thing a caller might have meant instead, since
    // `null` is how a parent is removed and a caller reaching for that is
    // the likeliest way to arrive here.
    expect(message).toMatch(/parentSlug: null/);

    // The write was refused, not half-applied: the tag itself is not there.
    const after = await mcp.call<CategoryRow[]>('list_categories', {
      categoryType: 'technique',
    });
    expect(after.map((row) => row.slug)).not.toContain(CHILD_SLUG);

    // The second masked message, on the same tool.
    const own = await refusal(
      mcp.call('upsert_category', {
        categoryType: 'technique',
        slug: CHILD_SLUG,
        label: 'Pot roasting',
        parentSlug: CHILD_SLUG,
      }),
    );
    expect(own).toMatch(/its own parent/);
    expect(own).not.toMatch(/internal error/i);
    // Agent-read text, so the repository's own vocabulary applies: the word
    // is Tag, never Term. This message was masked before this milestone, so
    // nothing had ever read it.
    expect(own).not.toMatch(/\bterm\b/i);
    // And it says what to send instead, the way its sibling above does.
    expect(own).toMatch(/parentSlug: null/);

    // The string "null" is a slug, not a clear, and is refused like any
    // other tag that is not there.
    expect(
      await refusal(
        mcp.call('upsert_category', {
          categoryType: 'technique',
          slug: CHILD_SLUG,
          label: 'Pot roasting',
          parentSlug: 'null',
        }),
      ),
    ).toMatch(/No tag "null"/);

    // A parent that exists is still accepted, and a null still clears one.
    await mcp.call('upsert_category', {
      categoryType: 'technique',
      slug: PARENT_SLUG,
      label: 'Braising',
      description: 'Brown it, then cook it slowly in a little liquid.',
    });
    await expect(
      mcp.call('upsert_category', {
        categoryType: 'technique',
        slug: CHILD_SLUG,
        label: 'Pot roasting',
        parentSlug: PARENT_SLUG,
      }),
    ).resolves.toBeTruthy();
    await expect(
      mcp.call('upsert_category', {
        categoryType: 'technique',
        slug: CHILD_SLUG,
        label: 'Pot roasting',
        parentSlug: null,
      }),
    ).resolves.toBeTruthy();

    // The other half of the same rule, on the tool that states it. A
    // label-only call keeps the description; an explicit null clears it.
    const DESCRIPTION = 'Brown it, then cook it slowly in a little liquid.';
    await mcp.call('upsert_category', {
      categoryType: 'technique',
      slug: PARENT_SLUG,
      label: 'Braising',
    });
    const braising = () =>
      mcp
        .call<{ slug: string; description: string | null }[]>(
          'list_categories',
          { categoryType: 'technique' },
        )
        .then((rows) => rows.find((row) => row.slug === PARENT_SLUG)!);
    expect((await braising()).description).toBe(DESCRIPTION);

    await mcp.call('upsert_category', {
      categoryType: 'technique',
      slug: PARENT_SLUG,
      label: 'Braising',
      description: null,
    });
    expect((await braising()).description).toBeNull();
  });

  /**
   * The same defect as the ingredient upsert, on the tool that records a
   * batch. Found by reading the rest of the file rather than by being
   * reported.
   *
   * `log_experiment` is an upsert on its slug, and re-logging one run is the
   * ordinary way a batch is written down: the cook logs the start, then adds
   * the finished weight days later. That second call carried a `values`
   * object built with `??` fallbacks, so it blanked the summary, the dates,
   * the scale, the outcome and the cost — and set `recipe_id` back to null,
   * which moved the run off its recipe's batch-log page and onto the top
   * level, where the site says "Not yet linked".
   *
   * `items` and `observations` keep the opposite rule on purpose: a re-log
   * replaces them rather than appending duplicates. Both rules are asserted
   * here, because the tool's description now states both and a test that
   * only checked one would let the other drift.
   */
  test('a re-logged run keeps the fields the second call leaves out', async () => {
    const mcp = rw();

    const SUMMARY =
      'A half batch, run to see whether the duck skin renders at a lower heat.';

    await mcp.call('log_experiment', {
      slug: RUN_SLUG,
      title: 'Contract re-log run',
      recipeSlug: SLUG,
      summary: SUMMARY,
      startedAt: '2026-01-15',
      completedAt: '2026-01-22',
      scaleFactor: 0.5,
      outcome: 'Good. The skin rendered without the meat going grey.',
      costTotal: 12.5,
      currency: 'ZAR',
      items: [{ label: 'A1' }],
      observations: [{ item: 'A1', metric: 'initial_weight', value: 1200 }],
    });

    // The second call: one number, days later. `title` is required by the
    // contract, so it goes again; nothing else does.
    await mcp.call('log_experiment', {
      slug: RUN_SLUG,
      title: 'Contract re-log run',
      items: [{ label: 'A1' }],
      observations: [{ item: 'A1', metric: 'final_weight', value: 640 }],
    });

    const run = await mcp.call<ExperimentResult>('get_experiment', {
      slug: RUN_SLUG,
    });
    expect(run.summary).toBe(SUMMARY);
    expect(run.startedAt).toBe('2026-01-15');
    expect(run.completedAt).toBe('2026-01-22');
    expect(run.scaleFactor).toBe(0.5);
    expect(run.outcome).toMatch(/rendered without the meat/);
    expect(run.costTotal).toBe(12.5);
    expect(run.currency).toBe('ZAR');
    // The one that moved a page rather than a field.
    expect(run.recipe?.slug).toBe(SLUG);

    // And the deliberate replace is still a replace. One observation went in
    // and one is stored, not two.
    expect(run.observations.map((o) => o.metric)).toEqual(['final_weight']);
  });

  /**
   * The measurements are the reason a batch log exists, and a call that
   * mentions neither list must not touch them.
   *
   * The delete was unconditional, so `log_experiment {slug, title}` — a
   * caller correcting a typo in the title — emptied every item and every
   * observation of the run and reported success. Nothing on the page said
   * so, an experiment has no revision history to recover from, and the
   * biltong batch logs are the repository's primary measurement data.
   *
   * The counts in the result are asserted with it. A call that keeps 1 item
   * and 1 observation must not report 0 of each, or the caller reads the
   * result as the loss it was.
   */
  test('a re-logged run keeps the measurements it does not mention', async () => {
    const mcp = rw();

    const quiet = await mcp.call<{
      itemCount: number;
      observationCount: number;
    }>('log_experiment', {
      slug: RUN_SLUG,
      title: 'Contract re-log run, title corrected',
    });
    expect(quiet.itemCount).toBe(1);
    expect(quiet.observationCount).toBe(1);

    const run = await mcp.call<ExperimentResult>('get_experiment', {
      slug: RUN_SLUG,
    });
    expect(run.items.map((i) => i.label)).toEqual(['A1']);
    expect(run.observations.map((o) => o.metric)).toEqual(['final_weight']);
    expect(run.recipe?.slug).toBe(SLUG);
  });

  /**
   * An experiment is a recorded run of one revision, so the revision it
   * recorded is a stored value like any other and carries forward.
   *
   * `revisionId` was re-resolved to the recipe's *current* revision on every
   * call that named a recipe, so a re-log adding one observation moved the
   * run onto a version nobody cooked — and `/batch-logs` prints that number.
   * The number is also the one field `get_experiment` does not return, so
   * the move was invisible from the connector.
   */
  test('a re-logged run keeps the revision it recorded', async () => {
    const mcp = rw();

    const pinned = 'mcp-contract-pin-run';
    const before = await mcp.call<{ revisionNumber: number }>('get_recipe', {
      slug: SLUG,
    });

    await mcp.call('log_experiment', {
      slug: pinned,
      title: 'Contract pinned run',
      recipeSlug: SLUG,
      revisionNumber: before.revisionNumber,
      items: [{ label: 'A1' }],
      observations: [{ item: 'A1', metric: 'initial_weight', value: 900 }],
    });

    await mcp.call('revise_recipe', {
      slug: SLUG,
      rationale: 'A newer version, cooked after the run above.',
    });
    const after = await mcp.call<{ revisionNumber: number }>('get_recipe', {
      slug: SLUG,
    });
    expect(after.revisionNumber).toBe(before.revisionNumber + 1);

    // The second call names the recipe again and no revision. The run keeps
    // the version it recorded.
    await mcp.call('log_experiment', {
      slug: pinned,
      title: 'Contract pinned run',
      recipeSlug: SLUG,
      observations: [{ item: 'A1', metric: 'final_weight', value: 500 }],
    });

    const runs = await mcp.call<
      { slug: string; revisionNumber: number | null }[]
    >('list_experiments', {});
    const stored = runs.find((r) => r.slug === pinned)!;
    expect(stored.revisionNumber).toBe(before.revisionNumber);

    // A revision number on its own named nothing and was dropped without a
    // word. It is refused now, the way `add_note` refuses the same shape.
    expect(
      await refusal(
        mcp.call('log_experiment', {
          slug: pinned,
          title: 'Contract pinned run',
          revisionNumber: after.revisionNumber,
        }),
      ),
    ).toMatch(/recipeSlug/);

    // And an explicit null unlinks. Omission carries the link forward, so
    // without this "belongs to no recipe" is unreachable — a run attached to
    // the wrong recipe could be moved and never detached.
    await mcp.call('log_experiment', {
      slug: pinned,
      title: 'Contract pinned run',
      recipeSlug: null,
    });
    const unlinked = await mcp.call<ExperimentResult>('get_experiment', {
      slug: pinned,
    });
    expect(unlinked.recipe).toBeNull();
    // Unlinking is not a delete. The measurements are still there.
    expect(unlinked.observations.map((o) => o.metric)).toEqual([
      'final_weight',
    ]);

    // Put it back. `/batch-logs` counts the runs that belong to no recipe,
    // and `e2e/render.spec.ts` asserts that figure — an unlinked run left
    // behind here would move a number in another file.
    await mcp.call('log_experiment', {
      slug: pinned,
      title: 'Contract pinned run',
      recipeSlug: SLUG,
      revisionNumber: before.revisionNumber,
    });
    const relinked = await mcp.call<ExperimentResult>('get_experiment', {
      slug: pinned,
    });
    expect(relinked.recipe?.slug).toBe(SLUG);
  });

  test('the registry is exactly the set the connector documents', async () => {
    const mcp = rw();
    expect((await mcp.listTools()).sort()).toEqual(TOOLS);
  });

  /**
   * A rule JSON Schema cannot express has to be in the text beside the
   * field, or the advertised signature and the enforced contract have
   * drifted — which is the reason `schemas.ts` splits shape from schema at
   * all.
   *
   * Two rules landed in this milestone with nothing on the wire. `sources`
   * advertised four optional properties and no `required`, so `{}` read as
   * legal and was refused. `uses` advertised an array of strings and said
   * nothing about the name having to fit exactly one line — and
   * `create_recipe`'s own description still stated the older, weaker rule.
   * A caller only met either one after a failed write.
   */
  test('the two rules a caller cannot see in the schema are in the text', async () => {
    const mcp = rw();
    const tools = await mcp.listToolSchemas();
    const find = (name: string) => tools.find((t) => t.name === name)!;

    const properties = (name: string) =>
      (find(name).inputSchema?.properties ?? {}) as Record<
        string,
        {
          description?: string;
          items?: { properties?: Record<string, unknown> };
        }
      >;

    // Each source must name something. The refusal exists; this is the
    // sentence that stops a caller meeting it.
    const sources = properties('add_note').sources!;
    expect(sources.description).toMatch(/url/);
    expect(sources.description).toMatch(/title/);
    expect(sources.description).toMatch(/citation/);
    // And the advertised shape still carries all four properties, so the
    // refinement did not narrow what a caller may send.
    expect(Object.keys(sources.items?.properties ?? {}).sort()).toEqual([
      'accessedAt',
      'citation',
      'title',
      'url',
    ]);

    // A `uses` name must fit exactly one line. It is stated on the field,
    // for all three tools that take steps, and in create_recipe's own text.
    for (const tool of [
      'create_recipe',
      'revise_recipe',
      'backfill_revision',
    ]) {
      const steps = properties(tool).steps as unknown as {
        items?: { properties?: Record<string, { description?: string }> };
      };
      expect(steps.items?.properties?.uses?.description).toMatch(
        /exactly one line/,
      );
      // And the way out of "two lines share a name", which is the one thing
      // a caller cannot work out from the shape. The field says the whole
      // rule — write the `component`, a colon, then the name — and the
      // tool's own text repeats it, because a model reads the tool before
      // it reads a field.
      expect(steps.items?.properties?.uses?.description).toMatch(/`component`/);
      expect(steps.items?.properties?.uses?.description).toMatch(
        /"To serve: Glutinous rice"/,
      );
      expect(find(tool).description).toMatch(/"To serve: Glutinous rice"/);
      // And the field that remedy stands on. A caller that never sets a
      // `component` cannot write a qualified name at all, so the field the
      // whole route depends on cannot be the one with no sentence.
      const lines = properties(tool).ingredients as unknown as {
        items?: { properties?: Record<string, { description?: string }> };
      };
      expect(lines.items?.properties?.component?.description).toMatch(
        /heading this line sits under/,
      );
    }
    expect(find('create_recipe').description).toMatch(/exactly one line/);
    expect(find('create_recipe').description).not.toMatch(
      /only ones present in/,
    );
  });

  /*
   * The third such rule, and the most important one in the tool that has it.
   *
   * `report_issue` requires `toolName`, `payload` and `response` only when
   * `kind` is "bug". JSON Schema cannot express a conditional requirement,
   * so the enforced contract lives in a `superRefine` and the advertised
   * one has to carry the same rule in prose. If it does not, a caller meets
   * a refusal it had no way to predict — which is the exact drift the
   * shape/schema split in `src/lib/domain/schemas.ts` exists to prevent.
   */
  test('the bug-report rule a caller cannot see in the schema is in the text', async () => {
    const mcp = rw();
    const tools = await mcp.listToolSchemas();
    const report = tools.find((t) => t.name === 'report_issue')!;
    const schema = report.inputSchema ?? {};

    // Three fields are always required. A three-field tool gets called; a
    // six-field one gets skipped by the agent that most needs it.
    expect(((schema.required as string[]) ?? []).sort()).toEqual([
      'body',
      'kind',
      'title',
    ]);

    const properties = (schema.properties ?? {}) as Record<
      string,
      { description?: string }
    >;
    for (const field of ['toolName', 'payload', 'response']) {
      expect(Object.keys(properties)).toContain(field);
    }

    // …and the conditional demand is stated where a caller reads it.
    expect(properties.kind?.description).toMatch(/kind "bug"/);
    expect(properties.kind?.description).toMatch(/toolName/);
    expect(properties.kind?.description).toMatch(/payload/);
    expect(properties.kind?.description).toMatch(/response/);
    expect(report.description).toMatch(/payload/);
    expect(report.description).toMatch(/response/);

    // The repository is not a parameter, and the text says so rather than
    // leaving an agent to look for the field it cannot find.
    expect(Object.keys(properties).sort()).toEqual([
      'body',
      'kind',
      'payload',
      'response',
      'title',
      'toolName',
    ]);
    expect(report.description).toMatch(/one repository/);
  });

  /*
   * D-02 and D-12 — the two fields M5.5 added.
   *
   * Both are optional at every layer, which is correct and is also what
   * makes them dangerous to leave untested: R-SCR-39 makes the figure a MAY
   * and an empty conditions list is the ordinary case for seven of the
   * eight note kinds, so a write path that silently stopped carrying either
   * one would draw a page that looks entirely finished. Deleting
   * `conditions: note.conditions ?? []` from `writeNotes`, or the
   * `if (input.massFlow)` from `createRecipe`, left the whole suite green.
   */
  test('a mass flow figure and note conditions survive the round trip', async () => {
    const mcp = rw();

    await mcp.call<WriteResult>('create_recipe', {
      title: 'Cured lardo',
      slug: FLOW_SLUG,
      kind: 'recipe',
      rationale: 'First working version, written through the connector.',
      ingredients: [
        { name: 'Pork back fat', quantity: 3, unit: 'kg' },
        { name: 'Sea salt', quantity: 400, unit: 'g' },
      ],
      steps: [{ instruction: 'Bury the fat in the salt and hold it cold.' }],
      notes: [
        {
          kind: 'science',
          title: 'Salt drives the water out',
          body: 'Salt lowers the water activity until spoilage organisms cannot grow.',
          conditions: ['4 °C', '90 days', 'fully buried'],
        },
      ],
      massFlow: {
        stages: [
          { label: 'Raw', quantity: 3, unit: 'kg' },
          { label: 'Cure', durationMinutes: 129600 },
          { label: 'Cured', quantity: 2.4, unit: 'kg', emphasis: true },
        ],
        netChangePercent: -20,
        ratePercentPerDay: 0.22,
      },
    });

    const recipe = await mcp.call<FlowRecipeResult>('get_recipe', {
      slug: FLOW_SLUG,
    });

    const flow = recipe.revision.massFlow;
    expect(flow?.map((stage) => stage.label)).toEqual(['Raw', 'Cure', 'Cured']);
    // The stage keeps its own unit and the wait is drawn from minutes, so
    // this asserts the read layer's formatting as well as the write.
    expect(flow?.map((stage) => stage.value)).toEqual([
      '3 kg',
      '90 d',
      '2.4 kg',
    ]);
    expect(flow?.map((stage) => stage.emphasis)).toEqual([false, false, true]);
    expect(recipe.revision.massFlowSummary).toEqual([
      'Net weight loss −20%',
      'Rate 0.22% per day',
    ]);

    const mechanism = recipe.notes.find((note) => note.kind === 'science');
    expect(mechanism?.conditions).toEqual(['4 °C', '90 days', 'fully buried']);
  });

  test('a version takes one mass flow figure and then refuses another', async () => {
    const mcp = rw();

    // The figure does not carry forward — it records one batch — so the new
    // revision starts with none and `add_mass_flow` is the way to give it
    // one. That is the pair of facts `revise_recipe`'s description states.
    const revised = await mcp.call<WriteResult>('revise_recipe', {
      slug: FLOW_SLUG,
      rationale: 'Ninety days left the middle soft. A hundred and twenty.',
    });

    const bare = await mcp.call<FlowRecipeResult>('get_recipe', {
      slug: FLOW_SLUG,
    });
    expect(bare.revision.revisionNumber).toBe(revised.revisionNumber);
    expect(bare.revision.massFlow).toBeNull();

    const stages = [
      { label: 'Raw', quantity: 3, unit: 'kg' },
      { label: 'Cured', quantity: 2.1, unit: 'kg', emphasis: true },
    ];
    await mcp.call('add_mass_flow', {
      slug: FLOW_SLUG,
      revisionNumber: revised.revisionNumber,
      stages,
    });

    const filled = await mcp.call<FlowRecipeResult>('get_recipe', {
      slug: FLOW_SLUG,
    });
    expect(filled.revision.massFlow?.map((stage) => stage.value)).toEqual([
      '3 kg',
      '2.1 kg',
    ]);

    // The refusal is the half that makes the addition legal: a figure that
    // can be rewritten is a measurement that can be quietly replaced.
    await expect(
      mcp.call('add_mass_flow', {
        slug: FLOW_SLUG,
        revisionNumber: revised.revisionNumber,
        stages,
      }),
    ).rejects.toThrow(/already has a mass flow figure/);
  });

  test('a stored note states its conditions once', async () => {
    const mcp = rw();

    // A science note written with no conditions — the state every note in
    // the archive was in before D-02, and the reason describe_mechanism
    // exists at all.
    await mcp.call('add_note', {
      recipeSlug: FLOW_SLUG,
      kind: 'science',
      title: 'Fat softens below body heat',
      body: 'Back fat is mostly oleic acid, so a thin slice melts in the mouth.',
    });

    const before = await mcp.call<FlowRecipeResult>('get_recipe', {
      slug: FLOW_SLUG,
    });
    const note = before.notes.find(
      (candidate) => candidate.title === 'Fat softens below body heat',
    );
    expect(note?.conditions).toEqual([]);

    await mcp.call('describe_mechanism', {
      noteId: note!.id,
      conditions: ['33 °C', 'sliced to 1 mm'],
    });

    const after = await mcp.call<FlowRecipeResult>('get_recipe', {
      slug: FLOW_SLUG,
    });
    expect(
      after.notes.find((candidate) => candidate.id === note!.id)?.conditions,
    ).toEqual(['33 °C', 'sliced to 1 mm']);

    await expect(
      mcp.call('describe_mechanism', {
        noteId: note!.id,
        conditions: ['20 °C'],
      }),
    ).rejects.toThrow(/already states its conditions/);
  });

  test('a scope denial is an error result, not an auth challenge', async () => {
    // This is what the "No approval received" report needed ruling out. A
    // denial that looked like a 401 would make a client re-run the OAuth
    // dance; this one is a plain tool error on a 200, and reads keep
    // working on the same token immediately afterwards.
    const ro = mcpClient(test.info().project.use.baseURL!, tokens().readOnly);

    await expect(mcp_denied(ro)).rejects.toThrow(/read-only access/);

    await expect(ro.call('get_recipe', { slug: SLUG })).resolves.toBeTruthy();
  });
});

function mcp_denied(client: ReturnType<typeof mcpClient>) {
  return client.call('upsert_category', {
    categoryType: 'technique',
    slug: 'denied-probe',
    label: 'Denied probe',
  });
}
