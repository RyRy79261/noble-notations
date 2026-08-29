import 'server-only';

/**
 * Database access.
 *
 * Two drivers, deliberately:
 *
 *   `db`              — Neon's HTTP driver. One round trip per query, no
 *                       connection setup, ideal for the read path that every
 *                       page render goes through.
 *   `withTransaction` — Neon's WebSocket pool. The HTTP driver throws on
 *                       `transaction()` ("No transactions support in neon-http
 *                       driver"), and creating a recipe touches eight tables
 *                       that must land together or not at all.
 *
 * Both are lazy singletons so importing this module has no side effects and
 * does not require DATABASE_URL — the module graph is walked at build time
 * long before any query runs.
 */
import { neon, neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import {
  drizzle as drizzlePool,
  type NeonDatabase,
} from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

export type Schema = typeof schema;
export type Database = NeonHttpDatabase<Schema>;
export type TransactionClient = Parameters<
  Parameters<NeonDatabase<Schema>['transaction']>[0]
>[0];

function requireUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set — cannot connect to Neon. Copy .env.example to ' +
        '.env.local and fill it in, or add the Neon integration on Vercel.',
    );
  }
  return url;
}

let httpDb: Database | null = null;

function httpClient(): Database {
  if (!httpDb) httpDb = drizzle(neon(requireUrl()), { schema });
  return httpDb;
}

/** Read path. Use `withTransaction` for anything that writes more than one row. */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const c = httpClient();
    const value = Reflect.get(c, prop, c);
    return typeof value === 'function' ? value.bind(c) : value;
  },
});

let pool: Pool | null = null;

function writePool(): Pool {
  if (pool) return pool;
  // Node 22 has a global WebSocket; older runtimes need the `ws` polyfill.
  // Resolving it lazily keeps `ws` out of environments that never write.
  if (typeof globalThis.WebSocket === 'undefined' && !neonConfig.webSocketConstructor) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    neonConfig.webSocketConstructor = require('ws');
  }
  pool = new Pool({ connectionString: requireUrl() });
  return pool;
}

/**
 * Run `fn` inside a real Postgres transaction. Rolls back on throw.
 *
 * Every multi-table write in this repository goes through here — a recipe
 * whose revision landed but whose ingredients did not is worse than no
 * recipe at all, because the site would render it as an empty dish.
 */
export async function withTransaction<T>(
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  const client = drizzlePool(writePool(), { schema });
  return client.transaction(fn);
}

/** True when a database is configured, so pages can degrade instead of crash. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export { schema };
