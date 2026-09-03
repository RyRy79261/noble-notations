import { test, expect } from '@playwright/test';

/**
 * Route-level smoke coverage. Not a substitute for the lifecycle tests —
 * this is the net that catches a page 500-ing after a query change.
 */

const ROUTES = [
  '/',
  '/recipes',
  '/cuisines',
  '/categories',
  '/ingredients',
  '/experiments',
  '/archive',
  '/connect',
  '/search?q=biltong',
];

for (const route of ROUTES) {
  test(`${route} renders`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();
  });
}

test('search narrows by ingredient with no free text', async ({ page }) => {
  // The regression that shipped broken: with no query term the ranking
  // expression collapsed to `ORDER BY 0`, which Postgres reads as an
  // ordinal position and rejects.
  const response = await page.goto('/search?ingredient=coriander+seed');
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('link', { name: /biltong/i }).first(),
  ).toBeVisible();
});

test('an experiment shows its recorded observations', async ({ page }) => {
  await page.goto('/experiments');
  await page.getByRole('link', { name: /batch/i }).first().click();
  await expect(page.locator('table').first()).toBeVisible();
});

test('the sign-in page is reachable and not indexed', async ({ page }) => {
  await page.goto('/auth');
  await expect(
    page.getByRole('heading', { name: /administrator sign-in/i }),
  ).toBeVisible();

  const robots = page.locator('meta[name="robots"]');
  await expect(robots).toHaveAttribute('content', /noindex/);
});
