import { site } from '@/lib/site';
import { formatQuantity } from '@/lib/domain/units';
import type { RecipeView } from '@/lib/queries/read';

/**
 * schema.org/Recipe structured data.
 *
 * Only emitted for entries that are actually recipes — tagging a research
 * essay as a Recipe with no ingredients or instructions is the kind of thing
 * that gets rich results revoked, so those get an Article instead.
 */
export function recipeJsonLd(recipe: RecipeView): Record<string, unknown> {
  const url = `${site.url}/recipes/${recipe.slug}`;

  if (recipe.kind === 'research' || recipe.steps.length === 0) {
    return {
      '@context': 'https://schema.org',
      '@type': 'Article',
      '@id': url,
      headline: recipe.title,
      description: recipe.summary ?? recipe.subtitle ?? undefined,
      url,
      datePublished: recipe.createdAt,
      dateModified: recipe.updatedAt,
      author: { '@type': 'Person', name: site.author },
      publisher: { '@type': 'Organization', name: site.name },
      ...(recipe.heroImageUrl ? { image: recipe.heroImageUrl } : {}),
    };
  }

  const cuisines = recipe.terms
    .filter((t) => t.facet === 'cuisine')
    .map((t) => t.label);
  const courses = recipe.terms
    .filter((t) => t.facet === 'course')
    .map((t) => t.label);
  const techniques = recipe.terms
    .filter((t) => t.facet === 'technique')
    .map((t) => t.label);

  return {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    '@id': url,
    name: recipe.title,
    description: recipe.summary ?? recipe.subtitle ?? undefined,
    url,
    datePublished: recipe.createdAt,
    dateModified: recipe.updatedAt,
    author: { '@type': 'Person', name: site.author },
    ...(recipe.heroImageUrl ? { image: recipe.heroImageUrl } : {}),
    ...(cuisines.length ? { recipeCuisine: cuisines } : {}),
    ...(courses.length ? { recipeCategory: courses } : {}),
    ...(techniques.length ? { keywords: techniques.join(', ') } : {}),
    ...(recipe.revision.servings
      ? { recipeYield: String(recipe.revision.servings) }
      : recipe.revision.yieldQuantity
        ? {
            recipeYield: `${formatQuantity(recipe.revision.yieldQuantity)} ${
              recipe.revision.yieldUnit ?? ''
            }`.trim(),
          }
        : {}),
    ...(recipe.revision.totalTimeMinutes
      ? { totalTime: `PT${recipe.revision.totalTimeMinutes}M` }
      : {}),
    ...(recipe.revision.activeTimeMinutes
      ? { prepTime: `PT${recipe.revision.activeTimeMinutes}M` }
      : {}),
    recipeIngredient: recipe.ingredients.map((line) => line.rawText),
    recipeInstructions: recipe.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      text: step.instruction,
      ...(step.phase ? { name: step.phase } : {}),
    })),
  };
}
