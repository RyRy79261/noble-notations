import type { MetadataRoute } from 'next';
import { site } from '@/lib/site';
import { listArchive } from '@/lib/archive';
import {
  listExperiments,
  listIngredients,
  listRecipes,
  listCategories,
  listScienceIndex,
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
  const [recipes, taxonomy, ingredients, experiments, science, archive] =
    await Promise.all([
      safeRead(() => listRecipes({ limit: 5000 }), []),
      safeRead(() => listCategories(), []),
      safeRead(listIngredients, []),
      safeRead(listExperiments, []),
      safeRead(listScienceIndex, {
        studies: [],
        mechanisms: [],
        research: [],
      }),
      listArchive(),
    ]);

  // The recipes that have at least one run, so `/recipes/<slug>/batch-logs`
  // is listed only where it holds something. A run with no recipe has no
  // address under one — K-01 — and contributes nothing here.
  const recipesWithRuns = [
    ...new Set(
      experiments.data
        .map((experiment) => experiment.recipe?.slug)
        .filter((slug): slug is string => Boolean(slug)),
    ),
  ].sort();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${site.url}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${site.url}/recipes`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${site.url}/cuisines`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${site.url}/science`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${site.url}/classes`, changeFrequency: 'monthly', priority: 0.6 },
    {
      url: `${site.url}/ingredients`,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${site.url}/batch-logs`,
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
            : `${site.url}/classes/${term.categoryType}/${term.slug}`,
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
    // A study is a second view of a recipe, not a duplicate of it: the
    // reasoning is here and the method is at `/recipes/<slug>`, and each
    // page names itself as its own canonical. They are listed rather than
    // hidden — omitting a self-canonical page from the sitemap does not
    // resolve a duplicate, it only leaves the page uncrawled.
    ...science.data.studies.map((study) => ({
      url: `${site.url}/science/${study.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
    ...recipesWithRuns.map((slug) => ({
      url: `${site.url}/recipes/${slug}/batch-logs`,
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    })),
    // A run has one canonical address and it depends on the data: a run
    // that names a recipe lives under that recipe, and a run that names
    // none lives at the top level. `/batch-logs/<slug>` answers for both,
    // but it redirects in the first case, so listing it here would put a
    // redirect in the sitemap. See D-01.
    ...experiments.data.map((experiment) => ({
      url: experiment.recipe
        ? `${site.url}/recipes/${experiment.recipe.slug}/batch-logs/${experiment.slug}`
        : `${site.url}/batch-logs/${experiment.slug}`,
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
