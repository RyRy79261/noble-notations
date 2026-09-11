import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';

/**
 * R-STA-01 and R-SCR-02 — the whole site with no database.
 *
 * `src/lib/safe.ts` is imported by 24 pages and route handlers, AGENTS.md
 * sells the property it provides ("every database-backed page degrades to an
 * explanatory notice rather than a stack trace when `DATABASE_URL` is
 * unset, so the build and the archive work without one"), and §10.1
 * R-SCR-02 makes the home statistics block a named case of it. Nothing in
 * the suite has ever unset `DATABASE_URL` or forced a read to fail, so
 * every one of those claims was untested: `safeRead` could return the
 * fallback and the page could print it as content — "ZERO RECIPES INDEXED",
 * an empty grid, a bare heading — and every gate would stay green.
 *
 * THE SECOND SERVER, AND WHY IT IS STARTED HERE RATHER THAN IN
 * `playwright.config.ts`. This state is a property of the RUNNING SERVER's
 * environment, not of a page or a request, so no `page.route`, cookie or
 * header can reach it — the only honest way to test it is a server that
 * really has no `DATABASE_URL`. A second `webServer` entry would impose a
 * fixed port on every run of the suite and start a process even for the
 * files that do not need one; a child started and stopped by this file
 * costs nothing anywhere else. It runs the SAME BUILD: every page that
 * reads the database is `force-dynamic`, so the notice is decided per
 * request and no rebuild is needed. (`/archive` and `/connect` are the two
 * that are not, and neither reads the database — which is the point of
 * R-SCR-25.)
 *
 * The port is allocated rather than fixed, so this cannot collide with the
 * app server, the GitHub stub, or another agent's suite on the same
 * machine. The child is started in its own process group and killed by
 * group id — `next start` runs the server in a child of its own, and a
 * signal to the CLI alone leaves the port held.
 */

/** Every address `scripts/audit-ui.ts` drives, plus the archive note. */
const ROUTES: { path: string; notice: boolean }[] = [
  { path: '/', notice: true },
  { path: '/recipes', notice: true },
  { path: '/recipes/baumy-biltong', notice: true },
  { path: '/recipes/baumy-biltong/revisions/1', notice: true },
  { path: '/recipes/baumy-biltong/batch-logs', notice: true },
  { path: '/recipes/baumy-biltong/batch-logs/biltong-batch-3', notice: true },
  { path: '/science', notice: true },
  { path: '/science/demi-glace', notice: true },
  { path: '/cuisines', notice: true },
  { path: '/cuisines/south-african', notice: true },
  { path: '/classes', notice: true },
  { path: '/classes/technique/air-drying', notice: true },
  { path: '/ingredients', notice: true },
  { path: '/ingredients/salt', notice: true },
  { path: '/batch-logs', notice: true },
  { path: '/batch-logs/biltong-batch-3', notice: true },
  { path: '/list', notice: true },
  { path: '/search?q=biltong', notice: true },
  // R-SCR-25: served from the repository, so it carries content and not a
  // notice. The detail page is BUILD-PLAN §6.5's first uncovered screen.
  { path: '/archive', notice: false },
  { path: '/archive/biltong/batch-03', notice: false },
  // Neither reads the database at all.
  { path: '/connect', notice: false },
  { path: '/sign-in', notice: false },
];

/** What a reader must never be shown instead of the notice. */
const CRASH =
  /Application error|Internal Server Error|missing required error components|DATABASE_URL is not set — cannot connect/i;

let server: ChildProcess | undefined;
let origin = '';

/** A port nothing holds right now, chosen by the kernel. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (typeof address === 'string' || address === null) {
        probe.close();
        reject(new Error('no port'));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

test.beforeAll(async () => {
  // A production server start, not a page load.
  test.setTimeout(120_000);

  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;

  const env = { ...process.env };
  delete env.DATABASE_URL;

  server = spawn(
    path.join(process.cwd(), 'node_modules', '.bin', 'next'),
    ['start', '-p', String(port)],
    { env, stdio: 'pipe', detached: true },
  );

  // Drained rather than ignored: nothing reads the child's output, and an
  // unread pipe fills and stops the process it belongs to.
  server.stdout?.resume();
  server.stderr?.resume();

  const deadline = Date.now() + 90_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`no server on ${origin}`);
    try {
      const response = await fetch(`${origin}/connect`);
      if (response.ok) break;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
});

test.afterAll(async () => {
  // By process group: `next start` holds the port in a child of its own, so
  // signalling the CLI alone leaves the port bound. Never `pkill`.
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
});

/**
 * The guard that stops this whole file passing vacuously.
 *
 * Every assertion below is about a server with no database. If the child
 * ever inherited one — an `.env.local` appearing, a stray export, a changed
 * `delete` — each test would run against a healthy site and the ones that
 * only look for a shell would still pass. So the first test proves the
 * state itself, on the one screen the specification names.
 */
test('the second server really has no database, and says so on the home page', async ({
  page,
}) => {
  await page.goto(`${origin}/`);

  // R-SCR-02: block 2 is REPLACED by the notice.
  await expect(page.getByText('DATABASE_URL')).toBeVisible();
  await expect(
    page.getByText(/is not set, so nothing can be read/i),
  ).toBeVisible();

  // …and nothing else on the screen is: the hero above it and the foot
  // below it do not read the database, and a notice that took the page with
  // it would be the wrong repair. (The "How this works" cards used to be
  // the half of this assertion below the notice. D-14 removed them; the
  // three data-backed bands are absent here because they have nothing in
  // them, which is R-SCR-01 and not a failure.)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[data-page-foot]')).toHaveCount(1);

  // The six figures are gone rather than printed as zeroes. "Recipes 0" is a
  // claim about the repository; the notice is a report about the connection.
  await expect(page.getByText('Six measures')).toHaveCount(0);
  const ledger = await page.locator('main').innerText();
  expect(ledger).not.toMatch(/Revisions\s*\n?\s*0/);
});

test('the home page notice offers the archive, and the archive answers', async ({
  page,
}) => {
  // R-STA-01: "Show a notice. Tell the reader about `DATABASE_URL`. Link to
  // the archive." The link is the half that is worth a click — an archive
  // link that 404s on the one deployment that needs it is worse than none.
  await page.goto(`${origin}/`);

  await page
    .locator('main')
    .getByRole('link', { name: 'archive', exact: true })
    .first()
    .click();

  await expect(page).toHaveURL(`${origin}/archive`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

for (const route of ROUTES) {
  test(`${route.path} degrades at 1280 and at 360`, async ({ page }) => {
    for (const width of [1280, 360]) {
      await page.setViewportSize({ width, height: width === 360 ? 780 : 900 });

      const response = await page.goto(`${origin}${route.path}`);
      expect(response?.status(), `${route.path} at ${width}`).toBe(200);

      // The shell. `main` and the page foot are drawn at both widths; the
      // primary navigation is present at both and VISIBLE only at 1280,
      // because at 360 it lives in the drawer.
      await expect(page.locator('main')).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 1 }).first(),
      ).toBeVisible();
      await expect(page.locator('[data-page-foot]')).toHaveCount(1);
      await expect(page.locator('nav[aria-label="Primary"]')).toHaveCount(1);

      const text = await page.locator('body').innerText();
      expect(text, `${route.path} at ${width}`).not.toMatch(CRASH);

      if (route.notice) {
        // R-STA-01 on this screen: the notice, and the archive named in it.
        await expect(page.getByText('DATABASE_URL').first()).toBeVisible();
        await expect(
          page.locator('main a[href="/archive"]').first(),
        ).toHaveCount(1);
      }
    }
  });
}

test('the archive is the one section that still holds its content', async ({
  page,
}) => {
  /*
   * R-SCR-25 — "The archive MUST work when there is no database. The server
   * reads these files from the repository." This is the reason the notice
   * links there, so it is asserted as content and not as a status code: a
   * `/archive` that answered 200 with an empty grid would satisfy the loop
   * above and break the promise the notice makes.
   */
  await page.goto(`${origin}/archive`);

  const notes = page.locator('main a[href^="/archive/"]');
  expect(await notes.count()).toBeGreaterThan(5);
  await expect(page.getByText('DATABASE_URL')).toHaveCount(0);

  await page.goto(`${origin}/archive/biltong/batch-03`);
  await expect(
    page.getByRole('heading', { name: /biltong batch 3/i }),
  ).toBeVisible();
  // The frozen Markdown itself, not just the head that names it.
  await expect(page.locator('main')).toContainText('content/biltong');
  await expect(page.getByText('DATABASE_URL')).toHaveCount(0);
});

test('a search with no database says so instead of answering nothing', async ({
  page,
}) => {
  /*
   * The fourth of §10.5's four result states, and the one that is a lie
   * when it is got wrong: with no database `searchRecipes` returns no rows,
   * and a screen that drew the ordinary empty state would tell the reader
   * "Nothing matched" about a repository it never asked.
   */
  await page.goto(`${origin}/search?q=biltong`);

  await expect(page.getByText('DATABASE_URL')).toBeVisible();
  await expect(page.getByText(/nothing matched/i)).toHaveCount(0);
  // And no count is claimed. `getStats` falls back to zeroes, so a screen
  // that printed them would say the repository holds nothing.
  await expect(page.locator('main')).not.toContainText(/zero recipes/i);
});

test('the 404 is the designed screen, with or without a database', async ({
  page,
}) => {
  // R-SCR-26. `not-found.tsx` reads nothing, so it is the one screen that
  // must be identical on both servers — which is worth pinning, because a
  // shell that started reading the database would take the 404 with it.
  for (const target of [origin, '']) {
    const response = await page.goto(`${target}/this-page-does-not-exist`);
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: /no page at this address/i }),
    ).toBeVisible();
    await expect(page.locator('[data-page-foot]')).toHaveCount(1);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// The other half of `safeRead`: a database that is there and does not answer
// ─────────────────────────────────────────────────────────────────────────

test.describe('a configured database that cannot be reached', () => {
  /*
   * `safeRead` has two failure branches and everything above exercises one.
   *
   *   `!isDatabaseConfigured()`  →  `{ configured: false }`  →  the notice
   *   the read threw             →  `{ failed: true }`       →  the warning
   *
   * Inverting the first branch's boolean fails 22 tests in this file; making
   * the `catch` return `failed: false` fails nothing at all, and the site
   * then answers a Neon blip, a bad migration or a query error with an empty
   * page and no explanation — on all 24 files that import `safe.ts`. It is
   * the branch that fires in PRODUCTION: an unset `DATABASE_URL` is a fresh
   * clone, and a configured one that throws is a Tuesday.
   *
   * A third server, with a URL that parses and points at nothing. It has to
   * be a real server for the same reason the second one does: this is a
   * property of the process's environment, and no request can fake it.
   * Port 1 is reserved, refuses at once, and is not a *.neon.tech host — so
   * the app takes the node-postgres path and the connection is refused
   * rather than timing out.
   */
  const UNREACHABLE = 'postgresql://nobody@127.0.0.1:1/none';

  let blind: ChildProcess | undefined;
  let blindOrigin = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);

    const port = await freePort();
    blindOrigin = `http://127.0.0.1:${port}`;

    blind = spawn(
      path.join(process.cwd(), 'node_modules', '.bin', 'next'),
      ['start', '-p', String(port)],
      {
        env: { ...process.env, DATABASE_URL: UNREACHABLE },
        stdio: 'pipe',
        detached: true,
      },
    );
    blind.stdout?.resume();
    blind.stderr?.resume();

    const deadline = Date.now() + 90_000;
    for (;;) {
      if (Date.now() > deadline) throw new Error(`no server on ${blindOrigin}`);
      try {
        const response = await fetch(`${blindOrigin}/connect`);
        if (response.ok) break;
      } catch {
        /* not listening yet */
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  });

  test.afterAll(async () => {
    if (blind?.pid) {
      try {
        process.kill(-blind.pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
  });

  test('says the read failed, and says it is temporary', async ({ page }) => {
    const response = await page.goto(`${blindOrigin}/`);
    expect(response?.status()).toBe(200);

    /*
     * R-STA-02 and NOT R-STA-01, and the difference is the whole test. The
     * two states have two different components and two different sentences,
     * because they ask the reader for two different things: an unset
     * variable is somebody's job to set, and a read that threw is somebody's
     * job to wait out. Telling an owner with a working connection to go and
     * set `DATABASE_URL` sends them to look at the one thing that is right.
     */
    await expect(
      page.getByText(/could not read the repository/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/reload in a moment/i).first()).toBeVisible();
    await expect(page.getByText('DATABASE_URL')).toHaveCount(0);

    // The shell survived, and no stack trace reached the reader. The
    // connection error carries a host and a port, which is exactly the kind
    // of detail an error page must not publish.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('[data-page-foot]')).toHaveCount(1);
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(CRASH);
    expect(body).not.toMatch(/ECONNREFUSED|127\.0\.0\.1:1|at async/i);

    // And no figure is claimed. `getStats` falls back to zeroes, and a
    // screen that printed them would report an empty repository as a fact.
    expect(body).not.toMatch(/Revisions\s*\n?\s*0/);
  });

  test('every database-backed screen answers, at both widths', async ({
    page,
  }) => {
    /*
     * The same loop the unset case runs, on the routes that read the
     * database. One screen degrading is a component; all of them degrading
     * is the property AGENTS.md sells.
     *
     * `/list` IS DRIVEN WITH A SELECTION, and the difference is real rather
     * than cosmetic. `buildShoppingList([])` returns an empty list without
     * asking the database at all, so a bare `/list` against a database that
     * throws succeeds — correctly, and it is the one route here where the
     * unset case and the unreachable case genuinely differ. Naming a recipe
     * is what makes it read.
     */
    const paths = ROUTES.filter((r) => r.notice).map((r) =>
      r.path === '/list' ? '/list?r=baumy-biltong' : r.path,
    );

    for (const path of paths) {
      const response = await page.goto(`${blindOrigin}${path}`);
      expect(response?.status(), path).toBe(200);

      await expect(page.locator('main')).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 1 }).first(),
      ).toBeVisible();
      await expect(page.locator('[data-page-foot]')).toHaveCount(1);

      const text = await page.locator('body').innerText();
      expect(text, path).not.toMatch(CRASH);
      expect(text, path).toMatch(/could not read the repository/i);
    }
  });

  test('a shopping list with nothing in it needs no database', async ({
    page,
  }) => {
    // The other half of the route above, stated on purpose rather than
    // skipped. `buildShoppingList([])` never reaches the database, so a bare
    // `/list` is the one database-backed screen that is WHOLE here — and a
    // warning on it would be a report about a read that did not happen.
    await page.goto(`${blindOrigin}/list`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/could not read the repository/i)).toHaveCount(
      0,
    );
  });

  test('the archive still answers, because it never asks the database', async ({
    page,
  }) => {
    // R-SCR-25 from the other side. The notice on every other screen tells
    // the reader the archive works; on a server whose reads throw, that
    // sentence has to be true for the same reason it is true with no URL at
    // all — the files are in the repository.
    await page.goto(`${blindOrigin}/archive`);
    const notes = page.locator('main a[href^="/archive/"]');
    expect(await notes.count()).toBeGreaterThan(5);
    await expect(page.getByText(/could not read/i)).toHaveCount(0);
  });
});
