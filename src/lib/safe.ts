import 'server-only';

import { cache } from 'react';
import { isDatabaseConfigured } from '@/db/client';

/**
 * Whether this render is kept in the page cache. One object per request:
 * React's `cache` is scoped to the server render, so a page and the page
 * foot beside it share it. `cacheablePage` in `src/lib/page-cache.ts` sets
 * it.
 */
const render = cache(() => ({ cached: false }));

/** Called by `cacheablePage`. Read the note in `safeRead` for the effect. */
export function markCachedRender(): void {
  render().cached = true;
}

/**
 * Run a database read, returning a fallback if the database is unreachable
 * or unconfigured.
 *
 * A fresh clone with no DATABASE_URL should render a page explaining how to
 * connect one, not a stack trace — and a transient Neon blip on one panel of
 * a recipe page should not take down the whole page. Failures are logged so
 * they stay visible in the platform logs rather than being swallowed.
 *
 * In a render that goes into the page cache, a failed read throws instead.
 * The notice would otherwise be kept and served to every reader for a day.
 * A thrown render is not kept: the next request renders the page again.
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
    if (render().cached) throw error;
    return { data: fallback, configured: true, failed: true };
  }
}
