import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * The render tests — BUILD-PLAN §4.1's one open test item.
 *
 * The gap this file closes, in §4.1's own words: "M5.5 added 4 tests, and
 * all of them cover the write layer and the read layer. Nothing asserts that
 * `F/Mass flow` appears on `/recipes/baumy-biltong`, or that a conditions
 * row appears on `/science`. Delete the block in
 * `src/components/recipe-detail.tsx` and all 144 tests still pass."
 *
 * That is a whole class of test the suite did not have. `mcp-contract.spec.ts`
 * asserts `revision.massFlow` comes back over the wire; `science.spec.ts`
 * asserts a mechanism carries the right code. Neither one fails if the
 * component that draws the thing is deleted from the page, because a payload
 * and a query are not a screen. Every test below is written so that removing
 * the block it covers turns it red — that is the acceptance criterion for the
 * file, and each test names the block it guards.
 *
 * FOUR BLOCKS, FOUR REQUIREMENTS:
 *
 * | Block                                    | Drawn by                        | Requirement       |
 * | ---------------------------------------- | ------------------------------- | ----------------- |
 * | `FIG. 1 — MASS FLOW` on the recipe        | `recipe-detail.tsx:669`         | R-SCR-39, D-12    |
 * | The conditions run under a mechanism      | `f/mechanism.tsx:122`           | R-SCR-41, R-CMP-14|
 * | The `SOURCE` cell on a run with no recipe | `batch-log-parts.tsx:293`       | R-SCR-44, K-01    |
 * | `LITERATURE` on the recipe                | `recipe-detail.tsx:941`         | R-SCR-38          |
 *
 * WHY THE ABSENCES ARE TESTED TOO. Three of the four blocks are conditional,
 * and a component that draws itself unconditionally passes every "it is on
 * the page" assertion ever written. R-SCR-38 and R-SCR-39 both say the block
 * is absent in the ordinary case, so "present here, absent there" is the
 * whole requirement and half a test proves nothing. The mass flow's absence
 * is asserted on ANOTHER REVISION OF THE SAME RECIPE — `revisions/3` — which
 * is the sharpest form available: D-12 hangs the figure off the revision and
 * not off the recipe, so a build that moved it up to the recipe would draw
 * batch six's masses on a page that documents batch three, and only this
 * pairing catches that.
 *
 * ON `textContent` AND R-CMP-14. Several assertions below read the whole run
 * rather than one value. A flex gap is invisible to `textContent`, so two
 * values sitting side by side with nothing between them look correct and read
 * as one word to a screen reader and to a copy-paste — the fault R-CMP-14
 * records for the step chip and M4 closed on four row components. The
 * components under test carry real space text nodes for exactly this, and a
 * whitespace-only anonymous flex item is not rendered, so the spaces cost no
 * pixel and nothing but a test defends them. `readingOrder` below strips the
 * `aria-hidden` separators and reads what is left, which is the other half:
 * the drawing is one run to the eye, and the accessibility tree has to hold
 * separate values with real whitespace between them.
 */

/**
 * What the accessibility tree and a copy-paste get: the element's text with
 * every `aria-hidden` descendant removed, whitespace collapsed.
 *
 * A clone, so the live DOM is untouched and the next assertion in the same
 * test still sees the page the reader sees.
 */
async function readingOrder(
  locator: import('@playwright/test').Locator,
): Promise<string> {
  return locator.evaluate((el) => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll('[aria-hidden="true"]')
      .forEach((hidden) => hidden.remove());
    return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
  });
}

/**
 * The same collapse, on the text as it stands.
 *
 * `textContent` and never `innerText`: `uppercase` on these runs belongs to
 * the component and not to the data — the store holds `single layer on a
 * rack` and the screen draws `SINGLE LAYER ON A RACK` — and `innerText`
 * applies `text-transform` while `textContent` does not. Reading the stored
 * case is what keeps these assertions about the record.
 */
async function runText(
  locator: import('@playwright/test').Locator,
): Promise<string> {
  return locator.evaluate((el) =>
    (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

/* ── FIG. 1 — MASS FLOW ─────────────────────────────────────────────────── */

test.describe('the mass flow figure', () => {
  /**
   * R-SCR-39 and D-12. The figure is `src/components/f/mass-flow.tsx`, drawn
   * from `recipe-detail.tsx:669` as band 3 of the recipe screen — between
   * the hero and the control bar, which is the order `recipe-1280.html` draws
   * its children of `Main` in.
   *
   * The numbers below are the SEEDED ones and not the design's. D-12 rules
   * that where the two differ the archive wins: the design draws `24 pieces`
   * and `490.3 g`, `scripts/seed-data.ts:707` holds `25–30 pieces` and
   * `459.8 g`, and this file asserts the second pair. If that ruling is ever
   * reversed these strings change with the seed, which is correct — they are
   * a transcription of the record, not of the picture.
   *
   * `[data-mass-flow]` is the hook `recipe-detail.tsx:671` already carries,
   * spread onto the `<figure>` by `mass-flow.tsx:211`.
   */

  const FIGURE = '[data-mass-flow]';

  test('is drawn on the recipe, under its own band label', async ({ page }) => {
    await page.goto('/recipes/baumy-biltong');

    const figure = page.locator(FIGURE);
    await expect(figure).toHaveCount(1);
    await expect(figure).toBeVisible();

    // The head, both halves of it. `Sheet 1 of 1` is the component's own
    // words rather than data — there is no sheet count in the schema — so it
    // is asserted here and nowhere else.
    await expect(figure).toContainText('Fig. 1 · Mass flow');
    await expect(figure).toContainText('Sheet 1 of 1');
  });

  test('lists all seven stages in order, each with its value', async ({
    page,
  }) => {
    await page.goto('/recipes/baumy-biltong');

    // One `<li>` per stage and not one per box: the four-dot leader belongs
    // to the stage that follows it, so a screen reader counts seven things
    // and not thirteen. Asserting the whole array rather than a count is the
    // point — a figure that lost `Dredge`, or drew the stages in insertion
    // order rather than in the stored order, still has seven boxes.
    const stages = (await page.locator(`${FIGURE} li`).allTextContents()).map(
      (text) => text.replace(/\s+/g, ' ').trim(),
    );

    expect(stages).toEqual([
      '01 Raw 10 kg',
      '02 Cut 25–30 pieces',
      '03 Wash 321.7 g',
      '04 Dredge 459.8 g',
      '05 Cure 24–48 h',
      '06 Hang 13–15 d',
      '07 Dried 4.5 kg',
    ]);
  });

  test('keeps the ordinal, the name and the figure three values', async ({
    page,
  }) => {
    // R-CMP-14 across the whole block, including the two joins that are
    // BETWEEN blocks rather than inside a row: `mass-flow.tsx:216` says that
    // without them the figure reads `Sheet 1 of 101 Raw 10 kg02 Cut` — the
    // meta's `1` and the first stage's `01` fused into `101`, which is not a
    // number anybody wrote. Nothing but this assertion holds those three
    // space text nodes in place; they are invisible in the drawing and a
    // formatter or a tidy-up would take them without a murmur.
    await page.goto('/recipes/baumy-biltong');

    expect(await runText(page.locator(FIGURE))).toBe(
      'Fig. 1 · Mass flow Sheet 1 of 1 ' +
        '01 Raw 10 kg 02 Cut 25–30 pieces 03 Wash 321.7 g 04 Dredge 459.8 g ' +
        '05 Cure 24–48 h 06 Hang 13–15 d 07 Dried 4.5 kg ' +
        'Net weight loss −55% · Rate 4.21% per day',
    );

    // And the general form of the same fault, so a stage added later is
    // covered without adding a line here: no digit ever runs straight into a
    // letter.
    for (const stage of await page.locator(`${FIGURE} li`).allTextContents()) {
      expect(stage).not.toMatch(/\d[A-Za-z]/);
    }
  });

  test('emphasises the last stage and only the last', async ({ page }) => {
    /*
     * `MassFlowStageView.emphasis` is READ FROM THE ROW and never derived
     * from the position, because R-SCR-39 covers a dish that GAINS weight
     * too and that dish emphasises a stage in the middle. So this asserts
     * the shape of the emphasis — exactly one cell drawn differently — and
     * then that it is the seeded one, `Dried`.
     *
     * Computed colour rather than a class name: `border-accent
     * bg-accent-wash` is how M5.5 spells it and the test has no business
     * knowing that. What it has business knowing is that one box on the
     * strip is drawn in a different ink from the other six.
     */
    await page.goto('/recipes/baumy-biltong');

    const cells = await page
      .locator(`${FIGURE} li > div`)
      .evaluateAll((boxes) =>
        boxes.map((box) => {
          const style = getComputedStyle(box);
          const label = box.querySelector('span > span:last-child');
          return {
            border: style.borderTopColor,
            ground: style.backgroundColor,
            ink: label ? getComputedStyle(label).color : '',
            text: (box.textContent ?? '').replace(/\s+/g, ' ').trim(),
          };
        }),
      );

    expect(cells).toHaveLength(7);

    const plain = cells.slice(0, 6);
    const last = cells[6]!;

    // The six ordinary cells are drawn identically…
    for (const cell of plain) {
      expect(cell.border).toBe(plain[0]!.border);
      expect(cell.ground).toBe(plain[0]!.ground);
      expect(cell.ink).toBe(plain[0]!.ink);
    }

    // …and the seventh is not, in all three: the accent border, the accent
    // ground and the accent label.
    expect(last.text).toBe('07 Dried 4.5 kg');
    expect(last.border).not.toBe(plain[0]!.border);
    expect(last.ground).not.toBe(plain[0]!.ground);
    expect(last.ink).not.toBe(plain[0]!.ink);
  });

  test('closes with two summary figures, not one sentence', async ({
    page,
  }) => {
    // The `Guide` caption. The middle dot is `aria-hidden` and the spaces
    // each side of it are not, so the drawing is one run and the reading is
    // two figures — the same split `F/Mechanism` makes for its conditions.
    await page.goto('/recipes/baumy-biltong');

    const figure = page.locator(FIGURE);

    await expect(figure).toContainText(
      'Net weight loss −55% · Rate 4.21% per day',
    );

    const spoken = await readingOrder(figure);
    expect(spoken).toContain('Net weight loss −55% Rate 4.21% per day');
    // The fault this guards: `aria-hidden` on the whole ` · ` would take the
    // spaces with it and leave the two figures fused.
    expect(spoken).not.toContain('−55%Rate');
  });

  test('is absent on a revision that weighed nothing', async ({ page }) => {
    /*
     * D-12: the figure hangs off the REVISION, not the recipe. Batch five
     * was 8.2 kg and batch six is 10 kg, and `/recipes/[slug]/revisions/3`
     * renders through this same component — so a figure attached one level
     * up would print batch six's masses on the page that documents batch
     * three. Same recipe, same component, same route handler; only the
     * revision differs.
     */
    const response = await page.goto('/recipes/baumy-biltong/revisions/3');
    expect(response?.status()).toBe(200);

    await expect(page.locator(FIGURE)).toHaveCount(0);
    // The page itself is not empty — otherwise the count above would pass on
    // a 404 body and prove nothing.
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('is absent on a recipe that has no figure at all', async ({ page }) => {
    // R-SCR-39 is a MAY scoped to "a recipe that loses or gains weight in a
    // way the reader must plan for". Absence is the ordinary case: one
    // revision of one recipe in the archive carries a mass flow.
    await page.goto('/recipes/pickled-jalapenos');

    await expect(page.locator(FIGURE)).toHaveCount(0);
    await expect(page.getByText('Fig. 1 · Mass flow')).toHaveCount(0);
  });
});

/* ── THE CONDITIONS ROW ─────────────────────────────────────────────────── */

test.describe('a mechanism draws its conditions', () => {
  /**
   * R-SCR-41 — "A mechanism MUST show its conditions as separate values. Do
   * not write them into a sentence."
   *
   * §4.1 names `/science` specifically, and that is the half nothing covered:
   * `science.spec.ts:174` asserts the conditions on `/science/demi-glace`,
   * the study page, and the index draws the same mechanisms through the same
   * component with no assertion on it at all. The two screens are asserted
   * side by side here, on ONE mechanism — demi-glace's M1, which
   * `science.spec.ts:142` already pins to the same code on both — so a
   * divergence between them is a difference in this file's own output rather
   * than a difference between two sets of expectations.
   *
   * The values are `scripts/seed-data.ts:1245`, transcribed there from
   * `content/research/demi-glace.md`.
   */

  const M1 = ['8+ hours', 'held under 100 °C', 'three clarification passes'];

  for (const [screen, url] of [
    ['the index', '/science'],
    ['the study', '/science/demi-glace'],
  ] as const) {
    test(`is on ${screen}, as separate values`, async ({ page }) => {
      await page.goto(url);

      const mechanism = page
        .locator('[data-kind="science"]', { hasText: 'Why each layer exists' })
        .first();
      await expect(mechanism).toBeVisible();

      // The drawing: one run, the values joined by the middle dot the
      // component supplies. `uppercase` is CSS, so `textContent` holds the
      // stored sentence case — that difference is deliberate and is what
      // lets the store keep `single layer on a rack` while the screen draws
      // `SINGLE LAYER ON A RACK`.
      await expect(mechanism).toContainText(M1.join(' · '));

      // Each value is also its own element, which is what R-SCR-41 asks for
      // and what `toContainText` alone cannot tell apart from one string
      // that happens to hold two dots.
      for (const condition of M1) {
        await expect(
          mechanism.locator('span', { hasText: condition }).last(),
        ).toHaveText(condition);
      }
    });

    test(`reads as separate values on ${screen}`, async ({ page }) => {
      /*
       * R-CMP-14, and the fault is specific: `aria-hidden` on the whole
       * ` · ` takes the spaces with it, and the accessibility tree then
       * holds `8+ hours` immediately followed by `held under 100 °C` with
       * nothing between them. The screen looks identical either way. Only
       * the reading order tells them apart, so this asserts the reading
       * order — the glyph gone, the whitespace kept.
       */
      await page.goto(url);

      const conditions = page
        .locator('[data-kind="science"]', { hasText: 'Why each layer exists' })
        .first()
        .locator('span', { hasText: M1[0]! })
        .last()
        .locator('xpath=ancestor::span[1]');

      expect(await readingOrder(conditions)).toBe(M1.join(' '));

      // Stated as the fault rather than as the fix, because that is the
      // thing that must never be true: no two values fused into one word.
      const spoken = await readingOrder(conditions);
      expect(spoken).not.toContain('hoursheld');
      expect(spoken).not.toContain('°Cthree');
    });
  }

  test('the index draws the conditions of every mechanism it lists', async ({
    page,
  }) => {
    // Not one block: the row is drawn by `F/Mechanism` for all nine
    // mechanisms on the index, so a regression that dropped the run would
    // drop it everywhere. The two mechanisms below come from different
    // recipes — the second is the Wellington's — which is also what stops a
    // fix scoped to one query from passing this.
    await page.goto('/science');

    await expect(
      page
        .locator('[data-kind="science"]', {
          hasText: 'Maillard browning of the bone surface',
        })
        .first(),
    ).toContainText('232 °C · 45 min · single layer on a rack');

    await expect(
      page
        .locator('[data-kind="science"]', { hasText: 'The octagon sear' })
        .first(),
    ).toContainText('8 faces + 2 ends · raw interior');
  });

  test('one condition draws no separator', async ({ page }) => {
    /*
     * The single-value case, and it is the one place the separator rule can
     * be got wrong invisibly. `Two barriers, two mechanisms` carries exactly
     * one condition, `dry duxelles + sealed wrap`, and `seed-data.ts:1416`
     * says why it is one and not two: "The `+` is inside the value; it is
     * not a join of two conditions." A component that joined on the wrong
     * side — a leading dot, or a `+` split into two chips — draws a run that
     * still looks like a conditions row and says something the archive does
     * not.
     */
    await page.goto('/science/beef-wellington-technique');

    const single = page
      .locator('[data-kind="science"]', {
        hasText: 'Two barriers, two mechanisms',
      })
      .first();
    await expect(single).toBeVisible();

    const conditions = single
      .locator('span', { hasText: 'dry duxelles + sealed wrap' })
      .last()
      .locator('xpath=ancestor::span[1]');

    expect(await runText(conditions)).toBe('dry duxelles + sealed wrap');
    expect(await readingOrder(conditions)).toBe('dry duxelles + sealed wrap');
  });
});

/* ── THE BATCH LOG WITH NO SOURCE RECIPE ────────────────────────────────── */

test.describe('a batch log with no source recipe', () => {
  /**
   * R-SCR-44 — "The batch log card MUST read correctly with no source
   * recipe" — and K-01, which decided that a run is often logged before its
   * recipe exists and so the recipe link stays optional.
   *
   * WHICH OF THE TWO ROUTES §4.1 OFFERS THIS TAKES, AND WHY. The state is
   * unreachable on the seeded site: `batch-log-parts.tsx:287` says so in as
   * many words — "Every seeded run names a recipe, so the state cannot be
   * seen on the running site — it is reached only through `logExperiment`
   * with no `recipeSlug`, which K-01 allows." So the run is WRITTEN HERE,
   * through the real MCP write layer, exactly the way `mcp-lifecycle.spec.ts`
   * writes the recipe it then reads off the page. The alternative — asserting
   * on the component through some other route — would be a test of a mock:
   * R-SCR-44 is a statement about `/batch-logs`, and a component rendered
   * anywhere else does not answer it.
   *
   * THE RUN IS BUILT SO IT COSTS THE REST OF THE SUITE NOTHING:
   *
   *   - `startedAt` is the latest date in the repository, and
   *     `batch-logs/page.tsx:54` reverses the query into oldest-first, so the
   *     row lands LAST. `site.spec.ts:99` clicks the first run on the index
   *     and asserts it lands on a nested address; a run with no recipe at the
   *     top of that list would have broken it.
   *   - No cost, so `SPENT` is unchanged. No items and no observations, so
   *     the `RAW / DRIED / YIELD` panel draws its spacer and no figure moves.
   *   - A fixed slug, because re-logging one slug replaces that run rather
   *     than appending a second, so a re-run of this file is idempotent.
   */

  const SLUG = 'unlinked-chilli-wash-trial';
  const TITLE = 'Chilli wash trial';

  test.beforeAll(async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);

    await mcp.call('log_experiment', {
      slug: SLUG,
      title: TITLE,
      // No `recipeSlug`. That is the whole point of the fixture.
      startedAt: '2026-09-09',
      summary:
        'A wash cut with fermented chilli, run before there was a recipe to ' +
        'attach it to.',
    });
  });

  test('is listed on the index at its own top-level address', async ({
    page,
  }) => {
    // D-01: a run that names a recipe lives under that recipe; a run that
    // names none has no recipe slug to put in that shape and stays at the
    // top level. The index links straight at whichever of the two the run's
    // own address is, so the reader never pays for the redirect.
    await page.goto('/batch-logs');

    const link = page.locator('main').getByRole('link', { name: TITLE });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', `/batch-logs/${SLUG}`);
  });

  test('says so in the SOURCE cell rather than leaving it blank', async ({
    page,
  }) => {
    /*
     * The design draws this state twice and both drawings are in the DOM at
     * once — `F/Batch source` at 1280 and an `F/List mark` chip at 360 — so
     * both are asserted, at the width each one is drawn at. A blank cell is
     * the failure this guards: R-SCR-44 asks for a card that READS
     * correctly, and an empty column reads as a missing value rather than as
     * a run that never had one.
     */
    await page.goto('/batch-logs');

    /*
     * The row, without a data attribute to name it: the deepest `<div>` in
     * `main` that holds BOTH the run's title link and the words the SOURCE
     * cell draws. Every ancestor holds both too, and an ancestor precedes
     * its descendants in document order, so `.last()` is the innermost —
     * which is the row itself, because `F/Batch line` holds the title and
     * not the source.
     */
    const row = page
      .locator('main div')
      .filter({ has: page.getByRole('link', { name: TITLE }) })
      .filter({ hasText: 'Not yet linked' })
      .last();

    // 1280 — the `SOURCE` column, with the fallback in the quiet ink.
    await expect(
      row.getByText('Not yet linked', { exact: true }),
    ).toBeVisible();
    // Not a link. Nothing to link to is the state itself.
    await expect(row.getByRole('link', { name: 'Not yet linked' })).toHaveCount(
      0,
    );

    // And the row's own meta says it in the design's words, so the fact
    // survives at a width where the SOURCE column is not drawn.
    await expect(row).toContainText('Not linked to a recipe');

    // 360 — the same words on a chip whose square drops from the accent to
    // the hairline.
    await page.setViewportSize({ width: 360, height: 900 });
    await expect(row.getByText('SOURCE · Not yet linked')).toBeVisible();
  });

  test('is counted on the ledger', async ({ page }) => {
    // R-SCR-44 stated as a figure. `batch-logs/page.tsx:130` draws
    // `NOT YET LINKED` only when there is one to count — a `NOT YET LINKED —
    // 0` on a screen whose whole argument is that such a run has a home
    // would read as a rebuke of itself — so this assertion is only reachable
    // once the run above exists.
    await page.goto('/batch-logs');

    const figure = page
      .locator('main div')
      .filter({ hasText: /^Not yet linked/ })
      .last();
    await expect(figure).toBeVisible();
    // The label is the first span and the count is the second.
    await expect(figure.locator('span').last()).toHaveText('1');
  });

  test('its own page answers', async ({ page }) => {
    // The top-level detail route is the run's canonical address here rather
    // than a redirect, which is the second half of D-01.
    const response = await page.goto(`/batch-logs/${SLUG}`);

    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(`/batch-logs/${SLUG}`);
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  });
});

/* ── LITERATURE ─────────────────────────────────────────────────────────── */

test.describe('the literature block', () => {
  /**
   * R-SCR-38 — "The literature block MUST be absent when the recipe cites
   * nothing. Most recipes cite nothing."
   *
   * Both halves, and the pairing is the test: Baumy Biltong is the busiest
   * recipe in the repository and cites nothing, Demi-Glace cites four works,
   * and D-12's "What is NOT missing" names exactly that pair as the reason
   * the block looks absent on the primary screen and is not a build gap.
   *
   * `note_sources` is the only citation this schema holds, so the block is
   * every source the recipe's notes carry, collected once and numbered
   * `[1]…[n]` — deduplicated on the whole row, because two notes citing one
   * paper is a bibliography of one entry.
   *
   * THE BLOCK CARRIES NO DATA ATTRIBUTE, so it is selected by its own head:
   * the `<h2>` the band draws, and the `<section>` that holds it. Reading the
   * heading is also the assertion that the head is a heading at all — the
   * band's rail is the only outline this panel has.
   */

  const HEAD = { level: 2, name: /^literature$/i } as const;

  test('is absent on a recipe that cites nothing', async ({ page }) => {
    await page.goto('/recipes/baumy-biltong');

    // The Method panel is where the block would be, and it is open at the
    // default 1280 — so this is an absence on a rendered panel and not on a
    // panel that never opened.
    await expect(page.locator('[data-tab="method"]')).toBeVisible();
    await expect(page.getByRole('heading', HEAD)).toHaveCount(0);
  });

  test('is drawn on a recipe that cites four works', async ({ page }) => {
    await page.goto('/recipes/demi-glace');

    const literature = page
      .getByRole('heading', HEAD)
      .locator('xpath=ancestor::section[1]');
    await expect(literature).toBeVisible();

    // The count in the band's right-hand meta, and the four rows under it.
    // `[1]…[4]` are drawn by the component from the position, so numbering
    // that restarted or skipped shows up here rather than in a screenshot.
    await expect(literature.getByText('[1]')).toBeVisible();
    await expect(literature.getByText('[4]')).toBeVisible();
    await expect(literature.getByText('[5]')).toHaveCount(0);

    // Every work is named. Four sources on one note in `seed-data.ts:1256`;
    // a collection that took only the first, or one that lost the dedupe and
    // printed a paper twice, both fail here.
    for (const work of [
      'Reluctant Gourmet — demi-glace',
      'Chef Jean-Pierre — demi-glace',
      'French Cooking Academy — home-style demi-glace',
      'Michelin Guide — the five mother sauces',
    ]) {
      await expect(literature.getByText(work, { exact: true })).toHaveCount(1);
    }
  });

  test('each citation is a link out to the work', async ({ page }) => {
    // R-SCR-42 asks for the work, the part of it and the date a person read
    // it. The archive carries a title and a URL and nothing else, so the URL
    // is what there is to assert — and it is the half that makes the block
    // worth drawing rather than a list of names.
    await page.goto('/recipes/demi-glace');

    const literature = page
      .getByRole('heading', HEAD)
      .locator('xpath=ancestor::section[1]');

    const links = literature.locator('a[href^="http"]');
    await expect(links).toHaveCount(4);
    await expect(links.first()).toHaveAttribute(
      'href',
      'https://www.reluctantgourmet.com/demi-glace-recipe/',
    );
    // An outbound citation opens away from the repository and carries the
    // rel a link to somebody else's page has to carry.
    await expect(links.first()).toHaveAttribute('target', '_blank');
    await expect(links.first()).toHaveAttribute('rel', /noreferrer/);
  });
});
