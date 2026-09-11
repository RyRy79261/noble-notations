import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * `buildShoppingList` and the unit vocabulary underneath it.
 *
 * A shopping list is the one screen in this repository that shows a reader a
 * number nobody wrote down. Every other figure is quoted from a revision; a
 * list amount is computed, and a wrong one sends a person to a shop for the
 * wrong quantity of something. `src/lib/domain/units.ts` has no unit test
 * framework to sit in — every one of `quantityBucket`, `formatAggregate`,
 * `pluraliseUnit` and `toGrams` is reachable only through a tool call — so
 * this file drives the rules through the real connector.
 *
 * The five rules under test, each stated as a property rather than as one
 * drawing of it:
 *
 * 1. Two amounts add up only when one unit converts into the other.
 * 2. A unit that was the only one written comes back as it was written.
 * 3. Count units never merge, because every one of them carries `toBase: 1`
 *    and a sum of them would look arithmetically fine and mean nothing.
 * 4. A line with no quantity is flagged, never guessed at (R-SCR-20).
 * 5. The list reads each recipe's CURRENT revision.
 *
 * `e2e/mcp-contract.spec.ts` already covers the duplicate-line sum, one
 * same-unit sum and one count pair. Those are the three cases a caller meets
 * first; what is here is the rest of the rule — the conversion thresholds,
 * the spoon rule, mass against volume, the unquantified flag, the optional
 * flag, provenance across two recipes, and the current-revision read.
 */

const UNITS_SLUG = 'data-shop-unit-table';
const VAGUE_SLUG = 'data-shop-to-taste';
const MOVED_SLUG = 'data-shop-superseded';
const SHARED_A_SLUG = 'data-shop-shared-one';
const SHARED_B_SLUG = 'data-shop-shared-two';
const OPTIONAL_SLUG = 'data-shop-optional-only';

interface ShoppingEntry {
  slug: string | null;
  name: string;
  category: string;
  amounts: string[];
  unquantified: boolean;
  optional: boolean;
  from: { slug: string; title: string; text: string }[];
}

interface ShoppingResult {
  recipes: { slug: string; title: string }[];
  missing: string[];
  groups: { category: string; entries: ShoppingEntry[] }[];
  totalEntries: number;
}

function rw() {
  return mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
}

/** Every entry of a list, flattened out of its shop-order groups. */
function entries(list: ShoppingResult): ShoppingEntry[] {
  return list.groups.flatMap((group) => group.entries);
}

function entry(list: ShoppingResult, name: string): ShoppingEntry {
  const found = entries(list).find((row) => row.name === name);
  if (!found) {
    throw new Error(
      `No shopping row named "${name}". The list holds: ` +
        entries(list)
          .map((row) => row.name)
          .join(', '),
    );
  }
  return found;
}

test.describe.configure({ mode: 'serial' });

test.describe('the shopping list', () => {
  test('writes one recipe holding every aggregation rule', async () => {
    const mcp = rw();

    // One line per rule, each on its own ingredient so each gets its own
    // row. The names are deliberately unlike anything in the archive: an
    // ingredient resolves by slug, then by name, then by alias, and a
    // collision here would merge a test line into a seeded one.
    await mcp.call('create_recipe', {
      title: 'Unit table subject',
      slug: UNITS_SLUG,
      kind: 'preparation',
      rationale: 'Holds one ingredient for each way an amount is totalled.',
      ingredients: [
        // One unit written, and a plural the alias list declares rather
        // than derives. "2 lb" must come back "2 lbs", not "2 lb".
        { name: 'Table pork belly', quantity: 2, unit: 'lb' },

        // Same unit twice: no conversion is needed and none must happen.
        { name: 'Table sea salt', quantity: 250, unit: 'g', component: 'A' },
        { name: 'Table sea salt', quantity: 250, unit: 'g', component: 'B' },

        // Two mass units: these genuinely have to convert, and the total
        // crosses the kilogram threshold.
        { name: 'Table brown sugar', quantity: 300, unit: 'g', component: 'A' },
        {
          name: 'Table brown sugar',
          quantity: 0.9,
          unit: 'kg',
          component: 'B',
        },

        // Two volume units, crossing the litre threshold.
        { name: 'Table rice wine', quantity: 600, unit: 'ml', component: 'A' },
        { name: 'Table rice wine', quantity: 0.5, unit: 'l', component: 'B' },

        // Spoons stay spoons. Millilitres are not how anybody measures a
        // tablespoon, and the base unit of volume is the millilitre.
        { name: 'Table sesame oil', quantity: 1, unit: 'tbsp', component: 'A' },
        { name: 'Table sesame oil', quantity: 3, unit: 'tsp', component: 'B' },

        // Mass and volume are two kinds. Without a density nothing can turn
        // one into the other, and guessing water is how a list lies.
        { name: 'Table tamarind', quantity: 100, unit: 'g', component: 'A' },
        { name: 'Table tamarind', quantity: 100, unit: 'ml', component: 'B' },

        // Two count units. Both carry `toBase: 1`, so a shared bucket would
        // add them and produce a number that means nothing.
        { name: 'Table thyme', quantity: 2, unit: 'bunch', component: 'A' },
        { name: 'Table thyme', quantity: 3, unit: 'sprig', component: 'B' },

        // A count unit whose plural is irregular, and one written as one.
        { name: 'Table kaffir lime', quantity: 3, unit: 'leaf' },
        { name: 'Table black garlic', quantity: 1, unit: 'clove' },
      ],
      steps: [{ instruction: 'Nothing is cooked. This holds the amounts.' }],
    });

    // Every line survived as its own line. A list that silently merged two
    // lines of one ingredient before the amounts were ever totalled would
    // make every assertion below pass for the wrong reason.
    const written = await mcp.call<{
      ingredients: { rawText: string }[];
    }>('get_recipe', { slug: UNITS_SLUG });
    expect(written.ingredients).toHaveLength(15);
  });

  test('an amount comes back in the unit it was written in', async () => {
    const list = await rw().call<ShoppingResult>('build_shopping_list', {
      slugs: [UNITS_SLUG],
    });

    // The declared plural, read off the vocabulary rather than derived. No
    // suffix rule gets "leaves" from "leaf", and deriving one picked "gram"
    // as the plural of "g".
    expect(entry(list, 'Table pork belly').amounts).toEqual(['2 lbs']);
    // And it is not rescaled on the way out. Two pounds is 907.2 g, which
    // is what a shopping list said before the written unit travelled with
    // the number — an amount nobody had asked for and nobody could weigh.
    expect(entry(list, 'Table pork belly').amounts.join()).not.toMatch(/g|kg/);

    expect(entry(list, 'Table kaffir lime').amounts).toEqual(['3 leaves']);
    // One of a thing is singular.
    expect(entry(list, 'Table black garlic').amounts).toEqual(['1 clove']);

    // Two lines, one unit. The sum is arithmetic, not conversion: 500 g is
    // half a kilogram and must not be reported as one.
    expect(entry(list, 'Table sea salt').amounts).toEqual(['500 g']);
  });

  test('two units of one kind convert; two kinds never do', async () => {
    const list = await rw().call<ShoppingResult>('build_shopping_list', {
      slugs: [UNITS_SLUG],
    });

    // R-SCR-19, the half that adds: 300 g and 0.9 kg are the same kind of
    // thing measured two ways, so they become one amount in the unit a
    // person would shop in.
    expect(entry(list, 'Table brown sugar').amounts).toEqual(['1.2 kg']);
    expect(entry(list, 'Table rice wine').amounts).toEqual(['1.1 l']);

    // A tablespoon is three teaspoons. The total is two tablespoons, and
    // the millilitre it was summed in never reaches the reader.
    expect(entry(list, 'Table sesame oil').amounts).toEqual(['2 tbsp']);

    // The half that refuses. 100 g of tamarind and 100 ml of tamarind water
    // are not 200 of anything without a density, and this ingredient has
    // none.
    const tamarind = entry(list, 'Table tamarind');
    expect(new Set(tamarind.amounts)).toEqual(new Set(['100 g', '100 ml']));
    expect(tamarind.amounts.join(' + ')).not.toMatch(/\b200\b/);
  });

  test('count units stay apart, however tidy the sum would look', async () => {
    const list = await rw().call<ShoppingResult>('build_shopping_list', {
      slugs: [UNITS_SLUG],
    });

    const thyme = entry(list, 'Table thyme');
    expect(new Set(thyme.amounts)).toEqual(new Set(['2 bunches', '3 sprigs']));
    // Two bunches and three sprigs are not five of anything. Both units
    // carry `toBase: 1`, so a shared bucket would have said "5".
    expect(thyme.amounts.join(' + ')).not.toMatch(/\b5\b/);
  });

  test('a line with no quantity is flagged, not guessed at', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'To taste subject',
      slug: VAGUE_SLUG,
      kind: 'preparation',
      rationale: 'Two lines with no amount, and one that carries both.',
      ingredients: [
        // No quantity at all. There is no honest number for this.
        {
          name: 'Vague white pepper',
          unit: null,
          rawText: 'White pepper, to taste',
        },
        // One line says how much, the other does not. The row has to carry
        // the amount AND say that the amount is not the whole story —
        // R-SCR-20's "some" on the checklist reads off this flag.
        { name: 'Vague fish sauce', quantity: 200, unit: 'ml', component: 'A' },
        {
          name: 'Vague fish sauce',
          component: 'B',
          rawText: 'Fish sauce, to season',
        },
        // A control. Nothing about this line is vague, so nothing about
        // its row may be.
        { name: 'Vague palm vinegar', quantity: 50, unit: 'ml' },
      ],
      steps: [{ instruction: 'Season at the end.' }],
    });

    const list = await mcp.call<ShoppingResult>('build_shopping_list', {
      slugs: [VAGUE_SLUG],
    });

    const pepper = entry(list, 'Vague white pepper');
    expect(pepper.unquantified).toBe(true);
    // Nothing was invented to fill the gap.
    expect(pepper.amounts).toEqual([]);

    const sauce = entry(list, 'Vague fish sauce');
    expect(sauce.unquantified).toBe(true);
    expect(sauce.amounts).toEqual(['200 ml']);

    expect(entry(list, 'Vague palm vinegar').unquantified).toBe(false);
  });

  test('a row is optional only when every line that made it is optional', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Optional subject',
      slug: OPTIONAL_SLUG,
      kind: 'preparation',
      rationale: 'One ingredient asked for twice, optional only once.',
      ingredients: [
        // Optional on both lines: the whole row is a maybe.
        { name: 'Optional shiso', quantity: 4, unit: 'leaf', optional: true },
        // Optional on one line and not the other. Somebody has to buy it.
        {
          name: 'Optional makrut',
          quantity: 2,
          unit: 'leaf',
          optional: true,
          component: 'A',
        },
        { name: 'Optional makrut', quantity: 2, unit: 'leaf', component: 'B' },
      ],
      steps: [{ instruction: 'Add the herbs at the end.' }],
    });

    const list = await mcp.call<ShoppingResult>('build_shopping_list', {
      slugs: [OPTIONAL_SLUG],
    });

    expect(entry(list, 'Optional shiso').optional).toBe(true);
    expect(entry(list, 'Optional makrut').optional).toBe(false);
  });

  test('one ingredient across two recipes is one row that names both', async () => {
    const mcp = rw();

    // Two recipes, one ingredient, two units — so the sum has to cross a
    // recipe boundary AND a unit at the same time.
    for (const [slug, title, quantity, unit] of [
      [SHARED_A_SLUG, 'Shared subject one', 400, 'g'],
      [SHARED_B_SLUG, 'Shared subject two', 0.6, 'kg'],
    ] as const) {
      await mcp.call('create_recipe', {
        title,
        slug,
        kind: 'preparation',
        rationale: 'Both dishes want the same cut, on the same shopping trip.',
        ingredients: [{ name: 'Shared beef cheek', quantity, unit }],
        steps: [{ instruction: 'Braise the cheek.' }],
      });
    }

    const list = await mcp.call<ShoppingResult>('build_shopping_list', {
      slugs: [SHARED_A_SLUG, SHARED_B_SLUG],
    });

    const cheek = entry(list, 'Shared beef cheek');
    // One kilogram of one thing, bought once.
    expect(cheek.amounts).toEqual(['1 kg']);

    // And the row says who asked for it, in the words each recipe used.
    // Without this a reader who drops a recipe from the basket cannot tell
    // what to leave in the shop.
    expect(new Set(cheek.from.map((source) => source.slug))).toEqual(
      new Set([SHARED_A_SLUG, SHARED_B_SLUG]),
    );
    expect(cheek.from.map((source) => source.text).join(' | ')).toMatch(
      /400 g.*0\.6 kg|0\.6 kg.*400 g/,
    );
  });

  test('a slug that is not there is named, and the rest of the list still builds', async () => {
    const list = await rw().call<ShoppingResult>('build_shopping_list', {
      slugs: [SHARED_A_SLUG, 'data-shop-no-such-recipe'],
    });

    // Reported rather than dropped: a silently shorter list is a shopping
    // trip that comes home missing something.
    expect(list.missing).toEqual(['data-shop-no-such-recipe']);
    expect(list.recipes.map((r) => r.slug)).toEqual([SHARED_A_SLUG]);
    expect(entry(list, 'Shared beef cheek').amounts).toEqual(['400 g']);
  });

  test('the list reads the current revision, not the one it replaced', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Superseded subject',
      slug: MOVED_SLUG,
      kind: 'recipe',
      rationale: 'The first attempt, with too much of everything.',
      ingredients: [
        { name: 'Superseded lamb neck', quantity: 2, unit: 'kg' },
        { name: 'Superseded juniper', quantity: 20, unit: 'g' },
      ],
      steps: [{ instruction: 'Roast the neck.' }],
    });

    await mcp.call('revise_recipe', {
      slug: MOVED_SLUG,
      rationale: 'Half the lamb, and the juniper was overpowering. Dropped.',
      ingredients: [
        { name: 'Superseded lamb neck', quantity: 1, unit: 'kg' },
        { name: 'Superseded bay', quantity: 2, unit: 'leaf' },
      ],
    });

    const list = await mcp.call<ShoppingResult>('build_shopping_list', {
      slugs: [MOVED_SLUG],
    });

    // Shopping for a superseded version means cooking last month's mistake:
    // the amount is the new one, the dropped ingredient is gone, and the
    // added one is there.
    expect(entry(list, 'Superseded lamb neck').amounts).toEqual(['1 kg']);
    expect(entry(list, 'Superseded bay').amounts).toEqual(['2 leaves']);
    expect(entries(list).map((row) => row.name)).not.toContain(
      'Superseded juniper',
    );
  });
});
