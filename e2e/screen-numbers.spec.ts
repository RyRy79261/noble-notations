import { test, expect, type Locator } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * The numbers on the screens.
 *
 * A wrong number is the worst bug this project has shipped, and it is the
 * one class the suite was weakest on: `get_repository_stats` was asserted
 * with `resolves.toBeTruthy()`, the shopping sums were asserted on the MCP
 * payload and never on the row a person shops from, the batch ledger's yield
 * was asserted nowhere at all, and R-SCR-06 — "the times MUST NOT scale" —
 * had no test on any screen. Every figure below is COMPUTED from the record
 * rather than stored beside it, which is what makes each one able to be
 * quietly wrong while the page still looks finished.
 *
 * HOW THESE ARE WRITTEN. Two shapes, and neither of them transcribes a
 * number the code also computes:
 *
 *  - A DELTA. Write one row through the connector and assert which figure
 *    moved. A ledger wired to the wrong query, or a label put over the wrong
 *    count, cannot survive it, and the assertion does not care what the seed
 *    holds.
 *  - AN IDENTITY between two things the same screen draws. The total in the
 *    filter bar against the cards under it; the yield against the raw and
 *    the finished weight it is derived from. A screen that disagrees with
 *    itself is wrong however the seed changes.
 *
 * The exception is the pair of fixture recipes, which exist so R-SCR-19's
 * own worked example — "800 g and 1 kg become 1.8 kg" — can be driven end to
 * end. Those numbers are the requirement's, so they are written down.
 */

/* ── Fixtures ───────────────────────────────────────────────────────────── */

/**
 * Two recipes built for the arithmetic on `/list` and nothing else.
 *
 * They are written through the real write layer, the way
 * `e2e/render.spec.ts` writes the run it needs, because `buildShoppingList`
 * combines the CURRENT revisions of real recipes and there is no other door
 * into it. The archive has no pair of recipes that share an ingredient in
 * two convertible units, one that shares a count unit that must NOT convert,
 * or a line with no quantity at all — so the three cases R-SCR-19 and
 * R-SCR-20 name could not be reached from the seed.
 *
 * A fixed slug, and a create that tolerates its own conflict: a re-run
 * against the same database (a Playwright retry) then reuses the recipe
 * rather than failing on it.
 */
const FIRST = 'sum-check-brine';
const SECOND = 'sum-check-rub';
/** Deliberately not a word any other spec filters on. */
const FLOUR = 'Sum-check flour';
const GARLIC = 'Sum-check garlic';
const PEPPER = 'Sum-check pepper';

test.beforeAll(async () => {
  const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);

  const recipes = [
    {
      slug: FIRST,
      title: 'Sum check brine',
      ingredients: [
        // R-SCR-19's own example, split across the two recipes.
        { name: FLOUR, quantity: 800, unit: 'g' },
        // A count unit. Three cloves plus two heads are not five of
        // anything, so this pair must stay apart.
        { name: GARLIC, quantity: 2, unit: 'clove' },
      ],
    },
    {
      slug: SECOND,
      title: 'Sum check rub',
      ingredients: [
        { name: FLOUR, quantity: 1, unit: 'kg' },
        { name: GARLIC, quantity: 10, unit: 'head' },
        // R-SCR-20: no quantity and no unit at all.
        { name: PEPPER },
      ],
    },
  ];

  for (const recipe of recipes) {
    try {
      await mcp.call('create_recipe', {
        ...recipe,
        kind: 'recipe',
        rationale:
          'A fixture for the shopping arithmetic: two convertible amounts, ' +
          'two count units that must not convert, and one line with no ' +
          'quantity.',
        steps: [{ instruction: 'Combine.' }],
      });
    } catch (error) {
      // Already there from an earlier attempt in this run. The fixture is
      // deterministic, so the stored one is the same one.
      if (!/already exists/i.test(String(error))) throw error;
    }
  }
});

/* ── Reading a ledger off a screen ──────────────────────────────────────── */

/**
 * Every `F/Stat` inside `scope`, as label → value.
 *
 * `f/stat.tsx` draws a label span over a value span with no hook of its own,
 * so the shape is the selector: a box whose element children are exactly two
 * spans. Scoped by the caller to one band, so nothing else on the page can
 * answer.
 */
async function figures(scope: Locator): Promise<Record<string, string>> {
  return scope.evaluate((root) => {
    const out: Record<string, string> = {};
    for (const box of root.querySelectorAll('div')) {
      const spans = [...box.children].filter((el) => el.tagName === 'SPAN');
      if (spans.length !== 2) continue;
      const label = (spans[0]?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const value = (spans[1]?.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (label && value) out[label] = value;
    }
    return out;
  });
}

/** The six figures of §10.1 block 2, read off the home page. */
async function homeLedger(
  page: import('@playwright/test').Page,
): Promise<Record<string, number>> {
  await page.goto('/');
  const band = page
    .getByRole('heading', { name: 'Contents', level: 2 })
    .locator('xpath=ancestor::section[1]');
  const read = await figures(band);

  const counts: Record<string, number> = {};
  for (const [label, value] of Object.entries(read)) {
    // Every one of the six is a bare count. A label that started carrying a
    // word instead would come back as NaN and fail the comparison below,
    // which is the right answer rather than a silent zero.
    counts[label] = Number(value);
  }
  return counts;
}

/** Which figures moved, and by how much. Unmoved figures are not listed. */
function moved(
  before: Record<string, number>,
  after: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const label of new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ])) {
    const delta = (after[label] ?? 0) - (before[label] ?? 0);
    if (delta !== 0) out[label] = delta;
  }
  return out;
}

/* ── §10.1 block 2 — the six measures ───────────────────────────────────── */

test('each figure in the home ledger counts the thing its label names', async ({
  page,
}) => {
  /*
   * `getStats()` is six independent `COUNT(*)`s printed under six labels,
   * and `mcp-lifecycle.spec.ts:67` asserts only that the tool answers
   * something. Every one of the six could be counting the wrong table and
   * the suite would stay green — a home page that reports 43 ingredients as
   * 43 recipes is a lie a reader has no way to check.
   *
   * So each write below is chosen to move exactly ONE figure, and the whole
   * ledger is read back after it. A swapped pair, a duplicated query, a
   * label over the wrong count: all three show up as a delta in the wrong
   * place. Six writes, six deltas, one screen.
   */
  const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
  const stamp = Date.now().toString(36);

  const start = await homeLedger(page);
  expect(Object.keys(start).sort(), 'the six measures §10.1 names').toEqual([
    'Batch logs',
    'Ingredients',
    'Notes',
    'Recipes',
    'Revisions',
    'Tags',
  ]);
  // A ledger of zeroes would make every delta below pass against an empty
  // repository, which is the one state these assertions must not accept.
  expect(start.Recipes).toBeGreaterThan(0);

  await mcp.call('upsert_ingredient', {
    name: `Ledger check ${stamp}`,
    category: 'spice',
    description: 'Written by the home-ledger test, to move one figure.',
  });
  expect(moved(start, await homeLedger(page))).toEqual({ Ingredients: 1 });

  const afterIngredient = await homeLedger(page);
  await mcp.call('upsert_category', {
    categoryType: 'technique',
    label: `Ledger check ${stamp}`,
    description: 'Written by the home-ledger test, to move one figure.',
  });
  expect(moved(afterIngredient, await homeLedger(page))).toEqual({ Tags: 1 });

  const afterTag = await homeLedger(page);
  const slug = `ledger-check-${stamp}`;
  await mcp.call('create_recipe', {
    slug,
    title: `Ledger check ${stamp}`,
    kind: 'recipe',
    rationale: 'The first version.',
    // An ingredient that already exists, and no categories: a new recipe
    // must move the recipe count and the revision count and nothing else.
    ingredients: [{ name: `Ledger check ${stamp}`, quantity: 1, unit: 'g' }],
    steps: [{ instruction: 'Wait.' }],
  });
  expect(moved(afterTag, await homeLedger(page))).toEqual({
    Recipes: 1,
    Revisions: 1,
  });

  const afterRecipe = await homeLedger(page);
  await mcp.call('revise_recipe', {
    slug,
    rationale: 'A second version, to move the revision count on its own.',
    ingredients: [{ name: `Ledger check ${stamp}`, quantity: 2, unit: 'g' }],
  });
  expect(moved(afterRecipe, await homeLedger(page))).toEqual({ Revisions: 1 });

  const afterRevision = await homeLedger(page);
  await mcp.call('add_note', {
    kind: 'observation',
    recipeSlug: slug,
    body: 'Written by the home-ledger test, to move one figure.',
  });
  expect(moved(afterRevision, await homeLedger(page))).toEqual({ Notes: 1 });

  const afterNote = await homeLedger(page);
  await mcp.call('log_experiment', {
    slug: `ledger-check-run-${stamp}`,
    title: `Ledger check run ${stamp}`,
    // Linked, on purpose: `render.spec.ts` counts the runs that name no
    // recipe, and an unlinked fixture here would move that figure too.
    recipeSlug: slug,
    startedAt: '2026-09-10',
    summary: 'Written by the home-ledger test, to move one figure.',
  });
  expect(moved(afterNote, await homeLedger(page))).toEqual({ 'Batch logs': 1 });
});

/* ── §10.4 — the total on /recipes ──────────────────────────────────────── */

test('/recipes states a total that matches the cards it draws', async ({
  page,
}) => {
  /*
   * Two figures drawn from two different expressions — `matching.length` and
   * `data.length` in the filter bar, and the cards themselves — so a total
   * that counted revisions, or counted before the kind split, disagrees with
   * the page it is printed on. R-STA-04's filtered case is asserted with it,
   * because that is where the two expressions differ.
   */
  await page.goto('/recipes');

  const cards = page.locator('main article');
  const count = page.locator('main form').getByText(/^\d+ of \d+$/);

  /* `textContent` and never `innerText`: `uppercase` on this readout belongs
     to the component, so `innerText` hands back "5 OF 5" and the split finds
     no separator. The same rule `render.spec.ts` states for the mass flow. */
  const read = async (): Promise<{ shown: number; total: number }> => {
    const text = await count.evaluate((el) => el.textContent ?? '');
    expect(text, 'the readout is "<shown> of <total>"').toMatch(/^\d+ of \d+$/);
    const [shown, total] = text
      .split(' of ')
      .map((part) => Number(part.trim()));
    return { shown: shown ?? NaN, total: total ?? NaN };
  };

  const all = await read();

  expect(all.total).toBeGreaterThan(0);
  expect(all.shown).toBe(all.total);
  await expect(cards).toHaveCount(all.total);

  // Filtered: the left-hand figure follows the cards, the right-hand one
  // does not move. A filter that narrowed the cards and not the count, or
  // the other way round, is the fault.
  await page.goto('/recipes?q=biltong');
  const filtered = await read();

  expect(filtered.total).toBe(all.total);
  expect(filtered.shown).toBeLessThan(all.total);
  expect(filtered.shown).toBeGreaterThan(0);
  await expect(cards).toHaveCount(filtered.shown);
});

/* ── §10.2.3 — what scales and what does not ────────────────────────────── */

test('the batch scales the yield and leaves the times alone', async ({
  page,
}) => {
  /*
   * R-SCR-05 and R-SCR-06 as one assertion, because either half alone is
   * satisfiable by a mistake: a screen that scales nothing passes "the times
   * did not move", and a screen that scales everything passes "the yield
   * did". `pickled-jalapenos` is the one recipe in the archive that carries
   * a yield AND both times, so it is the only place the pair can be seen.
   *
   * Doubling an hour of curing does not make it two hours. A reader who
   * doubles a batch and is told to wait twice as long has been handed a
   * wrong number by a screen that looks right.
   */
  await page.goto('/recipes/pickled-jalapenos');

  const glance = page.locator('[data-glance]');
  const before = await figures(glance);

  expect(before.Yield).toBe('500 g');
  expect(before['Total time']).toBe('1 d');
  expect(before['Active time']).toBe('30 min');

  await page.getByRole('button', { name: '×2', exact: true }).click();
  /* `1000 g` and not `1 kg`: a scaled amount keeps the unit the recipe
     wrote, which `shopping-journey.spec.ts` fixes for the ingredient rows
     and which the yield follows. The figure is what is under test here. */
  await expect(page.locator('[data-stat=yield]')).toContainText('1000 g');

  const after = await figures(glance);
  expect(after.Yield).not.toBe(before.Yield);
  expect(after['Total time']).toBe(before['Total time']);
  expect(after['Active time']).toBe(before['Active time']);
});

test('the scale stops at a tenth of a batch', async ({ page }) => {
  /*
   * R-SCR-36 — "the scale range MUST be 0.1 to 100".
   * `shopping-journey.spec.ts:214` tests the ceiling. The floor is the half
   * that produces a WRONG NUMBER rather than a refusal: below it the
   * amounts keep shrinking, and at zero or below every row on the page
   * reads `0 kg` or a negative weight, printed as calmly as any other
   * figure. `scale.tsx:135` deliberately clamps the floor on blur and not
   * on each keystroke, so that is where this looks.
   */
  await page.goto('/recipes/baumy-biltong');

  const box = page.locator('[data-batch-control] input');
  const beef = page
    .locator('[data-checklist] [role=listitem]', { hasText: 'Beef silverside' })
    .first()
    .locator('> span:nth-of-type(2)');

  const type = async (text: string) => {
    await box.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type(text);
    await box.blur();
  };

  // Under the floor: clamped up to a tenth, not obeyed.
  await type('0.05');
  await expect(box).toHaveValue('0.1');
  await expect(beef).toHaveText('1 kg');

  // Zero and a negative are not scales at all. The box keeps the last real
  // one, and no amount on the page is ever drawn as nothing or as less than
  // nothing.
  for (const refused of ['0', '-5']) {
    await type(refused);
    await expect(box).toHaveValue('0.1');
    await expect(beef).toHaveText('1 kg');
  }
});

/* ── §10.8 — the batch ledger ───────────────────────────────────────────── */

test('the batch ledger derives its yield from the weights beside it', async ({
  page,
}) => {
  /*
   * `batch-log-detail.tsx:431` computes the yield as finished over raw, and
   * `:449` computes the cost per kilogram from the same finished weight.
   * Neither is stored and neither is asserted anywhere: a numerator and a
   * denominator the wrong way round gives 232.5% where 43.1% belongs, and a
   * per-kilogram cost taken against the RAW weight understates what a batch
   * cost by more than half. Both are the kind of number a reader would
   * repeat.
   *
   * The identity is asserted against the two figures the same band draws, so
   * it holds whatever the archive is re-seeded with. The tolerance is there
   * because the band rounds to two decimals of a kilogram and the yield is
   * computed from the grams underneath.
   */
  await page.goto('/recipes/baumy-biltong/batch-logs/biltong-batch-2');

  const band = page
    .locator('main div')
    .filter({ has: page.getByText('Raw', { exact: true }) })
    .filter({ has: page.getByText('Yield', { exact: true }) })
    .last();

  const read = await figures(band);

  // Transcribed from the archive, the way `render.spec.ts` transcribes the
  // mass flow: batch two is the one run that was weighed in and out.
  expect(read.Raw).toBe('6.16 kg');
  expect(read.Finished).toBe('2.65 kg');
  expect(read.Yield).toBe('43.1%');
  expect(read.Pieces).toBe('15');

  const kg = (value: string) => Number(value.replace(/[^\d.]/g, ''));
  const yieldShown = Number(read.Yield!.replace('%', ''));

  expect(yieldShown).toBeCloseTo((kg(read.Finished!) / kg(read.Raw!)) * 100, 0);
  // And the direction, stated on its own: less came out than went in.
  expect(yieldShown).toBeLessThan(100);

  const perKg = kg(read['Per kg finished']!);
  expect(perKg).toBeCloseTo(kg(read.Cost!) / kg(read.Finished!), 0);
  // Against the RAW weight it would be 30.09, which is the fault this
  // guards: a cost per kilogram must be per kilogram of what came out.
  expect(perKg).toBeGreaterThan(kg(read.Cost!) / kg(read.Raw!));
});

/* ── §10.6 — the shopping arithmetic, on the row a person shops from ────── */

test.describe('the combined list adds up', () => {
  const BOTH = `/list?r=${FIRST}&r=${SECOND}`;

  /** One row of the checklist, by the ingredient it is for. */
  function row(page: import('@playwright/test').Page, name: string): Locator {
    return page.locator('[data-shopping-item]', { hasText: name }).first();
  }

  /**
   * The row as it reads. `textContent` rather than `innerText`, so the
   * assertion is about the stored words and not about the case the
   * stylesheet draws them in.
   */
  async function rowText(locator: Locator): Promise<string> {
    return locator.evaluate((el) =>
      (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  }

  test('two amounts become one only when the units convert', async ({
    page,
  }) => {
    /*
     * R-SCR-19, driven to the screen. `list.spec.ts:59` asserts the summed
     * entry exists in the MCP payload and that it credits at least one
     * recipe; it never reads the amount, so a sum that dropped a recipe's
     * contribution, or added across a bucket boundary, passes it.
     *
     * The two halves are asserted together on purpose. A build that summed
     * everything gets the flour right and the garlic wrong; a build that
     * summed nothing gets the garlic right and the flour wrong. Only the
     * pair says the rule is the rule.
     *
     * Each row is read as its own text, from the start: `F/List row` draws
     * the amount first and the name after it, so a row that OPENS with the
     * combined amount is the assertion, and the original wording each recipe
     * used — which R-SCR-21 requires further down the same row — cannot
     * satisfy it by accident.
     */
    await page.goto(BOTH);

    // 800 g and 1 kg become 1.8 kg — the requirement's own worked example.
    const flour = row(page, FLOUR);
    await expect(flour).toBeVisible();
    expect(await rowText(flour)).toMatch(/^1\.8 kg /);
    // One row, not two.
    await expect(
      page.locator('[data-shopping-item]', { hasText: FLOUR }),
    ).toHaveCount(1);

    // Two cloves and ten heads are not twelve of anything: kept apart, on
    // one row, as the amount and an extra beside it.
    //
    // EITHER ORDER. Which of the two buckets is drawn first follows the
    // order the recipes come back in, and `buildShoppingList` does not order
    // them — measured: the same two slugs gave "2 cloves + 10 heads" on one
    // run and "10 heads + 2 cloves" on the next. The requirement is that the
    // two amounts stay apart, so that is what is asserted; pinning the order
    // would pin something nothing guarantees.
    const garlicText = await rowText(row(page, GARLIC));
    expect(garlicText).toMatch(/^(2 cloves \+ 10 heads|10 heads \+ 2 cloves) /);
    expect(garlicText).not.toMatch(/\b12\b/);
  });

  test('a line with no quantity reads "some"', async ({ page }) => {
    // R-SCR-20. The alternative a shopping list must never take is guessing
    // a number for a line the recipe never gave one for.
    await page.goto(BOTH);

    const pepper = row(page, PEPPER);
    await expect(pepper).toBeVisible();
    const text = await rowText(pepper);
    expect(text).toMatch(/^some /);
    // No invented figure beside it, and no unit either — there is nothing
    // for a unit to qualify.
    expect(text).not.toMatch(/\d+(\.\d+)?\s*(g|kg|ml)\b/);
  });

  test('every row names the recipes that asked for it, with their words', async ({
    page,
  }) => {
    // R-SCR-21, the half that makes a combined row auditable: which recipe
    // wanted this, and what it actually said. A sum with no provenance is a
    // number a cook cannot check.
    await page.goto(BOTH);

    const flour = row(page, FLOUR);
    for (const slug of [FIRST, SECOND]) {
      await expect(flour.locator(`a[href="/recipes/${slug}"]`)).toHaveCount(1);
    }
    const text = await rowText(flour);
    expect(text).toContain('800 g');
    expect(text).toContain('1 kg');
  });

  test('the hero counts the rows and the recipes it was given', async ({
    page,
  }) => {
    // The two counts §10.6 puts in the hero, against the two things they
    // count. Both are computed, and neither is checked anywhere else.
    await page.goto(BOTH);

    const rows = await page.locator('[data-shopping-item]').count();
    const named = await page.locator('[data-list-recipes] li').count();

    expect(named).toBe(2);
    expect(rows).toBeGreaterThan(0);
    await expect(page.locator('main')).toContainText(`${rows} ingredients`);
    await expect(page.locator('main')).toContainText('2 recipes');
  });
});
