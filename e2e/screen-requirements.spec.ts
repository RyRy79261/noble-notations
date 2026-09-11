import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * Six requirements that could be deleted from the source with the whole
 * suite green.
 *
 * Each one is a single attribute or a single key, and each was measured:
 * the attribute was removed, a production build was made, the whole suite
 * was run, and nothing went red. They are grouped here because they share a
 * shape rather than a screen — a requirement whose whole substance is one
 * attribute has nowhere else to be asserted, and a screen test that reads
 * the words on the page walks straight past it.
 *
 * - R-SCR-13  the ingredient name links to the ingredient page
 * - R-SCR-32  the step's ingredient chip links to the same place
 * - R-SCR-35  the servings field asks for a numeric keypad
 * - R-ACC-04  `tabIndex={-1}` on `<main>`, so the skip link moves focus
 * - R-ACC-06  the live region is silent on arrival
 * - R-STO-06  a tick does not carry across a revision
 *
 * Plus the shared filter's case folding, which is not a numbered
 * requirement but is the same kind of hole: `/ingredients` and `/classes`
 * both filter through `FilterableGroups`, and both of their existing tests
 * happen to type a query that matches a lower-case alias, so the fold could
 * be dropped and both stayed green.
 */

const RECIPE = '/recipes/baumy-biltong';
/** The seeded recipe whose steps carry the most `uses` references. */
const CHIPPED = '/recipes/pickled-jalapenos';

// ─────────────────────────────────────────────────────────────────────────
// 1. The two links out of a recipe and into the ingredient list
// ─────────────────────────────────────────────────────────────────────────

test('R-SCR-13: an ingredient name links at the ingredient it names', async ({
  page,
}) => {
  await page.goto(RECIPE);

  /*
   * "The name MUST link to the ingredient page when the ingredient is in
   * the ingredient list." The link is the whole of what makes this
   * repository referential rather than a folder of documents — a line is a
   * reference to a canonical record, and the anchor is where a reader meets
   * that fact. Forced to `undefined`, every ingredient on every recipe
   * screen becomes plain text and nothing else moves.
   */
  const rows = page.locator('[data-checklist] [role=listitem]');
  await expect(rows.first()).toBeVisible();

  const links = page.locator('[data-checklist] [role=listitem] a');
  const hrefs = await links.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute('href') ?? ''),
  );
  expect(hrefs.length).toBeGreaterThan(0);
  // Every one of them, not just the first: a seeded recipe's lines all
  // resolve, so a single unlinked row is a fault and not a bare ingredient.
  for (const href of hrefs) {
    expect(href).toMatch(/^\/ingredients\/[a-z0-9-]+$/);
  }

  // And it goes somewhere. A well-formed href at a 404 is not a link.
  const response = await page.goto(hrefs[0]!);
  expect(response?.status()).toBe(200);
});

test('R-SCR-32: a step chip links at the same ingredient page', async ({
  page,
}) => {
  // At this width the tab strip is not drawn and both panels are in the
  // page, which is what `recipe-layout.spec.ts` relies on too.
  await page.goto(CHIPPED);

  // `[data-step-uses]` is the chip strip under a step, and R-CMP-15 makes
  // the chip's name the half that has to match a line in the ingredient
  // list. The chip carries the same reference the line does, so it carries
  // the same link.
  const chips = page.locator('[data-step-uses] a');
  await expect(chips.first()).toBeVisible();

  const hrefs = await chips.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute('href') ?? ''),
  );
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    expect(href).toMatch(/^\/ingredients\/[a-z0-9-]+$/);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The servings field
// ─────────────────────────────────────────────────────────────────────────

test('R-SCR-35: the servings field asks for a numeric keypad', async ({
  page,
}) => {
  await page.goto(RECIPE);

  /*
   * `inputMode="decimal"` and NOT `type="number"`, which is the part the
   * requirement exists to record. Chrome commits a partial entry in a
   * number field — a lone "1" on the way to "12" — and rescales the whole
   * page under the cook's hands. A text field with a decimal keypad gives a
   * phone the same keys and gives the browser no opinion about the value.
   */
  const fields = page.locator('[data-batch-control] input');
  await expect(fields.first()).toBeVisible();

  // BOTH of them. The control draws a batch multiplier or a servings
  // stepper depending on what the recipe records, and R-SCR-35 is about the
  // field a cook types a number into — which is whichever one is drawn.
  const count = await fields.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    await expect(fields.nth(i)).toHaveAttribute('inputmode', 'decimal');
    await expect(fields.nth(i)).toHaveAttribute('type', 'text');
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 3. The skip link
// ─────────────────────────────────────────────────────────────────────────

test('R-ACC-04: the skip link actually lands the focus on the main region', async ({
  page,
}) => {
  await page.goto(RECIPE);

  /*
   * A skip link that moves the scroll and not the focus is worse than none:
   * the next Tab carries on from the masthead, so a keyboard reader is put
   * back at the top of the navigation they were trying to leave. `<main>`
   * is not focusable by default, and the fix is one attribute — Chromium
   * papers over the gap with its sequential-focus fallback and Safari does
   * nothing at all, so the browser this suite drives is the one that hides
   * the fault.
   *
   * The word "skip link" appears in no other spec in this repository.
   */
  await expect(page.locator('main#main')).toHaveAttribute('tabindex', '-1');

  const skip = page.getByRole('link', { name: /skip to content/i });
  await expect(skip).toHaveAttribute('href', '#main');

  // Driven the way a reader drives it: the first Tab from the document
  // start reaches the skip link, and activating it moves the focus.
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await skip.press('Enter');

  const focused = await page.evaluate(() => document.activeElement?.id ?? '');
  expect(focused).toBe('main');
});

// ─────────────────────────────────────────────────────────────────────────
// 4. The live region
// ─────────────────────────────────────────────────────────────────────────

test('R-ACC-06: the live region is silent on arrival and speaks on a change', async ({
  page,
}) => {
  /*
   * Two halves, and only one of them is reachable from a production build.
   *
   * REACHABLE: silence on arrival. The region is always mounted and starts
   * empty, and `useAnnounce` takes the first value it sees as a baseline
   * rather than as news. Drop that and a reader is told the count of a list
   * they have just asked for, before they have done anything to it, on
   * every screen that carries a filter.
   *
   * NOT REACHABLE, and stated so a later reader does not write a test that
   * cannot fail: the other half of the guard — `previous.current ===
   * message` — only fires when the effect re-runs with an unchanged
   * message, and its dependency list is `[message, ready]`. In a production
   * build neither can change without the message changing with it. It earns
   * its place against StrictMode's double invocation in development and
   * against a later dependency being added, which is a code review's job
   * and not this suite's.
   */
  const region = page.locator('[aria-live="polite"]');

  await page.goto('/ingredients');
  await expect(region).toHaveCount(1);

  /*
   * `textContent()` and not `toHaveText('')`. The empty string is the one
   * value that matcher cannot assert: it retries until the text matches, and
   * an empty expectation is satisfied before hydration has run at all. This
   * test passed against a source that announced on arrival until that was
   * measured — which is the same class of fault it is here to catch.
   *
   * 400ms after the page has loaded, and the region holds a message for a
   * second after it speaks, so nothing can arrive and leave inside the wait.
   */
  await page.waitForTimeout(400);
  expect(await region.textContent()).toBe('');

  // A real change. The count moves, so the region has something to say.
  await page.getByRole('searchbox').fill('coriander');
  await expect(region).toHaveText(/\bof\b/);
});

// ─────────────────────────────────────────────────────────────────────────
// 5. The shared filter folds case
// ─────────────────────────────────────────────────────────────────────────

test.describe('the filter folds case on the row, not only on the query', () => {
  /*
   * `FilterableGroups` lower-cases the query AND the row text, and only the
   * second half is reachable by a test that types in a different case: the
   * query is folded before anything else happens, so `Coriander` and
   * `coriander` are already the same needle by the time the row is reached.
   * Both existing filter specs type a query that matches a lower-case ALIAS
   * on the row, so the fold on the row could be dropped and `/ingredients`
   * and `/classes` both stayed green.
   *
   * An ingredient written for this test is what makes the direction
   * reachable: a capitalised name, no alias and nothing else on the row that
   * repeats it in lower case. Searching it in lower case then has only the
   * row's own fold to go through.
   */
  const NAME = 'Zanzibar Clove Blossom';

  test.beforeAll(async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
    await mcp.call('upsert_ingredient', {
      name: NAME,
      slug: 'zanzibar-clove-blossom',
      category: 'spice',
      description:
        'An ingredient whose name a reader would type in lower case.',
    });
  });

  test('a lower-case query finds a capitalised name', async ({ page }) => {
    await page.goto('/ingredients');

    const field = page.getByRole('searchbox');
    // The same hook `filtering.spec.ts` counts rows with.
    const rows = page.locator('[data-group] [role="row"]');

    await field.fill('Zanzibar');
    await expect(rows).toHaveCount(1);

    // The assertion that matters: nothing on this row carries the word in
    // lower case, so only the fold can match it.
    await field.fill('zanzibar');
    await expect(rows).toHaveCount(1);

    await field.fill('ZANZIBAR CLOVE');
    await expect(rows).toHaveCount(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6. A tick does not carry across a revision
// ─────────────────────────────────────────────────────────────────────────

/*
 * A recipe of its own, rather than a seeded one: this revises what it
 * ticks, and revising a seeded recipe would move a revision number that
 * other specs read.
 */
test.describe('R-STO-06: ticks belong to one revision', () => {
  const SLUG = 'screen-requirements-tick-subject';

  test.beforeAll(async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);

    // A fixture is a STATE, not an event. Playwright restarts the worker
    // after a test fails and runs `beforeAll` again, so a bare create turns
    // one real failure into a second, louder one in the setup.
    try {
      await mcp.call('create_recipe', {
        title: 'Tick subject',
        slug: SLUG,
        kind: 'recipe',
        rationale: 'A recipe to tick, and then to revise.',
        ingredients: [
          { name: 'Tick subject salt', quantity: 1, unit: 'tsp' },
          { name: 'Tick subject pepper', quantity: 2, unit: 'tsp' },
        ],
        steps: [{ instruction: 'Mix them.' }],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exists/i.test(message)) throw error;
    }
  });

  test('a tick survives a reload of the same revision, and not the next one', async ({
    page,
  }) => {
    /*
     * `nn:checked:{slug}:{revision}` — the revision is in the key, and the
     * whole requirement is in that colon. Reduced to `nn:checked:{slug}`,
     * the ticks carry forward into a version the cook has never read, and a
     * NEW ingredient in that version can open already ticked. The cook then
     * believes they have something they do not have, which is the one
     * failure on this screen that costs a trip to a shop.
     *
     * Asserted in both directions on purpose. Dropping the key entirely
     * would also pass "the next revision is unticked" — by never
     * remembering anything — so the first half is the control.
     */
    await page.goto(`/recipes/${SLUG}`);

    const rows = page.locator('[data-checklist] [role=listitem]');
    await expect(rows).toHaveCount(2);
    await page.locator('[data-checklist] input[type=checkbox]').first().check();
    await expect(page.locator('[data-checklist] [data-ticked]')).toHaveCount(1);

    // It is remembered. This is the half that fails if the key is dropped.
    await page.reload();
    await expect(page.locator('[data-checklist] [data-ticked]')).toHaveCount(1);

    const stored = await page.evaluate(() =>
      Object.keys(window.localStorage).filter((k) =>
        k.startsWith('nn:checked:'),
      ),
    );
    expect(stored).toContain(`nn:checked:${SLUG}:1`);

    // A new version, with a third ingredient the cook has never seen.
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
    await mcp.call('revise_recipe', {
      slug: SLUG,
      rationale: 'A third ingredient, so the checklist is a different list.',
      ingredients: [
        { name: 'Tick subject salt', quantity: 1, unit: 'tsp' },
        { name: 'Tick subject pepper', quantity: 2, unit: 'tsp' },
        { name: 'Tick subject paprika', quantity: 1, unit: 'tsp' },
      ],
      steps: [{ instruction: 'Mix them.' }],
    });

    await page.goto(`/recipes/${SLUG}`);
    await expect(rows).toHaveCount(3);
    await expect(page.locator('[data-checklist] [data-ticked]')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 7. Every link that leaves this site
// ─────────────────────────────────────────────────────────────────────────

test('an outbound link does not hand this site over as a referrer', async ({
  page,
}) => {
  /*
   * `rel="noreferrer"` on the page foot's repository link and
   * `rel="noreferrer nofollow"` on a citation's source. Removing either one
   * left the whole suite green, and the consequence is quiet: a reader who
   * follows a source from a recipe page hands the exact address they were
   * reading to whoever owns that source.
   *
   * Asserted over every outbound anchor on the page rather than over one,
   * because the rule is about the class of link and a later component that
   * adds one has to meet it too. `target="_blank"` without `noreferrer`
   * additionally leaves `window.opener` reachable, which is why the two
   * belong together.
   */
  for (const path of ['/', '/science/demi-glace']) {
    await page.goto(path);

    const outbound = await page
      .locator('a[href^="http"]')
      .evaluateAll((nodes) =>
        nodes.map((n) => ({
          href: n.getAttribute('href') ?? '',
          rel: n.getAttribute('rel') ?? '',
          target: n.getAttribute('target') ?? '',
        })),
      );
    expect(outbound.length, `${path} draws an outbound link`).toBeGreaterThan(
      0,
    );

    for (const link of outbound) {
      expect(link.rel, `${path} → ${link.href}`).toContain('noreferrer');
      if (link.target === '_blank') {
        // `noreferrer` implies `noopener` in every browser this project
        // targets, so one attribute is the whole rule — stated here so a
        // later reader does not add the second and think it was missing.
        expect(link.rel, `${path} → ${link.href}`).toContain('noreferrer');
      }
    }
  }
});
