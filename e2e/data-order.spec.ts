import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * The order values come back in.
 *
 * A mutation run flipped four `ORDER BY` directions in `src/lib/queries/`
 * — `listRecipes`, `listIngredients`, `listCategories` and the primary-tag
 * sort inside `attachTerms` — and the whole suite stayed green for every
 * one of them. The pattern behind that is worth stating, because it is what
 * this file exists to answer: the suite tested what a value IS and almost
 * never what ORDER values come in.
 *
 * Each of the four is load-bearing on a screen or in the guide:
 *
 * - `listRecipes` feeds the home band whose label is literally "Recently
 *   worked" (`src/app/page.tsx:234`), and `/recipes`, `/llms.txt` and
 *   `sitemap.xml` read the same function. Reversed, home opens with the six
 *   recipes nobody has touched.
 * - `listIngredients` orders by how many recipes use an ingredient, which
 *   `src/app/ingredients/page.tsx:142` states in its own comment.
 * - `listCategories` orders by how many recipes carry a tag, and the home
 *   page's category section is grouped "in the order `listCategories`
 *   returns them" (`src/app/page.tsx:117`).
 * - The primary tag is set by nothing but position: `get_started` tells an
 *   agent "the order of the list is the only control: put a tag first to
 *   make it the primary one".
 *
 * HOW EACH ONE IS PINNED. Two rows written by this file, a known distance
 * apart on the value being sorted, and an assertion that names which comes
 * first. Never a position in the whole list, and never a count: this suite
 * shares one database with every other spec, so an absolute index is a
 * number that some future author has to re-baseline. A pair is a fact about
 * the ordering and about nothing else.
 *
 * AND IN BOTH DIRECTIONS WHERE THE VALUE CAN MOVE. `updatedAt` can, so the
 * recipe test writes the pair, asserts the order, touches the older one and
 * asserts the order has swapped. One direction alone is also satisfied by a
 * query that ignores the column and happens to return insertion order.
 */

const OLDER = 'order-recipe-older';
const NEWER = 'order-recipe-newer';

const BUSY_INGREDIENT = 'Order Busy Silverside';
const QUIET_INGREDIENT = 'Order Quiet Silverside';

const BUSY_TAG = 'Order Busy Method';
const QUIET_TAG = 'Order Quiet Method';

const PRIMARY_SLUG = 'order-primary-tags';
/** Deliberately the later label of the two, so `asc(label)` disagrees. */
const PRIMARY_TAG = 'Order Zulu Cuisine';
const SECONDARY_TAG = 'Order Alpha Cuisine';

function rw() {
  return mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
}

/**
 * Create a recipe if it is not there already.
 *
 * A `beforeAll` fixture is a STATE, not an event. Playwright restarts the
 * worker after a test fails, and a restarted worker runs `beforeAll` again —
 * so a bare `create_recipe` turns the first real failure in a file into a
 * second, louder failure in the setup, and the message a reader then sees is
 * "a recipe with that slug already exists" instead of the fault.
 */
async function ensureRecipe(
  mcp: ReturnType<typeof mcpClient>,
  args: Record<string, unknown>,
): Promise<void> {
  try {
    await mcp.call('create_recipe', args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) throw error;
  }
}

interface RecipeRow {
  slug: string;
  title: string;
}

interface SearchResult {
  results: RecipeRow[];
}

interface IngredientRow {
  slug: string;
  name: string;
  recipeCount: number;
}

interface CategoryRow {
  categoryType: string;
  slug: string;
  label: string;
  recipeCount: number;
}

interface TermRef {
  categoryType: string;
  slug: string;
  label: string;
  isPrimary?: boolean;
}

interface RecipeDetail {
  slug: string;
  terms: TermRef[];
}

/** Every `/<prefix>/…` link under `root`, in document order, as slugs. */
async function linkedSlugs(
  root: import('@playwright/test').Locator,
  prefix: string,
): Promise<string[]> {
  const hrefs = await root
    .getByRole('link')
    .evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute('href') ?? '').filter(Boolean),
    );
  return hrefs
    .filter((href) => href.startsWith(prefix))
    .map((href) => href.slice(prefix.length));
}

/**
 * The recipe slugs the home page's "Recently worked" band draws, in order.
 *
 * The band is a `<section>` named by its own `h2`, and it holds
 * `RecipeGrid`, which draws one link per recipe in the order `listRecipes`
 * returned. `section` and not `div`: the head is a `div` whose text also
 * starts with the label, and it holds no link at all.
 */
async function bandSlugs(
  page: import('@playwright/test').Page,
): Promise<string[]> {
  const band = page
    .locator('main section')
    .filter({ hasText: /^Recently worked/ })
    .first();
  await expect(band).toBeVisible();
  return linkedSlugs(band, '/recipes/');
}

/** Where `slug` sits in a list of slugs. `-1` reads as "absent" and fails. */
function positionOf(slugs: string[], slug: string): number {
  const at = slugs.indexOf(slug);
  expect(at, `${slug} is not in [${slugs.join(', ')}]`).toBeGreaterThanOrEqual(
    0,
  );
  return at;
}

/*
 * NOT `mode: 'serial'`, on purpose. Playwright runs a file's tests in
 * declaration order under one worker, which is all the ordering the three
 * recipe tests need — the third one revises the pair and the first two must
 * read it before that. Serial mode would add the one thing this file must
 * not have: a failure in the first test SKIPS the rest, and a file whose
 * later assertions vanish when an earlier one breaks reports one fault for
 * four.
 */
test.describe('recipes come back most recently worked first', () => {
  test.beforeAll(async () => {
    const mcp = rw();

    for (const [slug, title] of [
      [OLDER, 'Order older subject'],
      [NEWER, 'Order newer subject'],
    ] as const) {
      await ensureRecipe(mcp, {
        title,
        slug,
        kind: 'recipe',
        rationale: 'A pair written one after the other, to fix an order.',
        ingredients: [{ name: 'Order test salt', quantity: 1, unit: 'tsp' }],
        steps: [{ instruction: 'Leave it alone.' }],
      });
    }
  });

  test('search_recipes with no query puts the newer one first', async () => {
    const mcp = rw();
    const found = await mcp.call<SearchResult>('search_recipes', {
      query: '',
      limit: 100,
    });
    const slugs = found.results.map((r) => r.slug);

    // No query, so `listRecipes`' own ordering is the whole answer: the
    // rank term is dropped and `r.updated_at DESC` is all that is left.
    expect(positionOf(slugs, NEWER)).toBeLessThan(positionOf(slugs, OLDER));
  });

  test('the home band labelled "Recently worked" draws the newer one first', async ({
    page,
  }) => {
    await page.goto('/');
    const slugs = await bandSlugs(page);
    expect(positionOf(slugs, NEWER)).toBeLessThan(positionOf(slugs, OLDER));
  });

  test('working the older one again moves it in front', async ({ page }) => {
    const mcp = rw();

    // A revision is the only way a recipe is "worked", and it is what the
    // band's label promises. This is the second direction: a query that
    // ignored `updatedAt` and returned insertion order passed the two
    // assertions above and fails here.
    await mcp.call('revise_recipe', {
      slug: OLDER,
      rationale: 'Worked again, so the home band has to notice.',
      ingredients: [{ name: 'Order test salt', quantity: 2, unit: 'tsp' }],
      steps: [{ instruction: 'Leave it alone for longer.' }],
    });

    const found = await mcp.call<SearchResult>('search_recipes', {
      query: '',
      limit: 100,
    });
    const slugs = found.results.map((r) => r.slug);
    expect(positionOf(slugs, OLDER)).toBeLessThan(positionOf(slugs, NEWER));

    // And on the screen, from `listRecipes` rather than from the search.
    await page.goto('/');
    expect(positionOf(await bandSlugs(page), OLDER)).toBeLessThan(
      positionOf(await bandSlugs(page), NEWER),
    );
  });
});

test.describe('ingredients come back busiest first', () => {
  test.beforeAll(async () => {
    const mcp = rw();

    // Three recipes name the busy one and one names the quiet one, so the
    // counts are 3 and 1 and no tiebreak is reachable.
    for (const n of [1, 2, 3]) {
      await ensureRecipe(mcp, {
        title: `Order busy subject ${n}`,
        slug: `order-busy-subject-${n}`,
        kind: 'recipe',
        rationale: 'One of three recipes that share an ingredient.',
        ingredients: [{ name: BUSY_INGREDIENT, quantity: 1, unit: 'kg' }],
        steps: [{ instruction: 'Hang it.' }],
      });
    }
    await ensureRecipe(mcp, {
      title: 'Order quiet subject',
      slug: 'order-quiet-subject',
      kind: 'recipe',
      rationale: 'The only recipe that names the quiet ingredient.',
      ingredients: [{ name: QUIET_INGREDIENT, quantity: 1, unit: 'kg' }],
      steps: [{ instruction: 'Hang it.' }],
    });
  });

  test('list_ingredients puts the one in three recipes above the one in one', async () => {
    const mcp = rw();
    const rows = await mcp.call<IngredientRow[]>('list_ingredients', {});

    const busy = rows.find((r) => r.name === BUSY_INGREDIENT);
    const quiet = rows.find((r) => r.name === QUIET_INGREDIENT);
    expect(busy?.recipeCount).toBe(3);
    expect(quiet?.recipeCount).toBe(1);

    const slugs = rows.map((r) => r.slug);
    expect(positionOf(slugs, busy!.slug)).toBeLessThan(
      positionOf(slugs, quiet!.slug),
    );
  });

  test('/ingredients draws them in that order too', async ({ page }) => {
    await page.goto('/ingredients');

    const slugs = await linkedSlugs(page.locator('main'), '/ingredients/');

    expect(positionOf(slugs, 'order-busy-silverside')).toBeLessThan(
      positionOf(slugs, 'order-quiet-silverside'),
    );
  });
});

test.describe('tags come back busiest first', () => {
  test.beforeAll(async () => {
    const mcp = rw();

    for (const n of [1, 2] as const) {
      await ensureRecipe(mcp, {
        title: `Order busy tag subject ${n}`,
        slug: `order-busy-tag-subject-${n}`,
        kind: 'recipe',
        rationale: 'One of two recipes that carry the busy tag.',
        categories: { technique: [BUSY_TAG] },
        ingredients: [{ name: 'Order test salt' }],
        steps: [{ instruction: 'Do it.' }],
      });
    }
    await ensureRecipe(mcp, {
      title: 'Order quiet tag subject',
      slug: 'order-quiet-tag-subject',
      kind: 'recipe',
      rationale: 'The only recipe that carries the quiet tag.',
      categories: { technique: [QUIET_TAG] },
      ingredients: [{ name: 'Order test salt' }],
      steps: [{ instruction: 'Do it.' }],
    });
  });

  test('list_categories puts the tag on two recipes above the tag on one', async () => {
    const mcp = rw();
    const rows = await mcp.call<CategoryRow[]>('list_categories', {
      categoryType: 'technique',
    });

    const busy = rows.find((r) => r.label === BUSY_TAG);
    const quiet = rows.find((r) => r.label === QUIET_TAG);
    expect(busy?.recipeCount).toBe(2);
    expect(quiet?.recipeCount).toBe(1);

    const slugs = rows.map((r) => r.slug);
    expect(positionOf(slugs, busy!.slug)).toBeLessThan(
      positionOf(slugs, quiet!.slug),
    );
  });

  test('/classes draws the technique tags in that order', async ({ page }) => {
    await page.goto('/classes');

    // Every tag pill on the page links at `/classes/<type>/<slug>`, and the
    // technique row draws its own type's pills in the order the query gave
    // them. Filtering to the type keeps this a fact about one row.
    const slugs = await linkedSlugs(
      page.locator('main'),
      '/classes/technique/',
    );

    expect(positionOf(slugs, 'order-busy-method')).toBeLessThan(
      positionOf(slugs, 'order-quiet-method'),
    );
  });
});

test('the primary tag is the first tag of its type, whatever its label', async () => {
  const mcp = rw();

  /*
   * R-CAT: position is the only control, and `get_started` says so. The two
   * labels are chosen so that the label tiebreak DISAGREES: `Order Alpha
   * Cuisine` sorts before `Order Zulu Cuisine`, and `Order Zulu Cuisine` is
   * sent first and is therefore the primary one. So this passes only if
   * `isPrimary` is sorted first and descending; ascending, or dropped,
   * hands back Alpha.
   */
  await mcp.call('create_recipe', {
    title: 'Order primary tags subject',
    slug: PRIMARY_SLUG,
    kind: 'recipe',
    rationale: 'A recipe whose cuisine tags are in a deliberate order.',
    categories: { cuisine: [PRIMARY_TAG, SECONDARY_TAG] },
    ingredients: [{ name: 'Order test salt' }],
    steps: [{ instruction: 'Do it.' }],
  });

  const recipe = await mcp.call<RecipeDetail>('get_recipe', {
    slug: PRIMARY_SLUG,
  });
  const cuisines = recipe.terms.filter((t) => t.categoryType === 'cuisine');
  expect(cuisines.map((t) => t.label)).toEqual([PRIMARY_TAG, SECONDARY_TAG]);
  expect(cuisines[0]!.isPrimary).toBe(true);
  expect(cuisines[1]!.isPrimary).toBe(false);

  // `search_recipes` reports it from the same helper, and the guide names
  // both tools, so both are the contract.
  const found = await mcp.call<{
    results: (RecipeRow & { terms: TermRef[] })[];
  }>('search_recipes', { query: 'Order primary tags subject' });
  const hit = found.results.find((r) => r.slug === PRIMARY_SLUG);
  const searchCuisines = (hit?.terms ?? []).filter(
    (t) => t.categoryType === 'cuisine',
  );
  expect(searchCuisines.map((t) => t.label)).toEqual([
    PRIMARY_TAG,
    SECONDARY_TAG,
  ]);
});
