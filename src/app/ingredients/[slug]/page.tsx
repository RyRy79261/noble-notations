import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getIngredient } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { RecipeGrid } from '@/components/recipe-card';
import { NoteList } from '@/components/notes';
import { DatabaseNotice } from '@/components/database-notice';
import { site } from '@/lib/site';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await safeRead(() => getIngredient(slug), null);
  if (!data) return { title: 'Ingredient not found' };

  const description =
    data.ingredient.description ??
    `${data.ingredient.name} — used in ${data.recipes.length} recipes in the ${site.name} repository.`;

  return {
    title: data.ingredient.name,
    description,
    alternates: { canonical: `/ingredients/${slug}` },
    keywords: [data.ingredient.name, ...data.ingredient.aliases],
    openGraph: {
      type: 'website',
      title: data.ingredient.name,
      description,
      url: `/ingredients/${slug}`,
    },
  };
}

export default async function IngredientPage({ params }: Params) {
  const { slug } = await params;
  const { data, configured, failed } = await safeRead(
    () => getIngredient(slug),
    null,
  );

  if (!configured || failed) {
    return (
      <div className="page">
        <h1>{slug}</h1>
        <DatabaseNotice failed={failed} />
      </div>
    );
  }
  if (!data) notFound();

  const { ingredient, recipes, substitutes, notes } = data;

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link href="/ingredients">Ingredients</Link> / {ingredient.name}
      </div>

      <header className="hero">
        <span className="badge">{ingredient.category.replace(/_/g, ' ')}</span>
        <h1>{ingredient.name}</h1>
        {ingredient.description ? <p>{ingredient.description}</p> : null}
        {ingredient.aliases.length > 0 ? (
          <p className="faint">
            Also known as {ingredient.aliases.join(', ')}.
          </p>
        ) : null}
        {ingredient.densityGPerMl ? (
          <p className="faint">
            Density <span className="num">{ingredient.densityGPerMl}</span> g/ml
            — volume measurements convert to weight.
          </p>
        ) : null}
      </header>

      {substitutes.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Substitutes</h2>
          </div>
          <div className="row">
            {substitutes.map((substitute) => (
              <Link
                className="tag"
                href={`/ingredients/${substitute.slug}`}
                key={substitute.slug}
                title={substitute.note ?? undefined}
              >
                {substitute.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {notes.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Notes</h2>
          </div>
          <NoteList notes={notes} />
        </section>
      ) : null}

      <section className="section">
        <div className="section-head">
          <h2>Used in</h2>
          <span className="faint">{recipes.length}</span>
        </div>
        <RecipeGrid recipes={recipes} />
      </section>
    </div>
  );
}
