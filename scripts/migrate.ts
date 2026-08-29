/**
 * Apply committed migrations to the database in DATABASE_URL.
 *
 *   pnpm db:migrate
 *
 * Uses the drizzle-orm migrator rather than `drizzle-kit push`: push diffs
 * the live schema without writing a migration file and will drop columns it
 * believes are unused.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { migrate as migrateHttp } from 'drizzle-orm/neon-http/migrator';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { loadEnv } from './env';

loadEnv();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const isNeon = new URL(url).hostname.endsWith('.neon.tech');
  console.log(
    `Applying migrations from ./drizzle via ${isNeon ? 'Neon HTTP' : 'node-postgres'}…`,
  );

  if (isNeon) {
    await migrateHttp(drizzleHttp(neon(url)), {
      migrationsFolder: './drizzle',
    });
  } else {
    const pool = new Pool({ connectionString: url });
    try {
      await migrateNodePg(drizzleNodePg(pool), {
        migrationsFolder: './drizzle',
      });
    } finally {
      await pool.end();
    }
  }

  console.log('Migrations applied.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
