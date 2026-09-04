/**
 * /llms.txt — the map an agent reads before it starts fetching.
 *
 * The sitemap lists every URL and says nothing about any of them. This says
 * what the site is, what shape the data has, and which few addresses answer
 * most questions, in the order a reader needs them: what this is, how to
 * read a recipe, then the recipes themselves.
 *
 * It is built per request for the same reason the sitemap is: recipes
 * arrive through the MCP connector between deploys.
 *
 * The last section is the important one. An agent that only reads this file
 * will scrape pages one at a time; an agent that connects over MCP can
 * search, and can add a revision instead of writing a new recipe somewhere
 * else. Pointing at the connector here is what turns a reader into a
 * contributor.
 */
import { site } from '@/lib/site';
import {
  listCategories,
  listIngredients,
  listRecipes,
} from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [recipes, categories, ingredients] = await Promise.all([
    safeRead(() => listRecipes({ limit: 500 }), []),
    safeRead(() => listCategories(), []),
    safeRead(listIngredients, []),
  ]);

  const lines: string[] = [
    `# ${site.name}`,
    '',
    `> ${site.description}`,
    '',
    'A recipe here has a stable address and a history. Its ingredients and',
    'steps belong to a numbered revision, and every revision records why it',
    'exists. Nothing is edited in place.',
    '',
    'Add `.md` to any recipe URL to get the recipe as Markdown, without the',
    `page around it. For example ${site.url}/recipes/<slug>.md`,
    '',
  ];

  if (recipes.data.length > 0) {
    lines.push('## Recipes', '');
    for (const recipe of recipes.data) {
      const summary = recipe.summary ?? recipe.subtitle ?? '';
      lines.push(
        `- [${recipe.title}](${site.url}/recipes/${recipe.slug}.md)` +
          (summary ? `: ${summary}` : ''),
      );
    }
    lines.push('');
  }

  lines.push(
    '## Indexes',
    '',
    `- [All recipes](${site.url}/recipes): every recipe, newest first.`,
    `- [Cuisines](${site.url}/cuisines): recipes grouped by where the dish comes from.`,
    `- [Categories](${site.url}/categories): every tag, grouped by category type, each with an explanation.`,
    `- [Ingredients](${site.url}/ingredients): the canonical ingredient list, with aliases and substitutes.`,
    `- [Experiments](${site.url}/experiments): recorded runs of a revision, with measurements.`,
    `- [Archive](${site.url}/archive): the notes that predate the database, verbatim.`,
    `- [Search](${site.url}/search?q=): free text, ingredient and tag search.`,
    `- [Sitemap](${site.url}/sitemap.xml): every URL.`,
    '',
  );

  if (categories.data.length > 0 || ingredients.data.length > 0) {
    lines.push('## Size', '');
    lines.push(`- Recipes: ${recipes.data.length}`);
    lines.push(`- Tags: ${categories.data.length}`);
    lines.push(`- Ingredients: ${ingredients.data.length}`);
    lines.push('');
  }

  lines.push(
    '## For agents that can connect',
    '',
    'This site is also an MCP server. Connecting gives you search and the',
    'ability to add a revision to a recipe, which is better than writing a',
    'second copy of a recipe that already exists.',
    '',
    `- [Connect](${site.url}/connect): how to add the connector.`,
    `- MCP endpoint: ${site.url}/api/mcp/mcp`,
    '- Call `get_started` first. It explains the data model and the rules.',
    '',
  );

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=300',
    },
  });
}
