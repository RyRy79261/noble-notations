import 'server-only';

/**
 * Database access.
 *
 * Two axes, both resolved from DATABASE_URL:
 *
 * **Driver.** A `*.neon.tech` host uses Neon's serverless drivers; anything
 * else uses node-postgres over plain TCP. That second path is what makes
 * `docker run postgres` (or a local install) a working development database
 * — the Neon drivers speak to Neon's HTTP and WebSocket proxies and cannot
 * talk to an ordinary Postgres.
 *
 * **Reads vs writes.** On Neon, reads go over the HTTP driver (one round
 * trip, no connection setup, ideal for page renders) and writes go over the
 * WebSocket pool, because `drizzle-orm/neon-http` throws on `transaction()`
 * and creating a recipe touches eight tables that must land together.
 * node-postgres does both from one pool.
 *
 * Everything is a lazy singleton, so importing this module has no side
 * effects and does not require DATABASE_URL — the module graph is walked at
 * build time long before a query runs.
 */
import { neon, neonConfig, Pool as NeonPool } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNeonPool } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { Pool as NodePool } from 'pg';
import * as schema from './schema';

export type Schema = typeof schema;

/**
 * The common surface of the three drizzle clients. They differ in their
 * transaction generics, which callers never name, so the query layer is
 * written against the shared shape.
 */
type AnyDatabase = ReturnType<typeof drizzleNodePg<Schema>>;
export type Database = AnyDatabase;
export type TransactionClient = Parameters<
  Parameters<AnyDatabase['transaction']>[0]
>[0];

function requireUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set — cannot connect. Copy .env.example to ' +
        '.env.local and fill it in, or add the Neon integration on Vercel.',
    );
  }
  return url;
}

function isNeon(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}

let readDb: Database | null = null;

function readClient(): Database {
  if (readDb) return readDb;
  const url = requireUrl();
  readDb = isNeon(url)
    ? (drizzleHttp(neon(url), { schema }) as unknown as Database)
    : (drizzleNodePg(nodePool(), { schema }) as unknown as Database);
  return readDb;
}

/** Read path. Use `withTransaction` for anything writing more than one row. */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const client = readClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

let neonPool: NeonPool | null = null;
let pgPool: NodePool | null = null;

function nodePool(): NodePool {
  if (!pgPool) pgPool = new NodePool({ connectionString: requireUrl() });
  return pgPool;
}

function neonWritePool(): NeonPool {
  if (neonPool) return neonPool;
  // Node 22 ships a global WebSocket; older runtimes need the `ws` polyfill.
  if (
    typeof globalThis.WebSocket === 'undefined' &&
    !neonConfig.webSocketConstructor
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    neonConfig.webSocketConstructor = require('ws');
  }
  neonPool = new NeonPool({ connectionString: requireUrl() });
  return neonPool;
}

/**
 * Run `fn` inside a real Postgres transaction, rolling back on throw.
 *
 * Every multi-table write goes through here. A recipe whose revision landed
 * but whose ingredients did not is worse than no recipe at all, because the
 * site would render it as an empty dish.
 */
export async function withTransaction<T>(
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  const url = requireUrl();
  const client = isNeon(url)
    ? (drizzleNeonPool(neonWritePool(), { schema }) as unknown as Database)
    : (drizzleNodePg(nodePool(), { schema }) as unknown as Database);
  return client.transaction(fn as (tx: TransactionClient) => Promise<T>);
}

/** True when a database is configured, so pages can degrade instead of crash. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export { schema };
