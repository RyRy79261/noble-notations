import Link from 'next/link';
import { KIND_LABELS } from '@/lib/site';
import type { RecipeSummaryView } from '@/lib/queries/read';
import { TermList } from './tags';

export function RecipeCard({ recipe }: { recipe: RecipeSummaryView }) {
  return (
    <article className="card">
      <div className="row" style={{ gap: '0.5rem' }}>
        {recipe.kind !== 'recipe' ? (
          <span className="badge">
            {KIND_LABELS[recipe.kind] ?? recipe.kind}
          </span>
        ) : null}
        {recipe.revisionNumber > 1 ? (
          <span className="badge">rev {recipe.revisionNumber}</span>
        ) : null}
      </div>
      <h3>
        <Link href={`/recipes/${recipe.slug}`}>{recipe.title}</Link>
      </h3>
      {recipe.subtitle ? <p className="faint">{recipe.subtitle}</p> : null}
      {recipe.summary ? <p>{truncate(recipe.summary, 160)}</p> : null}
      <TermList terms={recipe.terms} limit={4} />
    </article>
  );
}

export function RecipeGrid({ recipes }: { recipes: RecipeSummaryView[] }) {
  if (recipes.length === 0) {
    return <p className="empty">Nothing here yet.</p>;
  }
  return (
    <div className="grid">
      {recipes.map((recipe) => (
        <RecipeCard key={recipe.slug} recipe={recipe} />
      ))}
    </div>
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}
