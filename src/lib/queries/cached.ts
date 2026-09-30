import 'server-only';

import { unstable_cache } from 'next/cache';
import { SITE_DATA_TAG } from '@/db/client';
import * as read from './read';

/**
 * The site's read path: `read.ts`, behind the Next.js data cache.
 *
 * WHY THIS EXISTS. Neon bills for the time a compute is awake, and a compute
 * stays awake for five minutes after its last query. Every page on this site
 * is `force-dynamic`, and the header prefetches nine of them, so one reader
 * opening one page woke the database for five minutes, and a crawler that
 * came back every few minutes kept it awake all day. The data changes only
 * when somebody writes, so a page does not need to ask the database again
 * until then.
 *
 * WHAT CLEARS IT. Every write goes through `withTransaction`, and a
 * committed transaction expires `SITE_DATA_TAG` at once — see
 * `src/db/client.ts`. `revalidate` below is only the backstop for a write
 * that does not pass through a Next.js request, such as `pnpm ingest` from a
 * terminal: that one reaches the site within a day, or at the next deploy.
 *
 * WHO USES IT. Pages, route handlers and the components under them. NOT the
 * MCP tools: an agent writes and then reads back what it wrote, and that
 * read must see the database, not a cache. `src/lib/mcp/tools.ts` imports
 * `read.ts`.
 *
 * WHEN IT IS ON. On Vercel (`VERCEL=1`), unless `NOBLE_READ_CACHE=off`.
 * Anywhere else only with `NOBLE_READ_CACHE=on`. The e2e suite writes to its
 * database directly as well as through the connector, and `pnpm dev` is
 * used next to `pnpm ingest`; both expect the next page load to show what
 * the database holds.
 *
 * The key carries the deployment, so a deploy — which may have migrated the
 * schema and changed the shape of a result — never reads an entry an older
 * build wrote. The Vercel data cache outlives deployments; this does not.
 */

export { SITE_DATA_TAG };

/** One day, in seconds. See "What clears it" above. */
const BACKSTOP_SECONDS = 86_400;

export function isReadCacheEnabled(): boolean {
  const setting = process.env.NOBLE_READ_CACHE?.trim().toLowerCase();
  if (setting === 'off') return false;
  if (setting === 'on') return true;
  return process.env.VERCEL === '1';
}

/*
 * The data cache stores a result with `JSON.stringify` and gives back
 * `JSON.parse`. That turns a Date into a string and a Map into `{}`, and a
 * page that calls `.getTime()` on the first or `.get()` on the second then
 * throws. So a result is packed into plain JSON with those types marked, and
 * unpacked on the way out. `__t` marks a packed value; a plain object that
 * happens to own a `__t` key is wrapped, so it cannot be mistaken for one.
 */
type Packed =
  null | boolean | number | string | Packed[] | { [key: string]: Packed };

const TAG = '__t';

export function pack(value: unknown): Packed {
  if (value === undefined) return { [TAG]: 'U' };
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'bigint') return { [TAG]: 'B', v: value.toString() };
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return { [TAG]: 'N', v: String(value) };
    }
    return value as Packed;
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return { [TAG]: 'D', v: Number.isNaN(time) ? null : time };
  }
  if (value instanceof Map) {
    return {
      [TAG]: 'M',
      v: [...value].map(([k, v]) => [pack(k), pack(v)]),
    };
  }
  if (value instanceof Set) return { [TAG]: 'S', v: [...value].map(pack) };
  if (Array.isArray(value)) return value.map(pack);

  const out: { [key: string]: Packed } = {};
  for (const [k, v] of Object.entries(value)) out[k] = pack(v);
  return TAG in out ? { [TAG]: 'O', v: out } : out;
}

export function unpack(value: Packed): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(unpack);

  if (TAG in value) {
    const v = value.v as Packed;
    switch (value[TAG]) {
      case 'U':
        return undefined;
      case 'B':
        return BigInt(v as string);
      case 'N':
        return Number(v);
      case 'D':
        return new Date(v === null ? NaN : (v as number));
      case 'M':
        return new Map(
          (v as Packed[][]).map(([k, x]) => [unpack(k!), unpack(x!)]),
        );
      case 'S':
        return new Set((v as Packed[]).map(unpack));
      case 'O': {
        const out: Record<string, unknown> = {};
        for (const [k, x] of Object.entries(v as Record<string, Packed>)) {
          out[k] = unpack(x);
        }
        return out;
      }
    }
  }

  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(value)) out[k] = unpack(x);
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cached<A extends any[], R>(
  name: string,
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  // Built on first call rather than at module load: the deployment id and
  // the setting are runtime facts, and a module can be evaluated at build.
  let store: ((...args: A) => Promise<Packed>) | null = null;

  return async (...args: A) => {
    if (!isReadCacheEnabled()) return fn(...args);
    store ??= unstable_cache(
      async (...inner: A) => pack(await fn(...inner)),
      // The inner function's source is the same for every read, so the name
      // is what tells two of them apart.
      ['read', name, process.env.VERCEL_DEPLOYMENT_ID ?? 'local'],
      { tags: [SITE_DATA_TAG], revalidate: BACKSTOP_SECONDS },
    );
    let packed: Packed;
    try {
      packed = await store(...args);
    } catch (error) {
      // E469: called where Next.js has no cache to give, which is anywhere
      // outside a request. The read still has to answer.
      if (
        (error as { __NEXT_ERROR_CODE?: string }).__NEXT_ERROR_CODE === 'E469'
      ) {
        return fn(...args);
      }
      throw error;
    }
    return unpack(packed) as R;
  };
}

export type * from './read';

export const buildShoppingList = cached(
  'buildShoppingList',
  read.buildShoppingList,
);
export const getExperiment = cached('getExperiment', read.getExperiment);
export const getImage = cached('getImage', read.getImage);
export const getIngredient = cached('getIngredient', read.getIngredient);
export const getRecipeBySlug = cached('getRecipeBySlug', read.getRecipeBySlug);
export const getRecipeIdentity = cached(
  'getRecipeIdentity',
  read.getRecipeIdentity,
);
export const getScienceStudy = cached('getScienceStudy', read.getScienceStudy);
export const getStats = cached('getStats', read.getStats);
export const getTerm = cached('getTerm', read.getTerm);
export const listCategories = cached('listCategories', read.listCategories);
export const listExperiments = cached('listExperiments', read.listExperiments);
export const listIngredients = cached('listIngredients', read.listIngredients);
export const listRecipes = cached('listRecipes', read.listRecipes);
export const listScienceIndex = cached(
  'listScienceIndex',
  read.listScienceIndex,
);
export const searchExperiments = cached(
  'searchExperiments',
  read.searchExperiments,
);
export const searchNotes = cached('searchNotes', read.searchNotes);
export const searchRecipes = cached('searchRecipes', read.searchRecipes);
