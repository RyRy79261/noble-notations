import { test, expect } from '@playwright/test';

/**
 * The recipe page's ingredient list is the one you read while shopping and
 * while cooking, so it ticks, and it re-orders between the two things you
 * might want: shop order, or the recipe's own components.
 */

const RECIPE = '/recipes/berlin-crayfish-boil';

test('ingredients are tickable and the count keeps up', async ({ page }) => {
  await page.goto(RECIPE);

  const boxes = page.locator('.ingredient-list.checklist input[type=checkbox]');
  const total = await boxes.count();
  expect(total).toBeGreaterThan(1);

  await expect(page.getByText(`0 / ${total}`)).toBeVisible();

  await boxes.first().check();
  await expect(page.getByText(`1 / ${total}`)).toBeVisible();
  await expect(
    page.locator('.ingredient-list.checklist li[data-checked]'),
  ).toHaveCount(1);
});

test('ticks survive a reload', async ({ page }) => {
  await page.goto(RECIPE);

  const boxes = page.locator('.ingredient-list.checklist input[type=checkbox]');
  await boxes.first().check();
  await expect(boxes.first()).toBeChecked();

  await page.reload();
  await expect(
    page.locator('.ingredient-list.checklist li[data-checked]'),
  ).toHaveCount(1);

  await page.getByRole('button', { name: /clear ticks/i }).click();
  await expect(
    page.locator('.ingredient-list.checklist li[data-checked]'),
  ).toHaveCount(0);
});

test('defaults to shop order and can switch to as written', async ({
  page,
}) => {
  await page.goto(RECIPE);

  const shop = page.getByRole('button', { name: 'Shop order' });
  const written = page.getByRole('button', { name: 'As written' });

  await expect(shop).toHaveAttribute('aria-pressed', 'true');

  // Shop order groups by category, so the headings are aisle names.
  const headings = page.locator('.ingredient-group h4');
  await expect(headings.first()).toBeVisible();
  const shopHeadings = await headings.allInnerTexts();
  expect(shopHeadings.join(' ')).toMatch(/produce|meat|spice|sauce/i);

  await written.click();
  await expect(written).toHaveAttribute('aria-pressed', 'true');
  const writtenHeadings = await page
    .locator('.ingredient-group h4')
    .allInnerTexts();
  expect(writtenHeadings.join(' ')).not.toBe(shopHeadings.join(' '));
});

test('shop order puts produce before spices', async ({ page }) => {
  await page.goto(RECIPE);

  const headings = await page.locator('.ingredient-group h4').allInnerTexts();
  const produce = headings.findIndex((h) => /produce/i.test(h));
  const spice = headings.findIndex((h) => /spice/i.test(h));

  if (produce !== -1 && spice !== -1) {
    expect(produce).toBeLessThan(spice);
  }
});

test('the amount never overruns the ingredient name', async ({ page }) => {
  // Regression: the amount sat in a fixed 4.5rem grid track, so "50-60 kg"
  // overflowed and printed on top of "Crayfish". Geometry, not markup —
  // the DOM was correct and only a screenshot showed it, so this measures
  // the boxes directly.
  await page.goto(RECIPE);

  const overlaps = await page.evaluate(() => {
    const bad: string[] = [];
    for (const li of document.querySelectorAll(
      '.ingredient-list.checklist li',
    )) {
      const amount = li.querySelector('.amount');
      const what = li.querySelector('.what');
      if (!amount || !what) continue;
      const a = amount.getBoundingClientRect();
      const w = what.getBoundingClientRect();
      // Same row and the amount crosses into the name's column.
      if (Math.abs(a.top - w.top) < 4 && a.right > w.left + 1) {
        bad.push(`${amount.textContent} / ${what.textContent}`);
      }
    }
    return bad;
  });

  expect(overlaps).toEqual([]);
});

test('a recipe can be added to the basket and built into a list', async ({
  page,
}) => {
  await page.goto(RECIPE);

  await page.getByRole('button', { name: /add to shopping list/i }).click();
  await expect(
    page.getByRole('button', { name: /in shopping list/i }),
  ).toBeVisible();

  // The basket persists across navigation, which is the whole point.
  await page.goto('/recipes/baumy-biltong');
  await page.getByRole('button', { name: /add to shopping list/i }).click();

  // The control is a link straight to the list now. It used to open a
  // dialog listing the collected recipes under the heading "Shopping
  // list", with the ingredients another click behind "Build the list" —
  // which is not a shopping list, and is what this test used to assert.
  const basket = page.getByRole('link', { name: /shopping list 2/i });
  await expect(basket).toBeVisible();
  await basket.click();

  // Both recipes end up in the URL, so the result is still shareable.
  await page.waitForURL(/shopping-list\?r=.*&r=/);
  await expect(page.getByText(/2 recipes/i)).toBeVisible();
  await expect(page.locator('.shopping-item').first()).toBeVisible();
});

test('the shopping list stays in step with the basket', async ({ page }) => {
  await page.goto(RECIPE);
  await page.getByRole('button', { name: /add to shopping list/i }).click();
  await page.getByRole('link', { name: /shopping list 1/i }).click();
  await expect(page.locator('.shopping-item').first()).toBeVisible();

  // The picker arrives collapsed once a list exists, so opening it is part
  // of the journey rather than an implementation detail to skip.
  await page.getByRole('button', { name: /choose \(1\)/i }).click();

  // Emptying the selection has to empty the basket too. When it did not,
  // the header kept counting recipes the list no longer held, and there
  // was no longer a dialog to clear it from.
  await page.getByRole('button', { name: /clear all/i }).click();
  await expect(page.locator('.basket-button')).toHaveCount(0);
});
