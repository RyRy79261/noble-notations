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
 * the canonical link points back at the page, and robots.txt keeps
 * crawlers out of it. It exists so a reader that only wants the recipe
 * does not have to parse a layout to find it.
 */
import { getRecipeBySlug } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { recipeToMarkdown } from '@/lib/markdown/recipe';
import { site } from '@/lib/site';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const {
    data: recipe,
    configured,
    failed,
  } = await safeRead(() => getRecipeBySlug(slug), null);

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

  return new Response(markdown, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      link: `<${site.url}/recipes/${recipe.slug}>; rel="canonical"`,
      'cache-control': 'public, max-age=0, s-maxage=300',
    },
  });
}
