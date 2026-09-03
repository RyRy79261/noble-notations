import { test, expect } from '@playwright/test';

/**
 * The filter is one component shared by every grouped view, so these cover
 * the behaviour once per surface it is wired into rather than re-testing
 * the matching logic each time.
 */

const VIEWS = [
  {
    path: '/ingredients',
    // Matches an ingredient present in the seed.
    query: 'coriander',
    absent: 'jalapeno',
    itemSelector: 'tbody tr',
  },
  {
    path: '/taxonomy',
    query: 'curing',
    absent: 'Sichuan',
    itemSelector: '.tag-wrap',
  },
];

for (const view of VIEWS) {
  test(`${view.path} filters its groups`, async ({ page }) => {
    await page.goto(view.path);

    const box = page.getByRole('searchbox');
    await expect(box).toBeVisible();

    const before = await page.locator(view.itemSelector).count();
    expect(before).toBeGreaterThan(1);

    await box.fill(view.query);

    const after = await page.locator(view.itemSelector).count();
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);

    // Groups left with nothing are hidden, not shown empty. Scoped to the
    // sections: the page's own intro prose mentions example terms, and
    // matching against the whole document would find those instead.
    await expect(
      page.locator('section.section').getByText(new RegExp(view.absent, 'i')),
    ).toHaveCount(0);
  });

  test(`${view.path} reports how much it is hiding`, async ({ page }) => {
    await page.goto(view.path);
    const box = page.getByRole('searchbox');

    // The count is a live region, so it must exist before and after.
    const count = page.locator('#filter-count');
    await expect(count).toBeVisible();

    await box.fill(view.query);
    await expect(count).toContainText(/\d+ of \d+/);
  });

  test(`${view.path} says so when nothing matches`, async ({ page }) => {
    await page.goto(view.path);
    await page.getByRole('searchbox').fill('zzzznotathing');

    await expect(page.getByText(/nothing matches/i)).toBeVisible();
    await expect(page.locator(view.itemSelector)).toHaveCount(0);
  });
}

test('the shopping list is filterable too', async ({ page }) => {
  await page.goto('/shopping-list?r=baumy-biltong&r=pickled-jalapenos');

  const before = await page.locator('.shopping-item').count();
  expect(before).toBeGreaterThan(1);

  await page.getByRole('searchbox').fill('salt');
  const after = await page.locator('.shopping-item').count();
  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThan(before);
});
