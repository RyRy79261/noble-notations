import { defineConfig } from 'drizzle-kit';

/**
 * Schema source of truth is src/db/schema.ts; generated SQL is committed
 * under drizzle/ and applied by scripts/migrate.ts.
 *
 * Never use `drizzle-kit push` against a real database here — it diffs
 * without a migration file and will happily drop columns.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  verbose: true,
  strict: true,
});
