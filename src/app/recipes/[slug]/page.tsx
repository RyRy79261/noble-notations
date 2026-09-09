import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getRecipeBySlug } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { RecipeDetail } from '@/components/recipe-detail';
import { DatabaseNotice } from '@/components/database-notice';
import { recipeJsonLd } from '@/lib/jsonld';
import { JsonLd } from '@/components/json-ld';
import { PageHead } from '@/components/f/page-head';
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
    alternates: {
      canonical,
      // Advertise the Markdown twin, so a reader that wants the recipe
      // without the page around it does not have to guess the address.
      types: { 'text/markdown': `${canonical}.md` },
    },
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
    // R-STA-01 and R-STA-02. The document kicker still names the screen a
    // reader asked for, so the notice arrives on a page and not on a blank.
    return (
      <>
        <PageHead
          left={<span className="uppercase">Recipes · {slug}</span>}
          leftNarrow={<span className="uppercase">{slug}</span>}
          right={<span className="uppercase">Unavailable</span>}
        />
        <div className="flex w-full flex-col items-start gap-5 px-4 pt-5.5 pb-12 shell:px-15 shell:pt-8.5 shell:pb-18">
          <h1 className="m-0 text-40 leading-105 font-serif font-medium tracking-display text-ink shell:text-48 shell:leading-105">
            {slug}
          </h1>
          <DatabaseNotice failed={failed} />
        </div>
      </>
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
