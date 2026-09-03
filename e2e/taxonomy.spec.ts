import { test, expect } from '@playwright/test';

/**
 * Tags are the navigation spine of the repository, and a tag nobody can
 * interpret is dead weight. These cover the blurb reaching the reader, the
 * facet separation holding, and equipment being a first-class facet rather
 * than an afterthought.
 */

test('the taxonomy index lists every facet, equipment included', async ({
  page,
}) => {
  await page.goto('/taxonomy');

  for (const facet of ['Cuisine', 'Technique', 'Equipment', 'Preservation']) {
    await expect(page.getByRole('heading', { name: facet })).toBeVisible();
  }
});

test('a seeded tag shows its blurb on hover', async ({ page }) => {
  // On a recipe page rather than the index: cards cap how many tags they
  // show, so which tags appear there depends on the seed.
  await page.goto('/recipes/baumy-biltong');

  const tag = page.locator('a[href="/cuisines/south-african"]').first();
  await expect(tag).toBeVisible();

  const tooltipId = await tag.getAttribute('aria-describedby');
  expect(tooltipId).toBeTruthy();

  const tooltip = page.locator(`#${tooltipId}`);
  await expect(tooltip).toBeHidden();
  await tag.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(/Dutch, Malay, British/i);
});

test('the blurb is reachable by keyboard, not only by pointer', async ({
  page,
}) => {
  await page.goto('/recipes/baumy-biltong');

  const tag = page.locator('a[href="/cuisines/south-african"]').first();
  const tooltipId = await tag.getAttribute('aria-describedby');
  const tooltip = page.locator(`#${tooltipId}`);

  await expect(tooltip).toBeHidden();
  await tag.focus();
  await expect(tooltip).toBeVisible();
});

test('the tooltip is actually opaque over the text it covers', async ({
  page,
}) => {
  // Regression: the tooltip originally set `background: var(--surface-1)`,
  // a token that does not exist. It rendered, it had a border and a
  // shadow, and the page text underneath read straight through it. A
  // screenshot caught that; nothing else would have.
  await page.goto('/recipes/baumy-biltong');

  const tag = page.locator('a[href="/cuisines/south-african"]').first();
  const tooltipId = await tag.getAttribute('aria-describedby');
  const tooltip = page.locator(`#${tooltipId}`);

  await tag.hover();
  await expect(tooltip).toBeVisible();

  const background = await tooltip.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  // Reject transparent and any alpha below 1.
  expect(background).not.toBe('rgba(0, 0, 0, 0)');
  expect(background).not.toBe('transparent');
  const alpha = background.startsWith('rgba')
    ? Number(background.split(',')[3]?.replace(')', '').trim())
    : 1;
  expect(alpha).toBe(1);
});

test('the same word in two facets carries two different blurbs', async ({
  page,
}) => {
  // air-drying is both a technique (what you do) and a preservation method
  // (what it achieves). Terms never cross facets, so these are two rows.
  await page.goto('/taxonomy/technique/air-drying');
  await expect(page.getByText(/moving unheated air/i).first()).toBeVisible();

  await page.goto('/taxonomy/preservation/air-drying');
  await expect(page.getByText(/water activity/i).first()).toBeVisible();
});

test('a cuisine page shows its blurb and its place in the hierarchy', async ({
  page,
}) => {
  await page.goto('/cuisines/cajun');

  await expect(page.getByText(/dark roux/i).first()).toBeVisible();

  // Cajun is seeded under American; the page has to say so, and the link
  // has to actually go there.
  await expect(page.getByText('Part of')).toBeVisible();
  await expect(page.locator('a[href="/cuisines/american"]')).toBeVisible();
});

test('a parent cuisine lists its narrower regions', async ({ page }) => {
  await page.goto('/cuisines/american');

  await expect(page.getByText('More specific')).toBeVisible();
  await expect(page.locator('a[href="/cuisines/cajun"]')).toBeVisible();
});

test('an equipment term lists the recipes that need it', async ({ page }) => {
  await page.goto('/taxonomy/equipment/drying-box');

  await expect(page.getByText(/steady airflow/i).first()).toBeVisible();
  await expect(
    page.getByRole('link', { name: /biltong/i }).first(),
  ).toBeVisible();
});
