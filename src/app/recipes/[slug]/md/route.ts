/**
 * The Markdown twin of a recipe page.
 *
 * Reachable two ways. `/recipes/<slug>.md` is the suffix an agent tries
 * first, and src/proxy.ts rewrites it here; `/recipes/<slug>/md` is the
 * same document under a path that needs no rewrite. Both return the text
 * that `pnpm export` would write, from the same renderer, so the page, the
 * repository copy and this response cannot drift apart.
 *
 * This is not a duplicate of the HTML page for search engines to index —
 * the canonical link points back at the page. robots.txt deliberately
 * leaves it open (see `src/app/robots.ts`): it is the address an agent most
 * wants. It exists so a reader that only wants the recipe does not have to
 * parse a layout to find it.
 *
 * Kept in the page cache like the page it mirrors, and expired by the same
 * write. It used to be `force-dynamic`, so every agent and crawler that
 * fetched it ran a function. See src/lib/page-cache.ts.
 */
import { getRecipeBySlug } from '@/lib/queries/cached';
import { safeRead } from '@/lib/safe';
import { recipeToMarkdown } from '@/lib/markdown/recipe';
import { site } from '@/lib/site';
import { cacheableRoute } from '@/lib/page-cache';

// Cached until a write expires it. See src/lib/page-cache.ts.
export const revalidate = 86400;
export { generateStaticParams } from '@/lib/page-cache';

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const cached = await cacheableRoute();
  const { slug } = await params;
  const {
    data: recipe,
    configured,
    failed,
  } = await safeRead(() => getRecipeBySlug(slug), null);

  // A 503 that is kept would answer for a day after the database is back.
  if (cached && failed) {
    throw new Error(`recipes/${slug}/md: a database read failed`);
  }
  if (!configured || failed) {
    return new Response('The database is not reachable.\n', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  if (!recipe) {
    return new Response(`No recipe with the slug "${slug}".\n`, {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const markdown = recipeToMarkdown(recipe, {
    extraFields: { url: `${site.url}/recipes/${recipe.slug}` },
  });

  const headers: Record<string, string> = {
    'content-type': 'text/markdown; charset=utf-8',
    link: `<${site.url}/recipes/${recipe.slug}>; rel="canonical"`,
  };
  // With the page cache on, Next.js sets the caching headers itself; a
  // hand-written one would cap the cache at five minutes. With it off, the
  // CDN still keeps a copy briefly.
  if (!cached) headers['cache-control'] = 'public, max-age=0, s-maxage=300';

  return new Response(markdown, { headers });
}
