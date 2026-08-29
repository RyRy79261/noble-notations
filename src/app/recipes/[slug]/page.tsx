import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getRecipeBySlug } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { RecipeDetail } from '@/components/recipe-detail';
import { DatabaseNotice } from '@/components/database-notice';
import { recipeJsonLd } from '@/lib/jsonld';
import { JsonLd } from '@/components/json-ld';
import { site } from '@/lib/site';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { data: recipe } = await safeRead(() => getRecipeBySlug(slug), null);
  if (!recipe) return { title: 'Recipe not found' };

  const description =
    recipe.summary ??
    recipe.subtitle ??
    `${recipe.title} — revision ${recipe.revisionNumber} in the ${site.name} repository.`;
  const canonical = `/recipes/${recipe.slug}`;

  return {
    title: recipe.title,
    description,
    alternates: { canonical },
    keywords: recipe.terms.map((term) => term.label),
    openGraph: {
      type: 'article',
      title: recipe.title,
      description,
      url: canonical,
      modifiedTime: recipe.updatedAt,
      publishedTime: recipe.createdAt,
      tags: recipe.terms.map((term) => term.label),
    },
    twitter: { card: 'summary_large_image', title: recipe.title, description },
  };
}

export default async function RecipePage({ params }: Params) {
  const { slug } = await params;
  const {
    data: recipe,
    configured,
    failed,
  } = await safeRead(() => getRecipeBySlug(slug), null);

  if (!configured || failed) {
    return (
      <div className="page">
        <h1>{slug}</h1>
        <DatabaseNotice failed={failed} />
      </div>
    );
  }
  if (!recipe) notFound();

  return (
    <>
      <JsonLd data={recipeJsonLd(recipe)} />
      <RecipeDetail recipe={recipe} isHistorical={false} />
    </>
  );
}
