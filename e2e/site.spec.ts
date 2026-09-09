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
  // `getByRole` and not `locator('table')`: M6 rebuilt the per-piece record
  // as a `role="table"` flex construction so the row can fold at 360, which
  // a real `<table>` cannot do without losing its semantics.
  await expect(page.getByRole('table').first()).toBeVisible();

  // Every seeded run names baumy-biltong, so the index links straight at
  // the nested address rather than through the redirect in
  // /batch-logs/[log]. A run that named no recipe would stay at the top
  // level — see D-01 and R-NAV-08 — but the archive holds none.
  await expect(page).toHaveURL(/\/recipes\/[^/]+\/batch-logs\/[^/]+$/);
});

test('the sign-in page is reachable and not indexed', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(
    // M6 took the title from the design, which writes "Administrator sign
    // in" without the hyphen. Both spellings match so the assertion is about
    // the heading being there rather than about one of them.
    page.getByRole('heading', { name: /administrator sign[- ]in/i }),
  ).toBeVisible();

  const robots = page.locator('meta[name="robots"]');
  await expect(robots).toHaveAttribute('content', /noindex/);
});

test('the connector is reachable on a phone, not only at 1280', async ({
  page,
}) => {
  // C-04 names the connector link as a footer function and §8.1 says
  // `/connect` is "linked from the footer"; it is deliberately absent from
  // the sitemap, so the footer link is its only address. The design drops
  // the middle slot below 1280, which would leave the MCP connector, the
  // repository and /llms.txt unreachable on every phone and tablet, and the
  // assertion above cannot see it because Playwright's default viewport is
  // 1280. G-16 in `page-foot.tsx` records the departure.
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');

  for (const href of ['/connect', '/llms.txt']) {
    await expect(page.locator(`.site-footer a[href="${href}"]`)).toBeVisible();
  }
  await expect(
    page.locator('.site-footer a[href*="github.com"]'),
  ).toBeVisible();
});

test('the 360 drawer hides the rest of the page from a screen reader', async ({
  page,
}) => {
  // Radix hides the background of a modal dialog with `hideOthers`, which
  // deliberately exempts every `[aria-live]` element AND every ancestor of
  // one. A live region anywhere inside the shell therefore keeps the whole
  // shell in the accessibility tree behind the open drawer — measured, with
  // one recipe collected, as a header link named just "1". Every live region
  // now sits outside the shell (`src/app/announcer.tsx`), and this asserts
  // the boundary with a basket that is NOT empty, which is the case that
  // used to leak.
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');
  await page.evaluate(() =>
    window.localStorage.setItem(
      'nn:basket',
      JSON.stringify([{ slug: 'baumy-biltong', title: 'Baumy Biltong' }]),
    ),
  );
  await page.reload();
  await expect(page.locator('.basket-button')).toBeVisible();

  await page.getByRole('button', { name: /open the contents/i }).click();
  await expect(page.locator('[role=dialog]')).toBeVisible();

  const exposed = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('a[href], button')]
      .filter((el) => !el.closest('[role=dialog]'))
      .filter((el) => !el.closest('[aria-hidden="true"]'))
      .map((el) => `${el.tagName}:${(el.textContent ?? '').trim()}`),
  );

  expect(exposed).toEqual([]);
});
