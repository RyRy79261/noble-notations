import Link from 'next/link';
import { listRecipes, listTaxonomy, getStats } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { site, FACET_LABELS } from '@/lib/site';
import { RecipeGrid } from '@/components/recipe-card';
import { TermTag } from '@/components/tags';
import { DatabaseNotice } from '@/components/database-notice';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [stats, recent, taxonomy] = await Promise.all([
    safeRead(getStats, {
      recipes: 0,
      revisions: 0,
      ingredients: 0,
      terms: 0,
      notes: 0,
      experiments: 0,
    }),
    safeRead(() => listRecipes({ limit: 6 }), []),
    safeRead(() => listTaxonomy(), []),
  ]);

  const byFacet = new Map<string, typeof taxonomy.data>();
  for (const term of taxonomy.data) {
    const list = byFacet.get(term.facet) ?? [];
    list.push(term);
    byFacet.set(term.facet, list);
  }

  return (
    <div className="page">
      <header className="hero">
        <h1>{site.name}</h1>
        <p>
          A structured repository of recipes, ingredients, techniques and batch
          logs. Every recipe is versioned: it gets{' '}
          <strong>refined across revisions</strong> rather than re-derived from
          scratch each time somebody asks.
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
              ['terms', 'Taxonomy terms'],
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
            <Link href="/taxonomy">Full taxonomy →</Link>
          </div>
          {[...byFacet.entries()].map(([facet, terms]) => (
            <div className="facet-block" key={facet}>
              <h3>{FACET_LABELS[facet] ?? facet}</h3>
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
              A recipe is an identity. Its ingredients and steps belong to an
              immutable revision, and each revision records <em>why</em> it
              exists. The history of how a dish got good is the most valuable
              part of it.
            </p>
          </article>
          <article className="card">
            <h3>Referential by design</h3>
            <p>
              Ingredients are canonical rows, not free text on a page. That is
              what makes &ldquo;everything I have made with gochujang&rdquo; and
              &ldquo;what can stand in for tandoori masala&rdquo; answerable.
            </p>
          </article>
          <article className="card">
            <h3>Written to by an agent</h3>
            <p>
              An <Link href="/connect">MCP connector</Link> lets a Claude
              conversation search this repository and append revisions to it
              directly, so a refinement made in chat lands here instead of
              evaporating.
            </p>
          </article>
          <article className="card">
            <h3>The archive is kept</h3>
            <p>
              Every note that predates the database is preserved verbatim in the{' '}
              <Link href="/archive">Markdown archive</Link>, and the database
              exports back to Markdown in the repository.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
