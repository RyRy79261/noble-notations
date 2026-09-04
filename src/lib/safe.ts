import 'server-only';

import { isDatabaseConfigured } from '@/db/client';

/**
 * Run a database read, returning a fallback if the database is unreachable
 * or unconfigured.
 *
 * A fresh clone with no DATABASE_URL should render a page explaining how to
 * connect one, not a stack trace — and a transient Neon blip on one panel of
 * a recipe page should not take down the whole page. Failures are logged so
 * they stay visible in the platform logs rather than being swallowed.
 */
export async function safeRead<T>(
  read: () => Promise<T>,
  fallback: T,
): Promise<{ data: T; configured: boolean; failed: boolean }> {
  if (!isDatabaseConfigured()) {
    return { data: fallback, configured: false, failed: false };
  }
  try {
    return { data: await read(), configured: true, failed: false };
  } catch (error) {
    console.error('[db] read failed', error);
    return { data: fallback, configured: true, failed: true };
  }
}
