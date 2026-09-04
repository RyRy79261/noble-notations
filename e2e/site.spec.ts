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

test('the connector is in the footer and nowhere louder', async ({ page }) => {
  // One person can approve a connector, so the home page should not sell it
  // to readers. It stays reachable from the footer for that person.
  await page.goto('/');

  await expect(page.locator('.site-footer a[href="/connect"]')).toBeVisible();
  await expect(page.locator('main a[href="/connect"]')).toHaveCount(0);
});

test('the connector page is reachable but not indexed', async ({ page }) => {
  const response = await page.goto('/connect');
  expect(response?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/,
  );
});

test('the sitemap does not list the connector page', async ({ request }) => {
  // A noindex page in a sitemap is a contradiction crawlers report as an error.
  const body = await (await request.get('/sitemap.xml')).text();
  expect(body).toContain('/recipes');
  expect(body).not.toContain('/connect');
});

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
