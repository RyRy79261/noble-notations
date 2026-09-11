import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { TOKEN_FILE } from './helpers';

/**
 * Rebuild the test database from nothing before the suite runs.
 *
 * Dropping the schema rather than truncating means a stale migration or a
 * column that only exists locally cannot make a broken build look green.
 * The seed then goes in through the real `pnpm ingest`, so the ingest path
 * is itself under test — if it breaks, every content assertion fails loudly
 * instead of the suite quietly testing an empty site.
 *
 * Self-sufficient on purpose: it migrates and seeds regardless of whether
 * Playwright happens to start the web server before or after this runs, and
 * the server reads the database per request so a mid-flight reset is safe.
 */
async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is required to run the e2e suite. Point it at a scratch ' +
        'database — global-setup destroys its contents.',
    );
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    // The `drizzle` schema holds the migration journal. Dropping `public`
    // alone leaves that journal intact, so the migrator concludes every
    // migration is already applied and creates nothing — the suite then
    // fails on a missing table rather than on anything real.
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }

  const run = (script: string) =>
    execFileSync('pnpm', [script], {
      stdio: 'inherit',
      env: process.env,
    });

  run('db:migrate');
  run('ingest');

  // Mint the bearer tokens the MCP tests use. Two of them: one that can
  // write, and one read-only, because "a read token is refused a write
  // tool" is the assertion that proves scopes are enforced per call rather
  // than only at authorization.
  const mint = (scope?: string, user?: string) => {
    const args = ['mcp:token', '--name', 'e2e'];
    if (scope) args.push('--scope', scope);
    if (user) args.push('--user', user);
    const out = execFileSync('pnpm', args, {
      encoding: 'utf8',
      env: process.env,
    });
    /*
     * pnpm prefixes its own banner lines; the JSON is the last object, and
     * it is the only one that starts a line.
     *
     * This took the FIRST brace and cost four separate readers a run each.
     * On a Node below the engine this package requires, pnpm prints
     * `WARN Unsupported engine: wanted: {"node":">=24.0.0"}` before anything
     * else — that brace won, and the suite died in setup with
     * `SyntaxError: Unexpected non-whitespace character after JSON at
     * position 20`, which says nothing about Node at all. `mint-mcp-token`
     * prints its object with `JSON.stringify(…, null, 2)`, so the opening
     * brace is at the start of its own line and a warning's inline one is
     * not.
     */
    const start = out.lastIndexOf('\n{');
    const json = start === -1 ? out.slice(out.indexOf('{')) : out.slice(start);
    return (JSON.parse(json) as { accessToken: string }).accessToken;
  };

  mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  writeFileSync(
    TOKEN_FILE,
    JSON.stringify(
      {
        readWrite: mint(),
        readOnly: mint('noble-notations:read'),
        // A third principal. `report_issue` keeps a per-process burst
        // counter keyed by user id, so the degraded-path tests get their own
        // budget rather than spending the one the healthy filings use.
        degraded: mint(undefined, 'e2e-degraded'),
      },
      null,
      2,
    ),
  );
}

export default globalSetup;
