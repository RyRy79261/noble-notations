import Link from 'next/link';
import { listRecipes, listCategories, getStats } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { site, CATEGORY_TYPE_LABELS } from '@/lib/site';
import { RecipeGrid } from '@/components/recipe-card';
import { TermTag } from '@/components/tags';
import { DatabaseNotice } from '@/components/database-notice';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [stats, recent, categories] = await Promise.all([
    safeRead(getStats, {
      recipes: 0,
      revisions: 0,
      ingredients: 0,
      terms: 0,
      notes: 0,
      experiments: 0,
    }),
    safeRead(() => listRecipes({ limit: 6 }), []),
    safeRead(() => listCategories(), []),
  ]);

  const byFacet = new Map<string, typeof categories.data>();
  for (const term of categories.data) {
    const list = byFacet.get(term.categoryType) ?? [];
    list.push(term);
    byFacet.set(term.categoryType, list);
  }

  return (
    <div className="page">
      <header className="hero">
        <h1>{site.name}</h1>
        <p>
          This is a store of recipes, ingredients, techniques and batch logs.
          Each recipe has versions. You{' '}
          <strong>make a recipe better in steps</strong>. You do not write it
          again from the start each time.
        </p>
        <div className="row" style={{ marginTop: '1rem' }}>
          <Link href="/search" className="button-primary">
            Search the repository
          </Link>
          <Link href="/connect" className="button-secondary">
            Connect via MCP
          </Link>
        </div>
      </header>

      {!stats.configured || stats.failed ? (
        <DatabaseNotice failed={stats.failed} />
      ) : (
        <div className="stats">
          {(
            [
              ['recipes', 'Recipes'],
              ['revisions', 'Revisions'],
              ['ingredients', 'Ingredients'],
              ['terms', 'Tags'],
              ['notes', 'Notes'],
              ['experiments', 'Experiments'],
            ] as const
          ).map(([key, label]) => (
            <div className="stat" key={key}>
              <div className="value">{stats.data[key]}</div>
              <div className="label">{label}</div>
            </div>
          ))}
        </div>
      )}

      {recent.data.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Recently revised</h2>
            <Link href="/recipes">All recipes →</Link>
          </div>
          <RecipeGrid recipes={recent.data} />
        </section>
      ) : null}

      {byFacet.size > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Browse by classification</h2>
            <Link href="/categories">All categories →</Link>
          </div>
          {[...byFacet.entries()].map(([facet, terms]) => (
            <div className="facet-block" key={facet}>
              <h3>{CATEGORY_TYPE_LABELS[facet] ?? facet}</h3>
              <div className="row">
                {terms.slice(0, 14).map((term) => (
                  <TermTag key={term.id} term={term} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="section">
        <div className="section-head">
          <h2>How this works</h2>
        </div>
        <div className="grid">
          <article className="card">
            <h3>Revisions, not rewrites</h3>
            <p>
              A recipe has a name that does not change. Its ingredients and
              steps belong to a version. You cannot change a version after you
              make it. Each version records <em>why</em> you made it. The record
              of how a dish became good is the most useful part.
            </p>
          </article>
          <article className="card">
            <h3>Referential by design</h3>
            <p>
              Each ingredient is one record. It is not free text on a page. This
              lets you ask &ldquo;show all dishes with gochujang&rdquo; and
              &ldquo;what can replace tandoori masala&rdquo;.
            </p>
          </article>
          <article className="card">
            <h3>Written to by an agent</h3>
            <p>
              An <Link href="/connect">MCP connector</Link> lets a Claude
              conversation search this store and add versions to it. An
              improvement that you make in a chat comes here. It is not lost.
            </p>
          </article>
          <article className="card">
            <h3>The archive is kept</h3>
            <p>
              The <Link href="/archive">Markdown archive</Link> keeps each old
              note exactly as it was. The database also writes back to Markdown.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
