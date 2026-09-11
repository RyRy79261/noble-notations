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
  // Both states of the search screen. `?q=` was the only one driven by any
  // gate, and the bare form is the one a reader reaches from the navigation.
  '/search',
  '/search?q=biltong',
  // Not in the navigation: reached from the footer, and from a recipe.
  '/connect',
  '/recipes/baumy-biltong/batch-logs',
  // The archive note. `pnpm audit:ui` has no `/archive/[...slug]` either —
  // BUILD-PLAN §6.5 — so nothing drove this address at any width.
  '/archive/biltong/batch-03',
];

for (const route of ROUTES) {
  test(`${route} renders at 1280 and at 360`, async ({ page }) => {
    // Both widths, because the shell is not the same construction at each:
    // the navigation moves into a drawer, the recipe aside becomes a tab,
    // and a screen that renders at one width has been shipped broken at the
    // other more than once. `pnpm audit:ui` measures four widths but is a
    // separate gate that CI does not run.
    for (const width of [1280, 360]) {
      await page.setViewportSize({ width, height: width === 360 ? 780 : 900 });

      const response = await page.goto(route);
      expect(response?.status(), `${route} at ${width}`).toBe(200);
      await expect(page.locator('h1').first()).toBeVisible();
      // The foot is drawn per route through the `@foot` slot, so a route
      // added without one loses C-04's three links at both widths.
      await expect(page.locator('[data-page-foot]')).toHaveCount(1);
    }
  });
}

test('the sign-in return trip is protected, and keeps where it was going', async ({
  request,
}) => {
  /*
   * `/connect/done` is the one screen in §10.10 that nothing loads: it is
   * named as a redirect TARGET in `redirects.spec.ts` and never asked for.
   * A visitor with no session never sees it — `src/proxy.ts` runs Neon
   * Auth's middleware on this path and bounces them — and that bounce is the
   * behaviour worth pinning, because the page is the OAuth return leg and a
   * bounce that dropped the destination would strand a connector approval
   * half way through.
   */
  const bare = await request.get('/connect/done', { maxRedirects: 0 });
  expect(bare.status()).toBe(307);
  expect(bare.headers()['location']).toBe('/sign-in');

  const carrying = await request.get('/connect/done?next=%2Frecipes', {
    maxRedirects: 0,
  });
  expect(carrying.status()).toBe(307);
  expect(carrying.headers()['location']).toContain('next=%2Frecipes');
});

test('every share link has a picture, and it is the recipe’s own', async ({
  request,
}) => {
  /*
   * `src/app/opengraph-image.tsx` and
   * `src/app/recipes/[slug]/opengraph-image.tsx` are what every link to this
   * site becomes when somebody pastes it into a chat. Nothing fetches
   * either: they are not routes `audit-ui` drives, they render through
   * `ImageResponse` rather than through the shell, and the recipe one reads
   * the database — so a query change can break every social preview on the
   * site and no gate says a word.
   *
   * The images are compared rather than looked at. A per-recipe image that
   * quietly fell back to the site's own, or to one picture for every recipe,
   * is the failure a status code cannot see.
   */
  const shots = await Promise.all(
    [
      '/opengraph-image',
      '/recipes/baumy-biltong/opengraph-image',
      '/recipes/demi-glace/opengraph-image',
      // A recipe that is not there must still answer with a picture rather
      // than a 500: the address is public and a crawler will ask for it.
      '/recipes/no-such-recipe/opengraph-image',
    ].map((address) => request.get(address)),
  );

  const bodies: string[] = [];
  for (const [index, shot] of shots.entries()) {
    expect(shot.status(), `image ${index}`).toBe(200);
    expect(shot.headers()['content-type']).toContain('image/png');
    const body = await shot.body();
    expect(
      body.byteLength,
      `image ${index} is too small to be a picture`,
    ).toBeGreaterThan(2000);
    bodies.push(body.toString('base64'));
  }

  // Four addresses, four different pictures.
  expect(new Set(bodies).size).toBe(bodies.length);
});

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

  await expect(
    page.locator('[data-page-foot] a[href="/connect"]'),
  ).toBeVisible();
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
    await expect(
      page.locator(`[data-page-foot] a[href="${href}"]`),
    ).toBeVisible();
  }
  await expect(
    page.locator('[data-page-foot] a[href*="github.com"]'),
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
  await expect(page.locator('[data-basket-control]')).toBeVisible();

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
