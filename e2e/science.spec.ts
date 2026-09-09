import { test, expect } from '@playwright/test';

/**
 * `/science` and `/science/[slug]` are the two routes the design added.
 * They do not hold anything of their own: they collect the science notes
 * that are already attached to recipes and put them in one place, so the
 * whole surface under test is "does the cross-recipe read reach the page,
 * and does each note still point back at where it came from".
 *
 * **What the seed actually holds**, because every assertion below is
 * derived from it rather than from the design (`scripts/seed-data.ts`, via
 * `pnpm ingest` in `global-setup`):
 *
 * | Recipe                      | kind        | status | science notes |
 * | --------------------------- | ----------- | ------ | ------------- |
 * | `beef-wellington-technique` | research    | active | 4             |
 * | `demi-glace`                | preparation | active | 1             |
 * | `peri-peri-cocktail`        | research    | draft  | 0             |
 * | everything else             | recipe      | active | 0             |
 *
 * So the index has two study cards — `beef-wellington-technique`, which is
 * a research recipe, and `demi-glace`, which is not one but carries a
 * mechanism and therefore has a `/science/[slug]` address of its own;
 * `peri-peri-cocktail` is a draft and `listScienceIndex` filters drafts out
 * of the card list — five mechanisms drawn from those two recipes, and one
 * research note, the crayfish one on `berlin-crayfish-boil`.
 *
 * **On R-SCR-43.** The requirement is that `/science` shows an empty state
 * when *no recipe anywhere* has a science note. That state cannot be
 * reached against this database: `global-setup` seeds through the real
 * `pnpm ingest`, which loads five of them, and nothing can be deleted —
 * that is the point of the repository. Writing a test that pretends
 * otherwise would be a test of a mock. What is reachable, and is tested
 * here, are the two neighbouring states: a study that carries no mechanism
 * (`peri-peri-cocktail`), and a recipe with no science at all, which must
 * have no `/science` address rather than a thin second one.
 */

test('/science renders', async ({ page }) => {
  const response = await page.goto('/science');

  expect(response?.status()).toBe(200);
  await expect(page.locator('h1').first()).toBeVisible();
});

test('the index gathers mechanisms from every recipe, not one', async ({
  page,
}) => {
  // This is the whole reason K-04 needed a new query. `getRecipeBySlug`
  // reads the notes of one recipe; nothing read them across recipes. If
  // this narrows back to a single recipe the page still looks fine, which
  // is why both titles are asserted rather than a count.
  await page.goto('/science');

  // beef-wellington-technique, a study.
  await expect(page.getByText('The octagon sear').first()).toBeVisible();
  // demi-glace, which is a preparation with a mechanism on it — the case a
  // "list the research recipes" shortcut would silently drop.
  await expect(page.getByText('Why each layer exists').first()).toBeVisible();
});

test('the index lists the research notes as well as the mechanisms', async ({
  page,
}) => {
  // "FROM THE RECIPES" in the design. A research note is a different kind
  // from a science note and lives on an ordinary recipe — this one is on
  // berlin-crayfish-boil, which is neither a study nor a preparation.
  await page.goto('/science');

  await expect(
    page.getByText('Where to buy crayfish in Berlin').first(),
  ).toBeVisible();
});

test('a study card opens the study', async ({ page }) => {
  await page.goto('/science');

  // Located by href rather than by name: the card carries a kind label and
  // a mechanism count around the title, and asserting the whole accessible
  // name would break on a copy change that is M6's business.
  const card = page.locator('a[href="/science/beef-wellington-technique"]');
  await expect(card.first()).toBeVisible();

  await card.first().click();
  await expect(page).toHaveURL(/\/science\/beef-wellington-technique$/);
  await expect(page.locator('h1').first()).toBeVisible();
});

test('a study links back to its recipe', async ({ page }) => {
  // R-SCR-40. `/science/[slug]` is keyed by the recipe slug, so the study
  // and the recipe are two views of one record and the reader has to be
  // able to get from the reasoning to the method.
  await page.goto('/science/beef-wellington-technique');

  await expect(
    page.locator('a[href="/recipes/beef-wellington-technique"]').first(),
  ).toBeVisible();
});

test('a study shows only its own mechanisms', async ({ page }) => {
  await page.goto('/science/beef-wellington-technique');

  await expect(page.getByText('The octagon sear').first()).toBeVisible();
  // demi-glace's mechanism is on the index beside this one. On the study
  // page it must not be: the codes are numbered per study, so a leaked
  // mechanism would also renumber the ones after it.
  await expect(page.getByText('Why each layer exists')).toHaveCount(0);
});

test('a study names the recipes that apply it', async ({ page }) => {
  // "APPLIED IN", and the direction matters. The seed holds one link:
  // demi-glace is `component_of` beef-wellington-technique, which means the
  // Wellington leans on demi-glace and not the reverse. So the demi-glace
  // study is the one that names a recipe applying it, and the Wellington
  // study names none — reading every incoming edge printed that backwards.
  await page.goto('/science/demi-glace');

  await expect(
    page.locator('a[href="/recipes/beef-wellington-technique"]').first(),
  ).toBeVisible();
});

test('a study card is drawn for a recipe that is not a research recipe', async ({
  page,
}) => {
  // demi-glace is `kind: preparation` with one mechanism on it. It has a
  // live `/science/demi-glace`, so the index has to reach it: an address
  // that answers and is listed nowhere is an address nobody finds.
  await page.goto('/science');

  const card = page.locator('a[href="/science/demi-glace"]');
  await expect(card.first()).toBeVisible();
});

test('a mechanism carries the same code on both science screens', async ({
  page,
}) => {
  // The index numbers mechanisms within their recipe, exactly as the study
  // page does, so the badge beside "Why each layer exists" reads M1 in both
  // places. Numbering the index across every recipe made it M5 here and M1
  // one click later.
  await page.goto('/science');
  const onIndex = page
    .locator('.note', { hasText: 'Why each layer exists' })
    .first();
  await expect(onIndex.locator('.badge.num').first()).toHaveText('M1');

  await page.goto('/science/demi-glace');
  const onStudy = page
    .locator('.note', { hasText: 'Why each layer exists' })
    .first();
  await expect(onStudy.locator('.badge.num').first()).toHaveText('M1');
});

test('a study shows where its claims came from', async ({ page }) => {
  // R-SCR-42 asks for the work, the part of it and the date a person read
  // it. The seeded source carries a title and a URL and nothing else, so
  // only the work can be asserted; the other two fields are null in the
  // archive rather than missing from the page.
  await page.goto('/science/beef-wellington-technique');

  await expect(
    page.getByText('Original research thread').first(),
  ).toBeVisible();
});

test('a study with no mechanism still answers', async ({ page }) => {
  // The reachable half of R-SCR-43. peri-peri-cocktail is `kind: research`
  // with a single idea note and no science, so it is a study with nothing
  // in it. It must render its own empty state rather than 404 or throw:
  // a study is often opened before the reasoning is written down.
  const response = await page.goto('/science/peri-peri-cocktail');

  expect(response?.status()).toBe(200);
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.getByText('The octagon sear')).toHaveCount(0);
});

test('a recipe with no science has no science address', async ({ page }) => {
  // The other half. baumy-biltong is the busiest recipe in the repository
  // and carries eleven notes, none of them science. Answering here would
  // give the dish a second, thinner address for a search engine to choose
  // between.
  const response = await page.goto('/science/baumy-biltong');

  expect(response?.status()).toBe(404);
});
