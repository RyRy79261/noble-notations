import { test, expect } from '@playwright/test';

/**
 * The shopping journey as it is actually walked: on a phone, from a recipe.
 *
 * Every one of these covers something that shipped broken, and shipped
 * broken because the existing tests checked pages in isolation rather than
 * the path between them.
 *
 * The first is the sharpest lesson. The basket control was the last child
 * of a nav that scrolls sideways on a phone, which put it at x=766 on a
 * 390px screen. Playwright's `toBeVisible()` passes on that — the element
 * is rendered and scrollable-to — so it has to be measured against the
 * viewport, not merely asserted to exist.
 */

const PHONE = { width: 390, height: 844 };

/** Click through to the built list and wait for it to actually be there. */
async function openList(page: import('@playwright/test').Page) {
  await page.locator('.basket-button').click();
  // The control is a link, so the rows arrive after a navigation. Measuring
  // before they land reads as "0 items", which is how the first draft of
  // these tests failed.
  await expect(page.locator('.shopping-item').first()).toBeVisible();
}

async function collect(page: import('@playwright/test').Page, slugs: string[]) {
  for (const slug of slugs) {
    await page.goto(`/recipes/${slug}`);
    await page.getByRole('button', { name: /add to shopping list/i }).click();
    await expect(
      page.getByRole('button', { name: /in shopping list/i }),
    ).toBeVisible();
  }
}

test.describe('shopping on a phone', () => {
  test.use({ viewport: PHONE });

  test('the basket control is inside the screen, not off the side', async ({
    page,
  }) => {
    await collect(page, ['baumy-biltong', 'berlin-crayfish-boil']);

    const control = page.locator('.basket-button');
    await expect(control).toBeVisible();

    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
  });

  test('it leads straight to ingredients, not to a list of recipes', async ({
    page,
  }) => {
    await collect(page, ['baumy-biltong', 'berlin-crayfish-boil']);
    await openList(page);

    await expect(page).toHaveURL(/\/shopping-list\?.*r=baumy-biltong/);

    // Ingredients, with a tickable box each — not recipe titles with a ×.
    const rows = page.locator('.shopping-item');
    expect(await rows.count()).toBeGreaterThan(10);
    expect(
      await page.locator('.shopping-item input[type=checkbox]').count(),
    ).toBe(await rows.count());
  });

  test('the list is in shop order and says which recipe wants each thing', async ({
    page,
  }) => {
    await collect(page, ['baumy-biltong', 'berlin-crayfish-boil']);
    await openList(page);

    const headings = await page
      .locator('.shopping-group-heading')
      .allTextContents();
    // Produce leads and cupboard staples trail, the way a shop is walked.
    expect(headings[0]).toMatch(/produce/i);
    expect(headings.findIndex((h) => /produce/i.test(h))).toBeLessThan(
      headings.findIndex((h) => /spices/i.test(h)),
    );

    // Every row names the recipe that put it there.
    const salt = page.locator('.shopping-item', { hasText: 'Salt' }).first();
    await expect(salt.locator('.shopping-from')).toContainText(/Biltong|Boil/);
  });

  test('tick all ticks everything, and unticks it again', async ({ page }) => {
    await collect(page, ['baumy-biltong']);
    await openList(page);

    const total = await page.locator('.shopping-item').count();
    const counter = page.locator('.checklist-head .faint');

    await expect(counter).toContainText(`0 / ${total}`);
    await page.locator('.check-all input').check();
    await expect(counter).toContainText(`${total} / ${total}`);
    await page.locator('.check-all input').uncheck();
    await expect(counter).toContainText(`0 / ${total}`);
  });

  test('a section heading stands clear of the row above it', async ({
    page,
  }) => {
    await collect(page, ['baumy-biltong', 'berlin-crayfish-boil']);
    await openList(page);

    // Measured, not asserted from the markup: the complaint was that
    // headings touched their rows, which a selector cannot see.
    const gap = await page.evaluate(() => {
      const headings = document.querySelectorAll('.shopping-group-heading');
      const heading = headings[1] as HTMLElement | undefined;
      if (!heading) return null;
      const previous = heading
        .closest('section')
        ?.previousElementSibling?.querySelector('.shopping-item:last-child');
      if (!previous) return null;
      return (
        heading.getBoundingClientRect().top -
        previous.getBoundingClientRect().bottom
      );
    });
    expect(gap).not.toBeNull();
    expect(gap!).toBeGreaterThan(20);
  });
});

test.describe('scaling a recipe', () => {
  test('a batch multiplier scales the amounts', async ({ page }) => {
    await page.goto('/recipes/baumy-biltong');

    const beef = page
      .locator('.ingredient-list li', { hasText: 'Beef silverside' })
      .first()
      .locator('.amount');

    await expect(beef).toHaveText('10 kg');
    await page.getByRole('button', { name: '×2', exact: true }).click();
    await expect(beef).toHaveText('20 kg');
    await page.getByRole('button', { name: '×0.5', exact: true }).click();
    await expect(beef).toHaveText('5 kg');
  });

  test('×1 shows exactly what the recipe says', async ({ page }) => {
    await page.goto('/recipes/baumy-biltong');

    // The first version of the scaler rounded unconditionally, so 138.5 g
    // of salt rendered as "139 g" on a page nobody had scaled. Rounding a
    // scaled amount is helpful; rounding the recipe's own is a rewrite.
    const salt = page
      .locator('.ingredient-list li', { hasText: 'Salt' })
      .first()
      .locator('.amount');

    await expect(salt).toHaveText('138.5 g');
    await page.getByRole('button', { name: '×2', exact: true }).click();
    await expect(salt).toHaveText('277 g');
    await page.getByRole('button', { name: '×1', exact: true }).click();
    await expect(salt).toHaveText('138.5 g');
  });

  test('a multiplier can be typed, including a half batch', async ({
    page,
  }) => {
    await page.goto('/recipes/baumy-biltong');

    const box = page.locator('.scale-custom input');
    const beef = page
      .locator('.ingredient-list li', { hasText: 'Beef silverside' })
      .first()
      .locator('.amount');

    // The first version held one controlled number, so "0" and "0." were
    // rejected mid-word and React snapped the box back with the caret after
    // the old digits. Typing 0.5 produced 1.5 — a half batch was
    // unreachable, and the field could not be emptied at all.
    await box.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('0.5');
    await expect(box).toHaveValue('0.5');
    await expect(beef).toHaveText('5 kg');

    await box.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await expect(box).toHaveValue('');
    // Clearing the box must not blank every amount on the page.
    await expect(beef).toHaveText('5 kg');

    await page.keyboard.type('2.5');
    await expect(beef).toHaveText('25 kg');
  });

  test('an out-of-range multiplier is clamped, not obeyed', async ({
    page,
  }) => {
    await page.goto('/recipes/baumy-biltong');
    const box = page.locator('.scale-custom input');

    await box.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('999');
    await box.blur();

    await expect(box).toHaveValue('100');
  });

  test('the yield and the ingredients never state two batch sizes', async ({
    page,
  }) => {
    await page.goto('/recipes/baumy-biltong');

    const yieldCell = page
      .locator('table tr', { hasText: 'Yield' })
      .locator('td.numeric');

    // The scale used to live inside the ingredient list, where nothing else
    // could see it: at ×3 the table said "4.5 kg dried" while the readout
    // beside the scaler said "13.5 kg". Both from the same recipe, on the
    // same screen.
    await expect(yieldCell).toContainText('4.5 kg');
    await page.getByRole('button', { name: '×3', exact: true }).click();
    await expect(yieldCell).toContainText('13.5 kg');
    await expect(yieldCell).toContainText('×3 batch');
    await expect(page.locator('.scale-yield')).toContainText('13.5 kg');
  });

  test('scaling reports the yield it produces', async ({ page }) => {
    await page.goto('/recipes/baumy-biltong');

    await expect(page.locator('.scale-yield')).toHaveCount(0);
    await page.getByRole('button', { name: '×2', exact: true }).click();
    await expect(page.locator('.scale-yield')).toContainText('9 kg');
  });
});

test.describe('amounts keep the unit the recipe wrote', () => {
  /**
   * The list used to sum in base units and throw the written unit away, so
   * every amount was re-expressed in grams or millilitres on its way to the
   * page. That is a rewrite, not a conversion: a lone "2 tbsp" of sugar —
   * one line, added to nothing — rendered as "29.6 ml", "6 oz" of tomato
   * paste as "170.1 g", "2 cup" of mirepoix as "473.2 ml". Worst of all,
   * two tablespoons plus one tablespoon came out as "44.4 ml", a conversion
   * performed on two numbers that already shared a unit.
   *
   * Nobody measures a tablespoon in millilitres, and nobody buys tomato
   * paste by the gram. The unit is part of the quantity.
   */

  async function open(page: import('@playwright/test').Page, slugs: string[]) {
    await collect(page, slugs);
    await openList(page);
  }

  test('a single line is shown as written, not converted', async ({ page }) => {
    await open(page, ['pickled-jalapenos', 'demi-glace']);

    // Volume, spoons: the reason this was noticed.
    await expect(
      page.locator('.shopping-item', { hasText: 'Sugar' }).first(),
    ).toContainText('2 tbsp');
    await expect(
      page.locator('.shopping-item', { hasText: 'Black pepper' }).first(),
    ).toContainText('1 tsp');
    // Volume, cups.
    await expect(
      page.locator('.shopping-item', { hasText: 'Mirepoix' }).first(),
    ).toContainText('2 cups');
    // Mass, imperial: these convert cleanly to grams, which is exactly why
    // they were being converted. A shop still sells them by the pound.
    await expect(
      page.locator('.shopping-item', { hasText: 'Tomato paste' }).first(),
    ).toContainText('6 oz');
    await expect(
      page.locator('.shopping-item', { hasText: 'Oxtail' }).first(),
    ).toContainText('1 lb');
  });

  test('no amount uses a unit its own recipes never wrote', async ({
    page,
  }) => {
    await open(page, ['pickled-jalapenos', 'demi-glace']);

    // The sweep rather than a handful of examples, because the failure was
    // systemic: every row went through the same lossy boundary.
    const strays = await page.evaluate(() => {
      const UNITS = /\b(g|kg|mg|oz|lb|lbs|ml|l|tsp|tbsp|cups?)\b/g;
      const bad: string[] = [];
      for (const item of document.querySelectorAll('.shopping-item')) {
        const amount =
          item.querySelector('.shopping-amount')?.textContent ?? '';
        const from = item.querySelector('.shopping-from')?.textContent ?? '';
        const name = item.querySelector('.shopping-what')?.textContent ?? '';
        for (const unit of amount.match(UNITS) ?? []) {
          const singular = unit.replace(/s$/, '');
          const written = new RegExp(`\\d\\s*${singular}s?\\b`, 'i');
          if (!written.test(from)) bad.push(`${name.trim()}: ${amount.trim()}`);
        }
      }
      return bad;
    });

    expect(strays).toEqual([]);
  });

  test('a count keeps its own noun and its plural', async ({ page }) => {
    await open(page, ['pickled-jalapenos', 'berlin-crayfish-boil']);

    // Cloves and heads are both `toBase: 1`, and adding them would give
    // "12 pieces" of something you cannot buy. They stay apart, and each
    // reads as English rather than "2 clove".
    const garlic = page
      .locator('.shopping-item', { hasText: 'Garlic' })
      .first();
    await expect(garlic).toContainText('2 cloves');
    await expect(garlic).toContainText('heads');
  });
});
