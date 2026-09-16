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

    const science = page.locator('[data-science]');
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
    await expect(page.locator('[data-science]')).toHaveCount(0);
  });

  test('a recipe with no science shows no empty section', async ({ page }) => {
    await page.goto('/recipes/pickled-jalapenos');
    await expect(page.locator('[data-science]')).toHaveCount(0);
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

    await page.locator('[data-checklist] input[type=checkbox]').first().check();
    await page.getByRole('tab', { name: 'Method' }).click();
    await page.getByRole('tab', { name: 'Ingredients' }).click();

    await expect(page.locator('[data-checklist] [data-ticked]')).toHaveCount(1);
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
    // THIS LINE USED TO READ `/cannot change a version/i`, and that sentence
    // is now false: `update_revision` exists. The prohibition became a
    // question, and the question is the part an agent has to answer before
    // it writes — both calls are valid, so nothing downstream can catch the
    // wrong pick.
    expect(guide.theOneRule).toMatch(/did the food change/i);
    expect(guide.theOneRule).toMatch(/update_revision/);
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

    // `[data-step-uses] > *` and not `.step-uses li`: M5 rebuilt the chip on
    // `F/Ingredient callout`, which is a two-celled hairline box rather than
    // a pill, and the `.step-uses` rules in `globals.css` drew the old 999px
    // shape. M7 deleted that file; the hook is still an attribute rather
    // than a class, because R-CMP-16 says a test selects on a `data-`
    // attribute and never on a style name.
    await expect(page.locator('[data-step-uses] > *').first()).toBeVisible();

    // Not just the name: the quantity, or the chip saves nobody a scroll.
    const chips = await page.locator('[data-step-uses] > *').allTextContents();
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
    const panel = (await page.locator('[data-checklist]').allInnerTexts())
      .join(' ')
      .toLowerCase();
    const names = await page
      .locator('[data-step-uses] [data-chip-name]')
      .allTextContents();
    for (const name of names) {
      expect(panel).toContain(name.trim().toLowerCase());
    }
  });

  test('the chips scale with the batch', async ({ page }) => {
    await page.goto('/recipes/baumy-biltong');

    const salt = page
      .locator('[data-step-uses] > *', { hasText: 'Salt' })
      .first();
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

    const box = page.locator('[data-batch-control] input');
    await expect(box).toHaveValue('50');
    await expect(page.locator('[data-batch-control]')).toHaveAttribute(
      'data-mode',
      'servings',
    );

    const salt = page
      .locator('[data-checklist] [role=listitem]', { hasText: 'Salt' })
      .first()
      .locator('> span:nth-of-type(2)');
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

    await expect(page.locator('[data-batch-control]')).toHaveAttribute(
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

    for (const name of ['Method', 'Science', 'Revisions']) {
      await page.getByRole('tab', { name }).click();
      // The 360 strip is sticky, and a sticky box reports where it is now,
      // not where it belongs. Measure from the top of the document.
      await page.evaluate(() => window.scrollTo(0, 0));

      const strip = await page.locator('[data-tab-strip]').boundingBox();
      const column = await page.locator('[data-recipe-column]').boundingBox();
      const aside = await page.locator('[data-recipe-aside]').boundingBox();
      const panel = await page
        .locator(`[data-tab="${name.toLowerCase()}"]`)
        .boundingBox();

      expect(panel).not.toBeNull();

      // R-ACC-13: the panel STARTS where the strip ENDS. `Main column` is
      // `gap-0` in the design, so this is an equality and not a tolerance —
      // the 30px of air above the method is padding INSIDE the panel box.
      // The old assertion allowed 120px, which let a stray 24px margin
      // through and would have let a 100px one through too.
      expect(panel!.y - (strip!.y + strip!.height)).toBeGreaterThanOrEqual(-1);
      expect(panel!.y - (strip!.y + strip!.height)).toBeLessThanOrEqual(1);

      // R-SCR-28, on the other axis: the strip and the panel are ONE
      // column. A panel a screen down and a panel in the wrong column are
      // the same fault seen from two directions, and only one of them was
      // ever measured.
      expect(Math.abs(panel!.x - strip!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(panel!.width - strip!.width)).toBeLessThanOrEqual(1);

      // And the cause, not only the effect: a tall aside must not push the
      // strip down. This is the 2185px fault stated as what went wrong.
      expect(Math.abs(strip!.y - column!.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(strip!.y - aside!.y)).toBeLessThanOrEqual(1);

      // The rule under the strip is a rule, not a box. R-ACC-13 measures
      // zero either way — a border is inside the border box — so nothing
      // above catches `border-b` beside a bare `border-solid`, which without
      // a universal border reset gives the other three sides the CSS initial
      // `medium` and draws a 3px `f-hair` rectangle around the whole rail.
      // The preflight's `* { border: 0 solid }` closes that since M7. The
      // measurement stays: it is what proves the reset is still in force.
      const rule = await page.locator('[data-tab-strip]').evaluate((el) => {
        const style = getComputedStyle(el);
        return [
          style.borderTopWidth,
          style.borderRightWidth,
          style.borderBottomWidth,
          style.borderLeftWidth,
        ];
      });
      expect(rule).toEqual(['0px', '0px', '1px', '0px']);
    }
  });

  test('a research recipe uses the whole width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/recipes/beef-wellington-technique');

    // No ingredients and no yield, so no aside — and without this the page
    // held a third of the screen open beside its only column of content.
    await expect(page.locator('[data-recipe-aside]')).toHaveCount(0);

    const method = await page.locator('[data-tab="method"]').boundingBox();
    const page_ = await page.locator('[data-recipe]').boundingBox();
    expect(method!.width).toBeGreaterThan(page_!.width * 0.9);
  });
});
