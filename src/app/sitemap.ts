import type { MetadataRoute } from 'next';
import { site } from '@/lib/site';
import { listArchive } from '@/lib/archive';
import {
  listExperiments,
  listIngredients,
  listRecipes,
  listCategories,
} from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';

export const dynamic = 'force-dynamic';

/**
 * The sitemap is generated per request rather than at build time: recipes
 * arrive through the MCP connector between deploys, and a build-time sitemap
 * would go stale the moment one did.
 *
 * `/connect` is deliberately absent. It is noindex — only one address can
 * approve a connector, so a search result for it leads to a 403 for
 * everyone else — and listing a noindex page in a sitemap is a
 * contradiction that crawlers report as an error.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [recipes, taxonomy, ingredients, experiments, archive] =
    await Promise.all([
      safeRead(() => listRecipes({ limit: 5000 }), []),
      safeRead(() => listCategories(), []),
      safeRead(listIngredients, []),
      safeRead(listExperiments, []),
      listArchive(),
    ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${site.url}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${site.url}/recipes`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${site.url}/cuisines`, changeFrequency: 'monthly', priority: 0.7 },
    {
      url: `${site.url}/categories`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${site.url}/ingredients`,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${site.url}/experiments`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    { url: `${site.url}/archive`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${site.url}/search`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  return [
    ...staticPages,
    ...recipes.data.map((recipe) => ({
      url: `${site.url}/recipes/${recipe.slug}`,
      lastModified: new Date(recipe.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...taxonomy.data
      .filter((term) => term.recipeCount > 0)
      .map((term) => ({
        url:
          term.categoryType === 'cuisine'
            ? `${site.url}/cuisines/${term.slug}`
            : `${site.url}/categories/${term.categoryType}/${term.slug}`,
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      })),
    ...ingredients.data
      .filter((ingredient) => ingredient.recipeCount > 0)
      .map((ingredient) => ({
        url: `${site.url}/ingredients/${ingredient.slug}`,
        changeFrequency: 'monthly' as const,
        priority: 0.4,
      })),
    ...experiments.data.map((experiment) => ({
      url: `${site.url}/experiments/${experiment.slug}`,
      changeFrequency: 'yearly' as const,
      priority: 0.4,
    })),
    ...archive.map((entry) => ({
      url: `${site.url}/archive/${entry.segments.join('/')}`,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];
}
