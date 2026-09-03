import Link from 'next/link';
import { FACET_LABELS } from '@/lib/site';
import type { TermView } from '@/lib/queries/read';

/**
 * A taxonomy term rendered as a link to its own page, with its blurb shown
 * on hover and on keyboard focus.
 *
 * The tooltip is CSS and `aria-describedby` rather than the native `title`
 * attribute: `title` cannot be styled, takes a second to appear, never
 * shows on keyboard focus, and is not announced reliably by screen
 * readers. The blurb is the whole point of the tag — "what *is* Cajun?" —
 * so it should not be hidden behind the worst tooltip the platform offers.
 *
 * Terms with no blurb yet fall back to a plain link. Every term is created
 * on demand when a recipe is tagged, so an undescribed term is normal, not
 * an error state.
 */
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
  const facetLabel = FACET_LABELS[term.facet] ?? term.facet;
  const tooltipId = `term-blurb-${term.facet}-${term.slug}`;

  const link = (
    <Link
      href={href}
      className={term.isPrimary ? 'tag primary' : 'tag'}
      aria-describedby={term.description ? tooltipId : undefined}
    >
      {showFacet ? <span className="facet">{facetLabel}</span> : null}
      {term.label}
    </Link>
  );

  if (!term.description) return link;

  return (
    <span className="tag-wrap">
      {link}
      <span role="tooltip" id={tooltipId} className="tag-tooltip">
        <span className="tag-tooltip-facet">{facetLabel}</span>
        {term.description}
      </span>
    </span>
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
