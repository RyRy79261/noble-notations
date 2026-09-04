import type { Metadata } from 'next';
import { listCategories } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { TermTag } from '@/components/tags';
import { DatabaseNotice } from '@/components/database-notice';
import { FilterableGroups } from '@/components/filterable-groups';
import { CATEGORY_TYPE_LABELS } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Categories',
  description:
    'The full classification scheme: cuisine, course, technique, diet, season, equipment, occasion, preservation, texture and ingredient class.',
  alternates: { canonical: '/categories' },
};

/**
 * One line for each kind of category.
 *
 * Written in ASD Simplified Technical English: short sentences, one idea
 * in each, active voice, and no words that need a second word to explain
 * them.
 */
const CATEGORY_TYPE_BLURBS: Record<string, string> = {
  cuisine: 'The cooking tradition of the dish.',
  course: 'The part of the meal that the dish is for.',
  technique: 'The action that you do to the food.',
  diet: 'The foods that the dish does not contain.',
  season: 'The time of year for the dish.',
  equipment: 'The tools that you must have.',
  occasion: 'The event that the dish is for.',
  preservation: 'The method that keeps the food safe to eat.',
  texture: 'The feel of the food in the mouth.',
  ingredient_class: 'The group that the ingredient is in.',
};

export default async function CategoriesPage() {
  const { data, configured, failed } = await safeRead(
    () => listCategories(),
    [],
  );

  const byFacet = new Map<string, typeof data>();
  for (const term of data) {
    const list = byFacet.get(term.categoryType) ?? [];
    list.push(term);
    byFacet.set(term.categoryType, list);
  }

  const groups = [...byFacet.entries()].map(([facet, terms]) => ({
    key: facet,
    heading: (
      <div className="section-head">
        <h2>{CATEGORY_TYPE_LABELS[facet] ?? facet}</h2>
        <span className="faint">{terms.length} tags</span>
      </div>
    ),
    intro: CATEGORY_TYPE_BLURBS[facet] ? (
      <p className="faint">{CATEGORY_TYPE_BLURBS[facet]}</p>
    ) : undefined,
    items: terms.map((term) => ({
      key: term.id,
      // The blurb is searchable too: "numbing" should find Sichuan even
      // though the tag itself only says "Sichuan".
      text: [term.label, facet, term.description ?? ''].join(' '),
      node: <TermTag key={term.id} term={term} />,
    })),
  }));

  return (
    <div className="page">
      <header className="hero">
        <h1>Categories</h1>
        <p>
          A recipe has many tags at the same time. A dish can be Sichuan, and a
          main, and braised. You do not put it in only one group.
        </p>
        <p>
          Each tag belongs to one type of category. The same word can be in two
          types. &ldquo;Air-drying&rdquo; is a technique, and it is also a
          preservation method. These are two different tags, and each tag has
          its own explanation.
        </p>
      </header>

      {!configured || failed ? (
        <DatabaseNotice failed={failed} />
      ) : byFacet.size === 0 ? (
        <p className="empty">There are no tags yet.</p>
      ) : (
        <FilterableGroups
          groups={groups}
          label="Filter the tags"
          placeholder="Filter by tag, type or explanation…"
          countNoun="tag"
        />
      )}
    </div>
  );
}
