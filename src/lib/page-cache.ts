import 'server-only';

import { connection } from 'next/server';
import { isReadCacheEnabled } from '@/lib/queries/cached';
import { markCachedRender } from '@/lib/safe';

/**
 * The public read pages, served from the page cache.
 *
 * WHY THIS EXISTS. `cached.ts` stopped the pages waking the database, but
 * every page was still `force-dynamic`, so every request rendered the whole
 * page again: the recipe, its Markdown, its JSON-LD. Most of those requests
 * are crawlers, and a page only changes when somebody writes. Vercel bills
 * that render as Fluid Active CPU. Now the page itself is cached (ISR,
 * incremental static regeneration: the server renders a page once, keeps
 * the HTML, and renders it again only when it is told to).
 *
 * WHAT CLEARS IT. The same thing that clears the reads. Each page reads
 * through `cached.ts`, so each rendered page carries `SITE_DATA_TAG`, and
 * the committed write that expires the tag (`withTransaction`, in
 * `src/db/client.ts`) expires every page that read it. A page that says
 * "not found" carries the tag too, so a recipe made after a reader asked
 * for its address still appears. Each page also exports
 * `revalidate = 86400`, one day — the same backstop `cached.ts` keeps for a
 * write that does not pass through Next.js (`pnpm ingest`). Next.js reads
 * that export at build time and accepts only a literal number, so every
 * page writes it out instead of importing it.
 *
 * WHEN IT IS ON. When the read cache is on (`isReadCacheEnabled`), decided
 * at BUILD time: on Vercel, unless `NOBLE_READ_CACHE=off`, and elsewhere
 * only with `NOBLE_READ_CACHE=on`. With it off, `cacheablePage` calls
 * `connection()`, which tells the build that the page reads the request,
 * and the page renders on every request as it did before. That is what
 * `pnpm dev`, CI's build and the e2e suite's main server get: the suite
 * writes to its database directly, and a second server reads the same
 * build with no database at all, so neither may see a page another render
 * left behind. `e2e/page-cache.spec.ts` builds the cached site by itself
 * and tests it there.
 *
 * WHO CALLS IT. Each public read page, first thing in its render. Pages
 * that read the request stay dynamic and do not call it: `/search`,
 * `/recipes` and `/list` read `searchParams`, and `/sign-in`, `/connect/*`
 * and `/upload/[token]` are for one person. A route handler cannot use
 * this — see `cacheableRoute`.
 */
export async function cacheablePage(): Promise<void> {
  if (!isReadCacheEnabled()) {
    await connection();
    return;
  }
  markCachedRender();
}

/**
 * The same switch for a route handler (`sitemap.ts`, `/llms.txt`). A
 * handler has no render to mark, so it asks and acts on the answer itself:
 * when this returns true, a read that failed must throw rather than be
 * written into a response that is then kept for a day.
 */
export async function cacheableRoute(): Promise<boolean> {
  if (!isReadCacheEnabled()) {
    await connection();
    return false;
  }
  return true;
}

/**
 * A page with a dynamic segment is cached only if it exports
 * `generateStaticParams`. An empty list renders no page at build — the
 * build needs no database — and renders each address the first time it is
 * asked for. With the cache off the export is absent: a page that calls
 * `connection()` at request time but told the build it was static fails
 * with DYNAMIC_SERVER_USAGE.
 */
export const generateStaticParams = isReadCacheEnabled()
  ? async (): Promise<never[]> => []
  : undefined;
