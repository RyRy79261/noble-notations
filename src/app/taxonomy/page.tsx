import type { Metadata } from 'next';
import { listTaxonomy } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { TermTag } from '@/components/tags';
import { DatabaseNotice } from '@/components/database-notice';
import { FACET_LABELS } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Taxonomy',
  description:
    'The full classification scheme: cuisine, course, technique, diet, season, equipment, occasion, preservation, texture and ingredient class.',
  alternates: { canonical: '/taxonomy' },
};

const FACET_BLURBS: Record<string, string> = {
  cuisine: 'The tradition a dish belongs to.',
  course: 'Where it lands in a meal.',
  technique: 'What is actually being done to the food.',
  diet: 'Constraints a dish satisfies.',
  season: 'When the ingredients are at their best.',
  equipment: 'Hardware a recipe depends on.',
  occasion: 'What it gets made for.',
  preservation: 'How something is kept.',
  texture: 'The mouthfeel being aimed at.',
  ingredient_class: 'Broad families of ingredient.',
};

export default async function TaxonomyPage() {
  const { data, configured, failed } = await safeRead(() => listTaxonomy(), []);

  const byFacet = new Map<string, typeof data>();
  for (const term of data) {
    const list = byFacet.get(term.facet) ?? [];
    list.push(term);
    byFacet.set(term.facet, list);
  }

  return (
    <div className="page">
      <header className="hero">
        <h1>Taxonomy</h1>
        <p>
          Classification is faceted rather than a single tree: a recipe is
          Sichuan <em>and</em> a main <em>and</em> braised, not filed under one
          of them. Terms never cross facets, so &ldquo;smoking&rdquo; the
          technique and &ldquo;smoking&rdquo; the preservation method stay
          distinct.
        </p>
      </header>

      {!configured || failed ? (
        <DatabaseNotice failed={failed} />
      ) : byFacet.size === 0 ? (
        <p className="empty">No terms recorded yet.</p>
      ) : (
        [...byFacet.entries()].map(([facet, terms]) => (
          <section className="section" key={facet}>
            <div className="section-head">
              <h2>{FACET_LABELS[facet] ?? facet}</h2>
              <span className="faint">{terms.length} terms</span>
            </div>
            {FACET_BLURBS[facet] ? (
              <p className="faint">{FACET_BLURBS[facet]}</p>
            ) : null}
            <div className="row">
              {terms.map((term) => (
                <TermTag key={term.id} term={term} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
