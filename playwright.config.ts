import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * These tests run against a real production build and a real Postgres. The
 * point is the lifecycle — an MCP client writes a recipe, the site serves
 * it, a revision supersedes it — and none of that is meaningful against
 * mocks, so there are none.
 *
 * DATABASE_URL is required and its contents are destroyed: `global-setup`
 * drops the public schema and rebuilds it. Point it at a scratch database,
 * never at one holding anything you want to keep.
 *
 * The exceptions to "no mocks" are the two tools whose effect lands outside
 * this system, and neither is a preference. `report_issue` files a real
 * issue in a real public repository and `upload_image` writes a real object
 * to a real blob store, so the suite must never reach api.github.com or
 * blob.vercel-storage.com. `e2e/github-stub.ts` and `e2e/blob-stub.ts`
 * answer instead, and `GITHUB_API_BASE_URL` and `VERCEL_BLOB_API_URL` on the
 * app server are what make that a property of the network layer rather than
 * of discipline.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/** Fixed rather than allocated, so the app server's env can name it. */
const GITHUB_PORT = Number(process.env.E2E_GITHUB_PORT ?? 3101);

/**
 * The second stub, for the second tool whose effect leaves this system.
 * `upload_image` writes to a real blob store that somebody pays for, so the
 * suite answers the SDK itself — see `e2e/blob-stub.ts`.
 *
 * `+ 6`, and the number is not free. This suite already fixes six ports:
 * 3100 the app, 3101 the GitHub stub, and four that specs start servers on
 * themselves — `+ 2` for the one with no GitHub token,
 * `+ 3` for the consent screen, `+ 4` and `+ 5` for the malformed-GitHub
 * pair. Taking 3102 put this stub under the no-token server, and every test
 * that spoke to it got a 404 from a blob store. Anything new goes above,
 * or is allocated the way `e2e/screen-degraded.spec.ts` allocates one.
 * `+ 7` is taken since: `e2e/site-report.spec.ts` starts the owner's server
 * there.
 */
const BLOB_PORT = Number(
  process.env.E2E_BLOB_PORT ?? Number(process.env.E2E_PORT ?? 3100) + 6,
);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // The suite shares one database, and the MCP tests write to it. Running
  // files in parallel would let one test's revision land inside another
  // test's assertion about revision counts.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  outputDir: './e2e/.results',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The tooltips under test are hover-driven, and the stylesheet hides
    // them entirely under `@media (hover: none)`. A touch-emulating context
    // would make those assertions vacuously fail.
    hasTouch: false,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Sandboxes and CI images often ship a Chromium that does not match
        // the revision this Playwright expects. Point at it with
        // PLAYWRIGHT_CHROMIUM_PATH rather than hardcoding a path that only
        // exists on one machine; unset, Playwright resolves its own.
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? {
              launchOptions: {
                executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
              },
            }
          : {}),
      },
    },
  ],

  webServer: [
    // The stub goes first so it is listening before the app server that
    // points at it ever starts.
    {
      command: `pnpm exec tsx e2e/github-stub.ts --port ${GITHUB_PORT}`,
      url: `http://127.0.0.1:${GITHUB_PORT}/__health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `pnpm exec tsx e2e/blob-stub.ts --port ${BLOB_PORT}`,
      url: `http://127.0.0.1:${BLOB_PORT}/__health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // `pnpm build` migrates first, so the scratch database gets its schema
      // here rather than needing a separate step.
      command: `pnpm build && pnpm start -p ${PORT}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
      // `env` merges into the inherited environment, so DATABASE_URL still
      // flows through.
      env: {
        // Registering `report_issue` at all needs a token. This one is not a
        // credential, and it must never be replaced with one: if the base
        // URL below were ever misconfigured, GitHub answers 401 to this and
        // files nothing. That is the second line of defence behind the stub.
        GITHUB_ISSUE_TOKEN: 'stub-token-not-a-real-credential',
        GITHUB_API_BASE_URL: `http://127.0.0.1:${GITHUB_PORT}`,
        // The commit is the one fact a memory cannot corrupt, because the
        // server supplies it and the agent cannot. Two of the three are set
        // so a test can assert they reach the issue; VERCEL_ENV is left
        // unset on purpose, so the same test also covers the branch that
        // writes an absent fact down as absent instead of omitting the row.
        VERCEL_GIT_COMMIT_SHA: '65d93a6e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e',
        VERCEL_GIT_COMMIT_REF: 'e2e-report-issue',
        // Registering `upload_image` at all needs a token. This one is not
        // a credential, and the base URL beside it is what guarantees the
        // suite never reaches the real store: with it pointed at the stub,
        // a token that did work would still write nowhere.
        //
        // It is SHAPED like a real one — `vercel_blob_rw_<store>_<secret>` —
        // because the upload link signs client tokens with it, and the SDK
        // reads the store id out of the third segment before it signs.
        BLOB_READ_WRITE_TOKEN:
          'vercel_blob_rw_stubstore_notarealcredentialnotarealcredential',
        VERCEL_BLOB_API_URL: `http://127.0.0.1:${BLOB_PORT}`,
        // The same address for the BROWSER. The upload page writes the file
        // to the store itself, and the SDK in the client bundle reads this
        // one, inlined at build time. `next.config.ts` reads it too, to put
        // the stub in the page's `connect-src`.
        NEXT_PUBLIC_VERCEL_BLOB_API_URL: `http://127.0.0.1:${BLOB_PORT}`,
      },
    },
  ],
});
