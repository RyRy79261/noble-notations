import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import path from 'node:path';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * SHAKE THE PHONE TO REPORT A PROBLEM — ported from Intake Tracker.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THESE TESTS DEFEND:
 *
 * - **A reader never meets it.** The site is public and so is the
 *   repository. On the main server nobody is signed in, so a shake opens
 *   nothing, `?report=1` opens nothing, and a POST is refused. Without that
 *   gate the sheet is a way for anybody to write issues under the owner's
 *   token.
 * - **The owner can file from a shake**, and the issue that arrives carries
 *   the words, the labels, the page and the errors the tab caught.
 * - **An upload token never reaches the public issue.** A person shaking the
 *   phone on a broken upload page is the case this feature was asked for,
 *   and that page's address is a credential until the link is spent.
 *
 * The owner's session is forged exactly as `e2e/auth-consent.spec.ts` forges
 * it — see that file for why that is the real path and not a mock — on a
 * second server of its own. NOTHING HERE REACHES api.github.com: the second
 * server points `GITHUB_API_BASE_URL` at `e2e/github-stub.ts`.
 */

const MAIN = `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`;
/** `+ 7`: the next port above the blob stub. See `playwright.config.ts`. */
const PORT = Number(process.env.E2E_PORT ?? 3100) + 7;
const OWNER_BASE = `http://127.0.0.1:${PORT}`;
const GITHUB = `http://127.0.0.1:${process.env.E2E_GITHUB_PORT ?? 3101}`;

const COOKIE_SECRET =
  'e2e-site-report-cookie-secret-for-its-own-server-0123456789abcdef';
const OWNER = 'owner@noble-notations.test';

const base64url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/** The pair of cookies a finished Neon Auth sign-in leaves behind. */
function sessionCookie(email: string, userId = 'e2e-owner'): string {
  const now = Date.now();
  const exp = Math.floor((now + 60 * 60_000) / 1000);
  const iso = (ms: number) => new Date(ms).toISOString();
  const payload = {
    session: {
      id: 'e2e-session',
      token: 'e2e-session-token',
      userId,
      expiresAt: iso(exp * 1000),
      createdAt: iso(now),
      updatedAt: iso(now),
    },
    user: {
      id: userId,
      email,
      name: 'End to end',
      emailVerified: true,
      createdAt: iso(now),
      updatedAt: iso(now),
    },
    iat: Math.floor(now / 1000),
    exp,
    sub: userId,
  };
  const header = base64url({ alg: 'HS256', typ: 'JWT' });
  const body = base64url(payload);
  const signature = createHmac('sha256', COOKIE_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return (
    '__Secure-neon-auth.session_token=e2e-session-token; ' +
    `__Secure-neon-auth.local.session_data=${header}.${body}.${signature}`
  );
}

/**
 * A real shake, as the page receives one: `devicemotion` events at phone
 * rate with the acceleration swinging well past the threshold. Resting is
 * gravity alone, 9.8 on one axis.
 */
async function shake(page: Page) {
  await page.evaluate(async () => {
    const send = (x: number, y: number, z: number) =>
      window.dispatchEvent(
        new DeviceMotionEvent('devicemotion', {
          accelerationIncludingGravity: { x, y, z },
        }),
      );
    for (let i = 0; i < 8; i += 1) {
      send(0, 0, i % 2 === 0 ? 9.8 : 30);
      await new Promise((r) => setTimeout(r, 70));
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 1. A reader
// ─────────────────────────────────────────────────────────────────────────

test('for a reader who is not signed in, a shake opens nothing and a report is refused', async ({
  page,
  request,
}) => {
  const status = await request.get(`${MAIN}/api/report`);
  expect(await status.json()).toEqual({ enabled: false });

  const refused = await request.post(`${MAIN}/api/report`, {
    data: {
      kind: 'bug',
      description: 'Anybody can write this.',
      page: '/',
      environment: [],
      errors: [],
    },
  });
  expect(refused.status()).toBe(401);
  expect(await refused.json()).toMatchObject({ signIn: true });

  await page.goto(`${MAIN}/?report=1`);
  await page.waitForLoadState('networkidle');
  await shake(page);
  await expect(page.locator('[data-report-sheet]')).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The owner, on a server of their own
// ─────────────────────────────────────────────────────────────────────────

test.describe('the signed-in owner', () => {
  let server: ChildProcess | null = null;
  let output = '';

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NEON_AUTH_BASE_URL: 'http://127.0.0.1:9/neon-auth-is-never-reached',
      NEON_AUTH_COOKIE_SECRET: COOKIE_SECRET,
      ALLOWED_EMAILS: OWNER,
      // The same stub the main server files `report_issue` into.
      GITHUB_ISSUE_TOKEN: 'stub-token-not-a-real-credential',
      GITHUB_API_BASE_URL: GITHUB,
    };
    server = spawn(
      process.execPath,
      [
        path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next'),
        'start',
        '-p',
        String(PORT),
      ],
      { cwd: process.cwd(), env, stdio: 'pipe', detached: true },
    );
    server.stdout?.on('data', (c: Buffer) => (output += c.toString()));
    server.stderr?.on('data', (c: Buffer) => (output += c.toString()));

    const deadline = Date.now() + 120_000;
    let up = false;
    while (!up && Date.now() < deadline) {
      try {
        await fetch(`${OWNER_BASE}/api/report`);
        up = true;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    expect(up, `the owner server never answered:\n${output}`).toBe(true);
  });

  test.afterAll(() => {
    if (!server?.pid) return;
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      try {
        process.kill(server.pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
  });

  test('a shake on a broken upload page files an issue, with the token removed and the page error attached', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);
    await page.setExtraHTTPHeaders({ cookie: sessionCookie(OWNER) });
    await request.post(`${GITHUB}/__reset`);

    const token = 'SeCrEtUpLoAdToKeN0123456789abcdefghijklmnop';
    // The sheet listens only once its permission check has answered, so
    // the shake must wait for that answer. Listen before the page loads.
    const allowed = page.waitForResponse((r) =>
      r.url().endsWith('/api/report'),
    );
    await page.goto(`${OWNER_BASE}/upload/${token}`);
    await expect(
      page.getByRole('heading', { name: 'This link does not work' }),
    ).toBeVisible();

    // An error the page threw a moment before the shake. The sheet keeps it.
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('the upload froze at 0%');
      });
    });
    expect(await (await allowed).json()).toEqual({ enabled: true });

    await shake(page);
    const sheet = page.locator('[data-report-sheet]');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Report a problem');
    await expect(sheet).toContainText('/upload/[token]');
    await expect(sheet).not.toContainText(token);

    const send = sheet.getByRole('button', { name: 'Send report' });
    await expect(send).toBeDisabled();
    await sheet
      .getByLabel('What went wrong?')
      .fill('The upload page sat at Sending 0% and nothing happened.');
    await send.click();

    await expect(sheet.locator('[data-report-link]')).toBeVisible();
    await expect(sheet).toContainText('Report sent');

    const { issues } = (await (
      await request.get(`${GITHUB}/__issues`)
    ).json()) as {
      issues: { title: string; body: string; labels: string[] }[];
    };
    const filed = issues.find((i) => i.title.startsWith('[site report]'));
    expect(filed, JSON.stringify(issues)).toBeTruthy();
    expect(filed!.title).toContain('The upload page sat at Sending 0%');
    expect(filed!.labels).toEqual(['site-report', 'report:bug']);
    expect(filed!.body).toContain('/upload/[token]');
    expect(filed!.body).toContain('the upload froze at 0%');
    expect(filed!.body).not.toContain(token);
  });

  test('?report=1 opens the sheet without a shake, and an idea is labelled as one', async ({
    page,
    request,
  }) => {
    await page.setExtraHTTPHeaders({ cookie: sessionCookie(OWNER) });
    await request.post(`${GITHUB}/__reset`);

    await page.goto(`${OWNER_BASE}/?report=1`);
    const sheet = page.locator('[data-report-sheet]');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('radio', { name: 'Idea' }).click();
    await expect(sheet).toContainText('Suggest an idea');
    await sheet
      .getByLabel('What do you want?')
      .fill('A button to open this sheet on a laptop.');
    await sheet.getByRole('button', { name: 'Send report' }).click();
    await expect(sheet.locator('[data-report-link]')).toBeVisible();

    const { issues } = (await (
      await request.get(`${GITHUB}/__issues`)
    ).json()) as {
      issues: { title: string; labels: string[] }[];
    };
    expect(
      issues.find((i) => i.title.includes('A button to open this sheet'))
        ?.labels,
    ).toEqual(['site-report', 'report:idea']);
  });
});
