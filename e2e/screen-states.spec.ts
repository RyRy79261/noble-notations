import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * The states a screen can be in that nothing drove.
 *
 * `scripts/audit-ui.ts` measures 22 addresses in 2 states, and both of those
 * states are "the page as it comes". The suite adds the happy path. What
 * neither reaches is the OTHER state of a screen that has more than one:
 * `/search` with nothing asked for and `/search` with nothing found (two of
 * §10.5's four), the superseded-revision notice (R-SCR-16, which rendered on
 * no page at all until `revisions/[number]/page.tsx` was repaired and which
 * still has no test), the address that does not exist, and the two filters
 * whose whole requirement is that they match something the reader cannot
 * see on the row.
 *
 * Each test below names the requirement it answers and, where the
 * requirement is a MUST about what a reader is shown, asserts the reader's
 * side of it rather than the status code.
 */

/* ── §10.5 — the four result states ─────────────────────────────────────── */

test.describe('search says which of its four states it is in', () => {
  /**
   * §10.5 draws four, and `audit-ui` drives one of them (`/search?q=biltong`).
   * `site.spec.ts` drives the same one. So the bare screen — the one a reader
   * arrives at from the navigation, every time — was rendered by nothing.
   *
   * The fourth state (no database) is in `screen-degraded.spec.ts`, because
   * it needs a server without one.
   */

  test('with nothing asked for it prompts, and offers everything', async ({
    page,
  }) => {
    await page.goto('/search');

    // The state, in the design's own words, and the way out of it.
    await expect(page.getByText(/fill in a field above/i)).toBeVisible();
    await expect(
      page.locator('main').getByRole('link', { name: /browse everything/i }),
    ).toHaveAttribute('href', '/recipes');

    // No results, and — the part that matters — no claim that there are
    // none. "Nothing matched" in answer to a question nobody asked is a
    // wrong answer, not an empty one.
    await expect(page.locator('main article')).toHaveCount(0);
    await expect(page.getByText(/nothing matched/i)).toHaveCount(0);
  });

  test('with nothing found it says so, and says how to widen the search', async ({
    page,
  }) => {
    // R-STA-04. The remedy is the point: an empty result must offer a way
    // out rather than leave a reader retyping the same query. The screen
    // used to spell out that the filters are ANDed; R-SCR-18 states that as
    // BEHAVIOUR, not as required copy, so the remedy is now carried by
    // "Each field makes the search narrower. Remove one and try again."
    await page.goto('/search?q=zzzzqqq');

    await expect(page.getByText(/nothing matched/i)).toBeVisible();
    await expect(page.getByText(/drop|remove/i).first()).toBeVisible();
    await expect(page.locator('main article')).toHaveCount(0);

    // And the sentence reports the finding in English. This is the
    // assertion that pins issue #21's grammar fix: the count used to be
    // rendered against a hardcoded plural, so exactly one filled field
    // produced "zero answer all one condition". It cannot come back.
    await expect(page.locator('main [data-search-summary]')).toHaveText(
      'No recipes mention “zzzzqqq”.',
    );
  });

  test('with matches it states the filters in words, not as a query string', async ({
    page,
  }) => {
    /*
     * R-SCR-18 — "the results heading MUST state the active filters in
     * words". Two filters, so a sentence that names one of them and drops
     * the other fails; and `cuisine=south-african` must reach the reader as
     * "South African", because the sentence is prose and a slug in the
     * middle of prose is the fault the page's own comment records.
     */
    await page.goto('/search?q=biltong&cuisine=south-african');

    /* The sentence, not the panel head above it. `Notice` renders its title
       as a sibling inside the same root, so a text regex here would have to
       dodge the title; `[data-search-summary]` wraps the sentence alone. */
    const summary = page.locator('main [data-search-summary]');
    await expect(summary).toBeVisible();

    const sentence = (await summary.textContent()) ?? '';
    expect(sentence).toContain('biltong');
    expect(sentence).toContain('South African');
    expect(sentence).not.toContain('south-african');

    /* And it reads as a sentence a person would write: the count is the
       subject and it agrees with its verb. `cardinal` returns bare digits
       above ninety-nine, hence the numeric alternative. */
    expect(sentence).toMatch(
      /^(No|One|[A-Z][a-z-]+|\d+) recipes? (mention|mentions|is|are) /,
    );
    expect(sentence.endsWith('.')).toBe(true);

    // And the cards are really there, so the sentence is not describing an
    // empty result.
    expect(await page.locator('main article').count()).toBeGreaterThan(0);
  });
});

test.describe('search reaches the halves that are not recipes', () => {
  /*
   * ISSUE #18. Search covered recipes and nothing else, so everything
   * recorded on a run or in a note was invisible to it. An agent wrote a
   * batch log, the reader searched the site for its exact slug, and the
   * screen answered "zero of six recipes" — accurate, and it left them
   * concluding the work had never been saved.
   *
   * The slug half is the sharp edge and is asserted first. A generated
   * tsvector weighted with the 'simple' configuration looks like the right
   * build and silently fails here: websearch_to_tsquery('english', …)
   * STEMS its input, so `biltong-batch-3` becomes a phrase query holding
   * `mix`-style stems that a 'simple' vector never carries. Both sides
   * stem or neither does; the ILIKE half is what makes a slug pasted out
   * of an MCP response find its record.
   */
  test('an exact batch-log slug finds the run', async ({ page }) => {
    await page.goto('/search?q=biltong-batch-3');

    const runs = page.locator('[data-search-runs]');
    await expect(runs).toBeVisible();
    await expect(runs.getByRole('link').first()).toBeVisible();

    // And the reader is told the other halves were looked at, which is the
    // fact whose absence produced the wrong conclusion in the report.
    await expect(page.locator('[data-search-elsewhere]')).toContainText(
      /batch log/i,
    );
  });

  test('a word in a note body finds the note and links to its record', async ({
    page,
  }) => {
    // "dry" is in the seeded archive's note bodies. The assertion is not
    // which note comes back but that the section exists, is populated, and
    // every row offers a way to the record the note hangs off — a hit with
    // nowhere to go is the same dead end as not finding it.
    await page.goto('/search?q=dry');

    const notes = page.locator('[data-search-notes]');
    await expect(notes).toBeVisible();
    expect(await notes.getByRole('link').count()).toBeGreaterThan(0);
  });

  test('recipes, runs and notes are counted apart', async ({ page }) => {
    await page.goto('/search?q=biltong');

    // Three sections, each with its own count. The recipe cards keep the
    // `article` element; the other two deliberately do not, so a count of
    // `main article` still means "recipes came back".
    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Batch logs' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();

    const articles = await page.locator('main article').count();
    const runRows = await page.locator('[data-search-runs] > li').count();
    expect(articles).toBeGreaterThan(0);
    expect(runRows).toBeGreaterThan(0);
  });

  test('with no free text the other two sections are not drawn', async ({
    page,
  }) => {
    // They are matched on the text alone. A cuisine filter cannot select a
    // note, so drawing an empty Notes section under one would report
    // "none" where the truthful answer is "not asked".
    await page.goto('/search?cuisine=south-african');

    await expect(page.locator('[data-search-runs]')).toHaveCount(0);
    await expect(page.locator('[data-search-notes]')).toHaveCount(0);
    await expect(page.locator('[data-search-elsewhere]')).toHaveCount(0);
  });
});

test.describe('the form works with no JavaScript', () => {
  // R-SCR-17 — "the form MUST be a plain GET form. It MUST work when the
  // browser has no JavaScript." The screen used to print that guarantee on
  // itself ("Submits with GET · Works without JavaScript") and nothing ever
  // checked it. Issue #21 deleted the caption — a cook has no use for the
  // HTTP method — so this block is now the whole record of R-SCR-17, which
  // is the right way round: the behaviour is asserted, not advertised.
  test.use({ javaScriptEnabled: false });

  test('a search submits, lands in the address bar and answers', async ({
    page,
  }) => {
    await page.goto('/search');

    await page.getByRole('searchbox').fill('biltong');
    await page.getByRole('button', { name: 'Search' }).click();

    // The whole state is in the query string — that is what makes a search
    // a link somebody can send.
    await expect(page).toHaveURL(/\/search\?.*q=biltong/);
    expect(await page.locator('main article').count()).toBeGreaterThan(0);
    await expect(
      page.getByRole('link', { name: /biltong/i }).first(),
    ).toBeVisible();
  });

  test('the recipe screen offers the shopping control in the served HTML', async ({
    page,
  }) => {
    /*
     * R-CMP-13. `AddToBasket` reads `localStorage`, and the first build
     * withheld it until it had mounted — so with scripting off the recipe
     * screen offered no way into the shopping flow at all, and `curl` found
     * no trace of the only entry point. The control's own comment records
     * it. This asserts the served document, with no script to repair it.
     */
    await page.goto('/recipes/baumy-biltong');

    await expect(
      page.getByRole('button', { name: /add to list/i }),
    ).toBeVisible();
  });
});

/* ── §10.2.1 — the add-to-list control ──────────────────────────────────── */

test('the add-to-list control is above the tabs, whichever tab is open', async ({
  page,
}) => {
  /*
   * R-SCR-03 and R-SCR-04, and the fault they were written for is exact:
   * the control was inside the Ingredients panel, a phone hides the panel
   * that is not active, and the control then measured 0 × 0 when the reader
   * selected Method — 2.9 screens down a page it was supposed to be at the
   * top of.
   *
   * NEITHER GATE CAN SEE THAT TODAY. `toBeVisible()` is false for a 0 × 0
   * box but nothing asserts it on this control, and `audit-ui`'s
   * `offscreen-control` check is horizontal only (`r.right > vw`,
   * `r.left < -1`) and skips anything unpainted — so a control hidden in an
   * inactive panel is passed over rather than reported.
   *
   * So this measures, at 360, with each tab in turn selected: a real box, no
   * `[data-tab]` ancestor, above the strip, and inside the first screen.
   */
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/recipes/baumy-biltong');

  const control = page.getByRole('button', { name: /add to list|in list/i });
  const strip = page.locator('[data-tab-strip]');

  const tabs = await page.getByRole('tab').allInnerTexts();
  expect(tabs.length).toBeGreaterThan(1);

  for (const tab of tabs) {
    await page.getByRole('tab', { name: tab }).click();

    const box = await control.boundingBox();
    expect(box, `${tab}: the control has no box`).not.toBeNull();
    expect(box!.width, `${tab}: width`).toBeGreaterThan(0);
    expect(box!.height, `${tab}: height`).toBeGreaterThan(0);

    // R-SCR-03's second sentence, as a fact about the tree rather than
    // about the geometry: a control inside a panel is one panel switch away
    // from being gone.
    expect(
      await control.evaluate((el) => Boolean(el.closest('[data-tab]'))),
      `${tab}: the control is inside a tab panel`,
    ).toBe(false);

    // Above the strip that switches the panels, not below it.
    const stripBox = await strip.boundingBox();
    expect(box!.y + box!.height, `${tab}: below the tab strip`).toBeLessThan(
      stripBox!.y,
    );

    // R-SCR-04: on the first screen of a phone, with nothing scrolled.
    expect(box!.y + box!.height, `${tab}: below the fold`).toBeLessThan(780);
  }
});

/* ── §10.3 — reading a superseded revision ──────────────────────────────── */

test.describe('an old revision says it is old', () => {
  /**
   * R-SCR-16 and R-STA-06. `mcp-lifecycle.spec.ts:262` opens two revision
   * pages and asserts each rationale is on it; nothing asserts the notice or
   * the link out of it. Delete the block and both gates stay green, and a
   * reader who follows a pasted revision link cooks a superseded version
   * with no warning.
   *
   * THE FIXTURE IS BUILT SO THE CURRENT REVISION IS NOT THE HIGHEST NUMBER.
   * That is the case the notice was got wrong on for the whole of the
   * build's life: `isHistorical` compared a number with itself, and the
   * repair reads which revision is CURRENT rather than assuming the last
   * one is. A backfill — a version that existed earlier and was written
   * down later — takes the next number and does not become current, so
   * three revisions where the middle one is live is the shape that tells a
   * comparison-by-number apart from a correct one.
   */
  const SLUG = 'revision-notice-braise';

  let current = 0;
  let backfilled = 0;

  test.beforeAll(async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
    const ingredients = [{ name: 'Salt', quantity: 10, unit: 'g' }];

    interface RecipeResult {
      revisionNumber: number;
      revisions: { revisionNumber: number }[];
    }

    try {
      await mcp.call('create_recipe', {
        slug: SLUG,
        title: 'Revision notice braise',
        kind: 'recipe',
        rationale: 'The first version.',
        ingredients,
        steps: [{ instruction: 'Braise it.' }],
      });
      await mcp.call('revise_recipe', {
        slug: SLUG,
        rationale: 'The second version.',
        ingredients: [{ name: 'Salt', quantity: 12, unit: 'g' }],
      });
      await mcp.call('backfill_revision', {
        slug: SLUG,
        occurredAt: '2018-03-04',
        rationale:
          'An older version, found in a notebook and written down now.',
        ingredients: [{ name: 'Salt', quantity: 8, unit: 'g' }],
        steps: [{ instruction: 'Braise it, the old way.' }],
      });
    } catch (error) {
      // Left behind by an earlier attempt in this run; the numbers are read
      // back below either way.
      if (!/already exists/i.test(String(error))) throw error;
    }

    const recipe = await mcp.call<RecipeResult>('get_recipe', { slug: SLUG });
    current = recipe.revisionNumber;
    backfilled = Math.max(...recipe.revisions.map((r) => r.revisionNumber));

    // The fixture's own precondition. Without it the test below would still
    // pass on a build that assumed the highest number is the current one.
    expect(backfilled).toBeGreaterThan(current);
  });

  test('the notice names the current revision and links to it', async ({
    page,
  }) => {
    await page.goto(`/recipes/${SLUG}/revisions/1`);

    /* The notice by its own head, which is what makes it a notice rather
       than a sentence somewhere on the page. */
    const notice = page
      .locator('main')
      .getByText(/^You are reading revision \d+ of \d+$/);
    await expect(notice).toBeVisible();

    // The number it names is the CURRENT one — not the highest, and not the
    // one being read.
    await expect(
      page.locator('main').getByText(`Revision ${current} is current`),
    ).toBeVisible();

    // R-SCR-16's "MUST link": the way out, and it works.
    await page
      .locator('main')
      .getByRole('link', { name: /current revision/i })
      .click();
    await expect(page).toHaveURL(new RegExp(`/recipes/${SLUG}$`));
  });

  test('the backfilled revision is old too, despite its later number', async ({
    page,
  }) => {
    // The sharp case: revision 3 was written down after revision 2 and is
    // still not what a reader should cook. A notice derived from "is this
    // the last number" is absent here, which is the whole fault.
    await page.goto(`/recipes/${SLUG}/revisions/${backfilled}`);

    await expect(
      page.locator('main').getByText(`Revision ${current} is current`),
    ).toBeVisible();
  });

  test('the current revision carries no notice, at either of its addresses', async ({
    page,
  }) => {
    // The other half. A notice that is drawn unconditionally satisfies every
    // assertion above and tells every reader of every recipe that they are
    // reading the wrong one.
    for (const address of [
      `/recipes/${SLUG}`,
      `/recipes/${SLUG}/revisions/${current}`,
    ]) {
      await page.goto(address);
      await expect(
        page.locator('main').getByText(/^You are reading revision \d+ of \d+$/),
      ).toHaveCount(0);
      await expect(
        page.locator('main').getByText(/Revision \d+ is current/),
      ).toHaveCount(0);
      // …on a page that really did render, so the absence means something.
      await expect(
        page.getByRole('heading', { name: 'Revision notice braise' }),
      ).toBeVisible();
    }
  });
});

/* ── §10.7 and §10.8 — the two filter haystacks ─────────────────────────── */

test('the ingredient filter matches a name the row does not show', async ({
  page,
}) => {
  /*
   * R-SCR-22 — "the filter MUST match an alias. The word 'cilantro' must
   * find coriander." `filtering.spec.ts` queries `coriander` on this screen,
   * which matches the NAME; delete `...ingredient.aliases` from the haystack
   * at `ingredients/page.tsx:99` and that test still passes.
   *
   * The requirement's own example is used, because the point is a reader who
   * knows the ingredient by a word this page never prints.
   */
  await page.goto('/ingredients');

  const rows = page.locator('[data-group] [role="row"]');
  const before = await rows.count();
  expect(before).toBeGreaterThan(1);

  await page.getByRole('searchbox').fill('cilantro');

  await expect(rows).not.toHaveCount(before);
  expect(await rows.count()).toBeGreaterThan(0);
  // The row that answers is named "Coriander leaf" — the word typed is
  // nowhere in its name, so only the alias can have matched it.
  await expect(
    page.locator('[data-group]').getByText('Coriander leaf').first(),
  ).toBeVisible();
});

test('the class filter matches the explanation, not only the label', async ({
  page,
}) => {
  /*
   * R-SCR-24 — "the filter MUST match the term explanation. The word
   * 'numbing' must find Sichuan." The archive holds no Sichuan tag, so the
   * same shape is driven through the tag that does carry a distinctive word
   * in its explanation and not in its label: "nixtamalised" appears in one
   * description in the whole repository and in no label at all.
   *
   * `filtering.spec.ts` queries `curing`, which matches the labels "Curing"
   * and "Dry-curing"; drop `term.description` from the haystack at
   * `classes/page.tsx:257` and that test still passes.
   */
  await page.goto('/classes');

  const tags = page.locator('[data-tag]');
  const before = await tags.count();
  expect(before).toBeGreaterThan(1);

  await page.getByRole('searchbox').fill('nixtamalised');

  expect(await tags.count()).toBeGreaterThan(0);
  expect(await tags.count()).toBeLessThan(before);
  await expect(page.locator('[data-tag]', { hasText: 'Mexican' })).toHaveCount(
    1,
  );
});

/* ── §10.10 — an address that is not there ──────────────────────────────── */

test('a slug that does not exist is refused, not half-drawn', async ({
  request,
}) => {
  /*
   * R-STA-05 says almost every field can be empty; it does not say a RECORD
   * can be. Each of these routes reads one row and calls `notFound()` when
   * there is none, and the failure this guards is the quiet one: a page that
   * renders anyway, with a heading made from the slug and nothing under it,
   * answers 200 and looks like a recipe nobody has finished writing.
   *
   * A 404 is asserted on every detail route at once, because the query layer
   * is shared: one read returning an empty row rather than null would take
   * the whole set with it.
   *
   * WHAT THIS DELIBERATELY DOES NOT ASSERT, AND WHY. BUILD-PLAN §6.3 records
   * that a `notFound()` from a MATCHED route currently serves an empty body
   * — the designed 404 is drawn only for an address no route matches, which
   * `screen-degraded.spec.ts` covers. Asserting the shell here would encode
   * a bug as an expectation or fail the suite over a defect this file does
   * not own. §6.3 asks for an `<h1>` assertion once it is repaired; that
   * line belongs with the repair.
   */
  const missing = [
    '/recipes/no-such-recipe',
    '/recipes/baumy-biltong/revisions/99',
    '/ingredients/no-such-ingredient',
    '/science/no-such-note',
    '/cuisines/no-such-cuisine',
    '/classes/technique/no-such-tag',
    '/classes/no-such-type/air-drying',
    '/batch-logs/no-such-run',
    '/recipes/baumy-biltong/batch-logs/no-such-run',
    '/archive/no-such-note',
  ];

  for (const address of missing) {
    const response = await request.get(address, { maxRedirects: 0 });
    expect(response.status(), `${address} must not answer`).toBe(404);
  }

  // And the same routes with a real slug do answer, so the loop above
  // cannot be passing because the routes are broken.
  for (const address of [
    '/recipes/baumy-biltong',
    '/ingredients/salt',
    '/classes/technique/air-drying',
    '/archive/biltong/batch-03',
  ]) {
    expect((await request.get(address)).status(), address).toBe(200);
  }
});
