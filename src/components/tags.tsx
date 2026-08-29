import Link from 'next/link';
import { FACET_LABELS } from '@/lib/site';
import type { TermView } from '@/lib/queries/read';

/** A taxonomy term rendered as a link to its own page. */
export function TermTag({
  term,
  showFacet = false,
}: {
  term: TermView;
  showFacet?: boolean;
}) {
  const href =
    term.facet === 'cuisine'
      ? `/cuisines/${term.slug}`
      : `/taxonomy/${term.facet}/${term.slug}`;

  return (
    <Link
      href={href}
      className={term.isPrimary ? 'tag primary' : 'tag'}
      title={`${FACET_LABELS[term.facet] ?? term.facet}: ${term.label}`}
    >
      {showFacet ? (
        <span className="facet">{FACET_LABELS[term.facet] ?? term.facet}</span>
      ) : null}
      {term.label}
    </Link>
  );
}

export function TermList({
  terms,
  showFacet = false,
  limit,
}: {
  terms: TermView[];
  showFacet?: boolean;
  limit?: number;
}) {
  if (terms.length === 0) return null;
  const shown = limit ? terms.slice(0, limit) : terms;
  const hidden = terms.length - shown.length;

  return (
    <div className="row">
      {shown.map((term) => (
        <TermTag key={term.id} term={term} showFacet={showFacet} />
      ))}
      {hidden > 0 ? <span className="tag faint">+{hidden}</span> : null}
    </div>
  );
}
