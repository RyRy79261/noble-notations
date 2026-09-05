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
const SUM_SLUG = 'mcp-contract-nam-jim';

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
        {
          instruction: 'Dry-toast the rice until it smells of popcorn.',
          uses: ['Glutinous rice'],
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
