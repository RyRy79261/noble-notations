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
  const mint = (scope?: string) => {
    const args = ['mcp:token', '--name', 'e2e'];
    if (scope) args.push('--scope', scope);
    const out = execFileSync('pnpm', args, {
      encoding: 'utf8',
      env: process.env,
    });
    // pnpm prefixes its own banner lines; the JSON is the last object.
    const start = out.indexOf('{');
    return (JSON.parse(out.slice(start)) as { accessToken: string })
      .accessToken;
  };

  mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  writeFileSync(
    TOKEN_FILE,
    JSON.stringify(
      {
        readWrite: mint(),
        readOnly: mint('noble-notations:read'),
      },
      null,
      2,
    ),
  );
}

export default globalSetup;
