/**
 * Apply committed migrations to the database in DATABASE_URL.
 *
 *   pnpm db:migrate
 *
 * Uses the drizzle-orm migrator rather than `drizzle-kit push`: push diffs
 * the live schema and will silently drop columns it thinks are unused.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  const db = drizzle(neon(url));
  console.log('Applying migrations from ./drizzle …');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
