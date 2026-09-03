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
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

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

  webServer: {
    // `pnpm build` migrates first, so the scratch database gets its schema
    // here rather than needing a separate step.
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
