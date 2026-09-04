import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

const WELLINGTON = '/recipes/beef-wellington-technique';

test.describe('the science section', () => {
  test('separates mechanism from the running commentary', async ({ page }) => {
    await page.goto(WELLINGTON);

    const science = page.locator('.science-section');
    await expect(science).toBeVisible();
    await expect(
      science.getByRole('heading', { name: /the science/i }),
    ).toBeVisible();

    // A mechanism note lives here…
    await expect(science.getByText(/moisture barrier/i).first()).toBeVisible();
  });

  test('sourcing stays in Notes, not in the science', async ({ page }) => {
    // "Where to buy crayfish in Berlin" is research, not science: it is
    // what was learned around the dish, not what happens inside it.
    await page.goto('/recipes/berlin-crayfish-boil');

    await expect(page.getByText(/where to buy crayfish/i)).toBeVisible();
    await expect(page.locator('.science-section')).toHaveCount(0);
  });

  test('a recipe with no science shows no empty section', async ({ page }) => {
    await page.goto('/recipes/pickled-jalapenos');
    await expect(page.locator('.science-section')).toHaveCount(0);
  });
});

test.describe('mobile tabs', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('ingredients and method become tabs', async ({ page }) => {
    await page.goto('/recipes/berlin-crayfish-boil');

    const tabs = page.getByRole('tablist');
    await expect(tabs).toBeVisible();

    const ingredients = page.getByRole('tab', { name: 'Ingredients' });
    const method = page.getByRole('tab', { name: 'Method' });

    await expect(ingredients).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-tab="ingredients"]')).toBeVisible();
    await expect(page.locator('[data-tab="method"]')).toBeHidden();

    await method.click();
    await expect(method).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-tab="method"]')).toBeVisible();
    await expect(page.locator('[data-tab="ingredients"]')).toBeHidden();
  });

  test('ticks survive switching tabs', async ({ page }) => {
    // Panels are hidden, not unmounted — losing ticks on a tab switch
    // would make the checklist useless on the device it matters most on.
    await page.goto('/recipes/berlin-crayfish-boil');

    await page
      .locator('.ingredient-list.checklist input[type=checkbox]')
      .first()
      .check();
    await page.getByRole('tab', { name: 'Method' }).click();
    await page.getByRole('tab', { name: 'Ingredients' }).click();

    await expect(
      page.locator('.ingredient-list.checklist li[data-checked]'),
    ).toHaveCount(1);
  });
});

test.describe('desktop layout', () => {
  test('shows both columns and no tab strip', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/recipes/berlin-crayfish-boil');

    await expect(page.getByRole('tablist')).toBeHidden();
    await expect(page.locator('[data-tab="ingredients"]')).toBeVisible();
    await expect(page.locator('[data-tab="method"]')).toBeVisible();
  });
});

test.describe('agent onboarding', () => {
  test('get_started explains the revision rule before anything else', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readOnly);

    const names = await mcp.listTools();
    expect(names).toContain('get_started');

    const guide = await mcp.call<{
      theOneRule: string;
      workflow: string[];
      noteKinds: Record<string, string>;
    }>('get_started', {});

    expect(guide.theOneRule).toMatch(/revise_recipe/);
    expect(guide.theOneRule).toMatch(/cannot change a version/i);
    expect(guide.workflow[0]).toMatch(/search_recipes/);

    // The distinction the note kinds exist to make.
    expect(guide.noteKinds.science).toMatch(/happens in the dish/i);
    expect(guide.noteKinds.research).toMatch(/after you made it|where to buy/i);
  });

  test('the guide is readable without write scope', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readOnly);
    await expect(mcp.call('get_started', {})).resolves.toBeTruthy();
  });
});
