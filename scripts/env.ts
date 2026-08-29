/**
 * Load .env.local for CLI scripts.
 *
 * Next.js does this automatically for the app; scripts run outside it, so
 * without this `pnpm ingest` would fail on a missing DATABASE_URL even
 * though the file is right there. Vercel and CI inject real environment
 * variables and have no such file, hence the silent miss.
 */
export function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(file);
    } catch {
      // Not present — fine.
    }
  }
}
