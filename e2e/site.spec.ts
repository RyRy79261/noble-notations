import { test, expect } from '@playwright/test';

/**
 * Route-level smoke coverage. Not a substitute for the lifecycle tests —
 * this is the net that catches a page 500-ing after a query change.
 */

// In the order §8.2 draws the navigation, so a route added to one and not
// the other is visible here.
const ROUTES = [
  '/',
  '/recipes',
  '/science',
  '/cuisines',
  '/classes',
  '/ingredients',
  '/list',
  '/batch-logs',
  '/archive',
  '/search?q=biltong',
  // Not in the navigation: reached from the footer, and from a recipe.
  '/connect',
  '/recipes/baumy-biltong/batch-logs',
];

for (const route of ROUTES) {
  test(`${route} renders`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();
  });
}

test('the primary navigation holds the 9 destinations, in order', async ({
  page,
}) => {
  // §8.2. Asserted as an ordered list of addresses rather than as nine
  // separate "is it visible" checks, because the two ways this breaks are
  // an item silently pointing at its old address — every rename still
  // answers through a 308, so nothing looks wrong — and an item landing in
  // the wrong place when the drawer is built in M3.
  await page.goto('/');

  const hrefs = await page
    .locator('nav[aria-label="Primary"] a')
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute('href') ?? ''),
    );

  expect(hrefs).toEqual([
    '/recipes',
    '/science',
    '/cuisines',
    '/classes',
    '/ingredients',
    '/list',
    '/batch-logs',
    '/archive',
    '/search',
  ]);
});

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
  await page.goto('/batch-logs');
  // Scoped to `main`. The primary nav is emitted before it and now holds a
  // "Batch logs" link of its own, so an unscoped /batch/i match resolves to
  // the header and the click lands straight back on the index.
  await page
    .locator('main')
    .getByRole('link', { name: /batch/i })
    .first()
    .click();
  await expect(page.locator('table').first()).toBeVisible();

  // Every seeded run names baumy-biltong, so the index links straight at
  // the nested address rather than through the redirect in
  // /batch-logs/[log]. A run that named no recipe would stay at the top
  // level — see D-01 and R-NAV-08 — but the archive holds none.
  await expect(page).toHaveURL(/\/recipes\/[^/]+\/batch-logs\/[^/]+$/);
});

test('the sign-in page is reachable and not indexed', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(
    page.getByRole('heading', { name: /administrator sign-in/i }),
  ).toBeVisible();

  const robots = page.locator('meta[name="robots"]');
  await expect(robots).toHaveAttribute('content', /noindex/);
});
