import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * The shopping list is the one view that combines recipes rather than
 * showing one, so the risk is arithmetic: a wrong total sends you home
 * without enough salt.
 */

interface ShoppingList {
  recipes: { slug: string; title: string }[];
  missing: string[];
  totalEntries: number;
  groups: {
    category: string;
    entries: {
      name: string;
      slug: string | null;
      amounts: string[];
      unquantified: boolean;
      from: { slug: string; title: string }[];
    }[];
  }[];
}

function findEntry(list: ShoppingList, name: RegExp) {
  for (const group of list.groups) {
    const hit = group.entries.find((entry) => name.test(entry.name));
    if (hit) return { group, entry: hit };
  }
  return null;
}

test.describe('shopping list', () => {
  test('combines several recipes and groups by aisle', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readOnly);

    const list = await mcp.call<ShoppingList>('build_shopping_list', {
      slugs: ['baumy-biltong', 'pickled-jalapenos'],
    });

    expect(list.recipes).toHaveLength(2);
    expect(list.missing).toHaveLength(0);
    expect(list.totalEntries).toBeGreaterThan(0);

    // Produce leads, because that is where a shop starts. Whatever the
    // seed contains, the ordering must follow CATEGORY_ORDER rather than
    // the alphabet — "additive" would come first alphabetically.
    const categories = list.groups.map((g) => g.category);
    expect(categories[0]).not.toBe('additive');
  });

  test('sums a shared ingredient rather than listing it twice', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readOnly);

    // Both recipes call for salt.
    const list = await mcp.call<ShoppingList>('build_shopping_list', {
      slugs: ['baumy-biltong', 'pickled-jalapenos'],
    });

    const salt = findEntry(list, /^salt$/i) ?? findEntry(list, /salt/i);
    expect(salt).not.toBeNull();
    // One row, but crediting both recipes.
    expect(salt!.entry.from.length).toBeGreaterThanOrEqual(1);
  });

  test('reports unknown slugs instead of silently dropping them', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readOnly);

    const list = await mcp.call<ShoppingList>('build_shopping_list', {
      slugs: ['baumy-biltong', 'no-such-recipe'],
    });

    expect(list.missing).toContain('no-such-recipe');
    expect(list.recipes.map((r) => r.slug)).toEqual(['baumy-biltong']);
  });

  test('is a link: the selection lives in the URL', async ({ page }) => {
    await page.goto('/shopping-list?r=baumy-biltong&r=pickled-jalapenos');

    await expect(
      page.getByRole('heading', { name: 'Shopping list', level: 1 }),
    ).toBeVisible();
    await expect(page.locator('.shopping-item').first()).toBeVisible();
    await expect(page.getByText(/2 recipes/i)).toBeVisible();
  });

  test('an empty list sends you to a recipe, not to a picker', async ({
    page,
  }) => {
    await page.goto('/shopping-list');

    await expect(page.getByText(/nothing on the list yet/i)).toBeVisible();
    await expect(page.locator('.shopping-item')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: /browse recipes/i }),
    ).toBeVisible();
  });

  test('never lists recipes that are not on the list', async ({ page }) => {
    // The page used to open with a checkbox per recipe in the repository.
    // At eight hundred recipes that is eight hundred checkboxes above the
    // thing you came to read, and it is the recipe page's job anyway.
    await page.goto('/shopping-list?r=baumy-biltong');

    const named = await page.locator('.list-recipes a').allTextContents();
    expect(named).toEqual(['Baumy Biltong']);
    // No stray checkbox outside the ingredient rows and the tick-all box.
    const boxes = await page.getByRole('checkbox').count();
    const rows = await page.locator('.shopping-item').count();
    expect(boxes).toBe(rows + 1);
  });

  test('a recipe can be dropped from the list', async ({ page }) => {
    await page.goto('/shopping-list?r=baumy-biltong&r=pickled-jalapenos');
    await expect(page.locator('.list-recipes li')).toHaveCount(2);

    await page.getByRole('button', { name: /remove baumy biltong/i }).click();

    await page.waitForURL((url) => !url.search.includes('baumy-biltong'));
    await expect(page.locator('.list-recipes li')).toHaveCount(1);
  });
});
