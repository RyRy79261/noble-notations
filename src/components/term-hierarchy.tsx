import { TermTag } from '@/components/tags';
import type { TermView } from '@/lib/queries/read';

/**
 * Where a term sits relative to its neighbours.
 *
 * Tags are only useful if you can widen or narrow from one: landing on
 * Cajun should tell you it is a regional American cuisine and offer the
 * step up, the same way Sicilian should sit visibly under Italian. Without
 * this the hierarchy exists in the database and nowhere a reader can see
 * it.
 *
 * Renders nothing when a term is unrelated to any other, which is the
 * common case — most terms are flat.
 */
export function TermHierarchy({
  parent,
  narrower,
}: {
  parent: TermView | null;
  /** Not named `children`: that prop name is JSX's, and passing it
      explicitly reads as a mistake even where React allows it. */
  narrower: TermView[];
}) {
  if (!parent && narrower.length === 0) return null;

  return (
    <div className="term-hierarchy">
      {parent ? (
        <p className="row">
          <span className="faint">Part of</span>
          <TermTag term={parent} />
        </p>
      ) : null}
      {narrower.length > 0 ? (
        <p className="row">
          <span className="faint">More specific</span>
          {narrower.map((child) => (
            <TermTag key={child.id} term={child} />
          ))}
        </p>
      ) : null}
    </div>
  );
}
