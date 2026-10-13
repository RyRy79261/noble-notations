import { test, expect } from '@playwright/test';

import { mcpClient, tokens, type McpClient } from './helpers';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * THE CORE PATTERN: the plain idea under a dish, on its own tab.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * What is asserted is the contract an agent filling every recipe in a
 * sweep depends on:
 *
 * - **Add-once.** A second `add_core_pattern` is refused and names
 *   `update_recipe`, so a sweep run twice cannot overwrite a pattern that a
 *   person corrected in between.
 * - **The family tag is ADDED.** Every other tag the recipe had survives —
 *   the whole reason the tool takes one name and not `categories`.
 * - **`update_recipe { corePattern }` has three states.** Absent leaves it,
 *   an object replaces it whole, null removes it.
 * - **A variation reads its parent's**, and says so, until it has its own.
 * - **A research record has none.**
 * - **The page draws it** as a Core tab, and a safety swap as a warning.
 */

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`;

function rw(): McpClient {
  return mcpClient(BASE, tokens().readWrite);
}

let counter = 0;
function stamp(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

interface CorePatternResult {
  formula: string;
  roles: {
    role: string;
    uses: string;
    purpose: string;
    essential: boolean;
    swaps: { use: string; tradeoff: string; safety: boolean }[];
  }[];
  method: string[];
  fullRecipeAdds: string | null;
  inheritedFrom: { slug: string; title: string } | null;
}

interface RecipeResult {
  slug: string;
  terms: { categoryType: string; slug: string; label: string }[];
  corePattern: CorePatternResult | null;
}

const PATTERN = {
  formula: 'nut-paste sauce + noodles + crisp fried mince',
  roles: [
    {
      role: 'sauce',
      uses: 'Sesame paste and chilli oil',
      purpose: 'It coats the noodles and carries the flavour.',
      swaps: [
        {
          use: 'Peanut butter',
          tradeoff: 'Sweeter and thicker. Thin it with hot water.',
        },
      ],
    },
    {
      role: 'starch',
      uses: 'Fresh udon',
      purpose: 'It holds the sauce.',
      swaps: [],
    },
    {
      role: 'protein',
      uses: 'Pork mince, fried crisp',
      purpose: 'It gives salt and crunch.',
      essential: false,
      swaps: [
        {
          use: 'Raw minced beef, not fried',
          tradeoff:
            'Only with beef cut and minced on the day, kept below 4 °C.',
          safety: true,
        },
      ],
    },
  ],
  method: [
    'Mix the sauce in the bowl.',
    'Fry the mince until crisp.',
    'Boil the noodles and toss them in the sauce.',
  ],
  fullRecipeAdds: 'Measured ratios and a toasted spice oil.',
};

async function dish(
  mcp: McpClient,
  slug: string,
  kind: 'recipe' | 'research' = 'recipe',
): Promise<string> {
  await mcp.call('create_recipe', {
    title: `CORE ${slug}`,
    slug,
    kind,
    rationale: 'Written by e2e/mcp-core-pattern.spec.ts.',
    categories: { cuisine: ['Sichuan'], technique: ['Stir-frying'] },
    ingredients: [{ name: `CORE pork ${slug}`, quantity: 200, unit: 'g' }],
    steps: [{ instruction: 'Fry the pork for 4 min.' }],
  });
  return slug;
}

async function refusal(run: Promise<unknown>, what: string): Promise<string> {
  try {
    await run;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`${what} was accepted and should have been refused`);
}

test('add_core_pattern stores the pattern once and adds only its family tag', async () => {
  const mcp = rw();
  const slug = await dish(mcp, `core-${stamp()}`);

  const added = await mcp.call<{ family: string; message: string }>(
    'add_core_pattern',
    { slug, family: 'Dressed noodles', ...PATTERN },
  );
  expect(added.family).toBe('dressed-noodles');
  expect(added.message).toContain('update_recipe');

  const recipe = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(recipe.corePattern?.formula).toBe(PATTERN.formula);
  expect(recipe.corePattern?.roles.map((r) => r.role)).toEqual([
    'sauce',
    'starch',
    'protein',
  ]);
  expect(recipe.corePattern?.roles[2]?.essential).toBe(false);
  expect(recipe.corePattern?.roles[2]?.swaps[0]?.safety).toBe(true);
  expect(recipe.corePattern?.roles[0]?.swaps[0]?.safety).toBe(false);
  expect(recipe.corePattern?.method).toHaveLength(3);
  expect(recipe.corePattern?.inheritedFrom).toBeNull();

  // The family tag was ADDED and nothing else was touched.
  const tags = recipe.terms.map((t) => `${t.categoryType}/${t.slug}`).sort();
  expect(tags).toEqual(
    [
      'cuisine/sichuan',
      'pattern/dressed-noodles',
      'technique/stir-frying',
    ].sort(),
  );

  // Add-once, and the refusal names the correction.
  const second = await refusal(
    mcp.call('add_core_pattern', { slug, family: 'Other', ...PATTERN }),
    'a second add_core_pattern',
  );
  expect(second).toContain('already has a core pattern');
  expect(second).toContain('update_recipe');
});

test('update_recipe replaces the pattern whole, leaves it when absent, and removes it on null', async () => {
  const mcp = rw();
  const slug = await dish(mcp, `core-${stamp()}`);
  await mcp.call('add_core_pattern', {
    slug,
    family: 'Dressed noodles',
    ...PATTERN,
  });

  // Absent: a title correction leaves the pattern alone.
  await mcp.call('update_recipe', { slug, title: `CORE ${slug} corrected` });
  let recipe = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(recipe.corePattern?.roles).toHaveLength(3);

  // An object: replaced whole, so the role left out is gone.
  await mcp.call('update_recipe', {
    slug,
    corePattern: {
      formula: 'sauce + noodles',
      roles: PATTERN.roles.slice(0, 2),
      method: PATTERN.method.slice(0, 2),
    },
  });
  recipe = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(recipe.corePattern?.formula).toBe('sauce + noodles');
  expect(recipe.corePattern?.roles.map((r) => r.role)).toEqual([
    'sauce',
    'starch',
  ]);
  expect(recipe.corePattern?.fullRecipeAdds).toBeNull();

  // Null: removed, and add_core_pattern may add one again.
  await mcp.call('update_recipe', { slug, corePattern: null });
  recipe = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(recipe.corePattern).toBeNull();
  await mcp.call('add_core_pattern', {
    slug,
    family: 'Dressed noodles',
    ...PATTERN,
  });
});

test('a variation shows the pattern of the dish it varies until it has its own', async () => {
  const mcp = rw();
  const base = await dish(mcp, `core-${stamp()}`);
  await mcp.call('add_core_pattern', {
    slug: base,
    family: 'Dressed noodles',
    ...PATTERN,
  });

  const child = `core-${stamp()}`;
  await mcp.call('create_variant', {
    title: `CORE ${child}`,
    slug: child,
    variantOf: base,
    variantNote: 'With shiitake instead of pork',
    ingredients: [{ name: `CORE shiitake ${child}`, quantity: 200, unit: 'g' }],
    steps: [{ instruction: 'Fry the shiitake for 6 min.' }],
  });

  let recipe = await mcp.call<RecipeResult>('get_recipe', { slug: child });
  expect(recipe.corePattern?.formula).toBe(PATTERN.formula);
  expect(recipe.corePattern?.inheritedFrom?.slug).toBe(base);

  await mcp.call('add_core_pattern', {
    slug: child,
    family: 'Dressed noodles',
    ...PATTERN,
    formula: 'nut-paste sauce + noodles + crisp shiitake',
  });
  recipe = await mcp.call<RecipeResult>('get_recipe', { slug: child });
  expect(recipe.corePattern?.formula).toBe(
    'nut-paste sauce + noodles + crisp shiitake',
  );
  expect(recipe.corePattern?.inheritedFrom).toBeNull();
});

test('a research record has no core pattern', async () => {
  const mcp = rw();
  const slug = await dish(mcp, `core-${stamp()}`, 'research');
  const message = await refusal(
    mcp.call('add_core_pattern', {
      slug,
      family: 'Dressed noodles',
      ...PATTERN,
    }),
    'a pattern on a research record',
  );
  expect(message).toContain('research record');
});

test('the recipe page draws the pattern on a Core tab, with a safety swap as a warning', async ({
  page,
}) => {
  const mcp = rw();
  const slug = await dish(mcp, `core-${stamp()}`);

  // No pattern, no tab (R-SCR-27).
  await page.goto(`${BASE}/recipes/${slug}`);
  await expect(page.locator('[data-tab-button="core"]')).toHaveCount(0);

  await mcp.call('add_core_pattern', {
    slug,
    family: 'Dressed noodles',
    ...PATTERN,
  });
  await page.goto(`${BASE}/recipes/${slug}`);
  await page.locator('[data-tab-button="core"]').click();

  const panel = page.locator('#panel-core');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-core-formula]')).toHaveText(
    PATTERN.formula,
  );
  await expect(panel.locator('[data-core-role]')).toHaveCount(3);
  await expect(panel.locator('[data-core-swap="safety"]')).toContainText(
    'SAFETY',
  );
  await expect(
    panel.locator('a[href="/classes/pattern/dressed-noodles"]'),
  ).toBeVisible();
});
