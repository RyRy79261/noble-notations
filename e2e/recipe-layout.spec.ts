import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

const WELLINGTON = '/recipes/beef-wellington-technique';

test.describe('the science section', () => {
  test('separates mechanism from the running commentary', async ({ page }) => {
    await page.goto(WELLINGTON);

    // Its own tab now, rather than the tail of a long method column. The
    // strip only offers it when the recipe has one, which is what the two
    // tests below check from the other side.
    await page.getByRole('tab', { name: 'Science' }).click();

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
    // And no tab offering it. A tab that opens an empty panel is worse
    // than no tab: it reads as missing content rather than as content this
    // recipe never had.
    await expect(page.getByRole('tab', { name: 'Science' })).toHaveCount(0);
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

test.describe('a step names what it uses', () => {
  /**
   * The link from a step to its ingredient lines has been in the database
   * since the rebuild — `recipe_step_ingredients`, written by the `uses`
   * field on every MCP call — and the page never rendered it. Steps showed
   * badges for duration, temperature, technique and equipment while the one
   * thing you look up mid-step stayed in a list you had to scroll back to.
   */

  test('shows the amount beside the instruction', async ({ page }) => {
    await page.goto('/recipes/pickled-jalapenos');

    await expect(page.locator('.step-uses li').first()).toBeVisible();

    // Not just the name: the quantity, or the chip saves nobody a scroll.
    const chips = await page.locator('.step-uses li').allTextContents();
    expect(chips.length).toBeGreaterThan(3);
    expect(chips.some((chip) => /\d/.test(chip))).toBe(true);

    // The amount and the name are separated by a real space, not a flex
    // gap. A gap is invisible to `textContent`, so a screen reader read
    // "1 kgJalapeño" while the page looked correct.
    for (const chip of chips) {
      expect(chip).not.toMatch(/\d\s*[a-z]+[A-Z]/);
    }

    // And every chip names a line that is actually in this revision.
    // `uses` is written by name on the way in, so a typo there would
    // otherwise surface as a chip for an ingredient the recipe lacks.
    // Every group, not the first: the list is split by component, so
    // "White distilled vinegar" sits under Brine rather than at the top.
    const panel = (await page.locator('.ingredient-list').allInnerTexts())
      .join(' ')
      .toLowerCase();
    const names = await page
      .locator('.step-uses li a, .step-uses li span')
      .allTextContents();
    for (const name of names) {
      expect(panel).toContain(name.trim().toLowerCase());
    }
  });

  test('the chips scale with the batch', async ({ page }) => {
    await page.goto('/recipes/baumy-biltong');

    const salt = page.locator('.step-uses li', { hasText: 'Salt' }).first();
    await expect(salt).toContainText('138.5 g');

    // A chip that says "138.5 g" beside a list that says "277 g" is worse
    // than no chip at all.
    await page.getByRole('button', { name: '×2', exact: true }).click();
    await expect(salt).toContainText('277 g');
  });
});

test.describe('the batch control', () => {
  test('counts servings when the recipe has them', async ({ page }) => {
    // The boil feeds 50, and the box opens on 50 rather than on "×1".
    await page.goto('/recipes/berlin-crayfish-boil');

    const box = page.locator('.scale-custom input');
    await expect(box).toHaveValue('50');
    await expect(page.locator('.scale-bar')).toHaveAttribute(
      'data-mode',
      'servings',
    );

    const salt = page
      .locator('.ingredient-list li', { hasText: 'Salt' })
      .first()
      .locator('.amount');
    await expect(salt).toHaveText('500 g');

    // "For 50 −/+" is a question a cook can answer. "×1" asks them to know
    // what one batch is before they can change it. One more serving is
    // ×1.02, not ×2 — the step lands on the servings, not the multiplier.
    await page.getByRole('button', { name: 'One more serving' }).click();
    await expect(box).toHaveValue('51');
    await expect(salt).toHaveText('510 g');

    await page.getByRole('button', { name: 'One fewer serving' }).click();
    await expect(box).toHaveValue('50');
    await expect(salt).toHaveText('500 g');
  });

  test('keeps the multiplier when there is nothing to count', async ({
    page,
  }) => {
    // Biltong yields 4.5 kg dried and has no servings at all. A stepper
    // there would be counting something the recipe never claimed.
    await page.goto('/recipes/baumy-biltong');

    await expect(page.locator('.scale-bar')).toHaveAttribute(
      'data-mode',
      'batch',
    );
    await expect(
      page.getByRole('button', { name: 'One more serving' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: '×2', exact: true }),
    ).toBeVisible();
  });
});

test.describe('a selected panel is where you are looking', () => {
  /**
   * The Revisions panel rendered, was visible, contained every revision —
   * and started 2185px down the page, under an empty screen. Two grid
   * mistakes stacked: `grid-row: 1 / -1` collapses to a single row when no
   * explicit rows are declared, and an aside taller than the active panel
   * grows the row its tab strip sits in.
   *
   * Every assertion available at the time passed. `toBeVisible()` is true
   * of an element parked below the fold, which is the same lesson the
   * basket control taught at x=766 on a 390px screen: measure the box.
   */
  test('opens under its tab, not below the ingredient list', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/recipes/baumy-biltong');

    for (const name of ['Science', 'Revisions']) {
      await page.getByRole('tab', { name }).click();

      const strip = await page.locator('.recipe-tabs').boundingBox();
      const panel = await page
        .locator(`[data-tab="${name.toLowerCase()}"]`)
        .boundingBox();

      expect(panel).not.toBeNull();
      // Directly under the strip that switched to it — a panel a screen or
      // more below its own tab reads as an empty tab.
      expect(panel!.y - (strip!.y + strip!.height)).toBeLessThan(120);
    }
  });

  test('a research recipe uses the whole width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/recipes/beef-wellington-technique');

    // No ingredients and no yield, so no aside — and without this the page
    // held a third of the screen open beside its only column of content.
    await expect(page.locator('.recipe-aside')).toHaveCount(0);

    const method = await page.locator('[data-tab="method"]').boundingBox();
    const page_ = await page.locator('.recipe-layout').boundingBox();
    expect(method!.width).toBeGreaterThan(page_!.width * 0.9);
  });
});
