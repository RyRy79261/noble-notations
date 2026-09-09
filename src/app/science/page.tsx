import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';
import { listScienceIndex } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { Markdown } from '@/components/markdown';
import { DatabaseNotice } from '@/components/database-notice';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Science',
  description:
    'Why the methods work. Every mechanism from every recipe in one place, with the studies they come from and the notes around them.',
  alternates: { canonical: '/science' },
};

/**
 * The science index.
 *
 * Science is still a tab on a recipe. This page collects it: the studies,
 * every mechanism across every recipe, and the research notes beside them.
 * The read is `listScienceIndex`, which closes K-04.
 */
export default async function SciencePage() {
  const { data, configured, failed } = await safeRead(listScienceIndex, {
    studies: [],
    mechanisms: [],
    research: [],
  });

  const empty =
    data.studies.length === 0 &&
    data.mechanisms.length === 0 &&
    data.research.length === 0;

  return (
    <div className="page">
      <header className="hero">
        <h1>Science</h1>
        <p>
          Why a method works, kept apart from what to do. A mechanism tells you
          what happens in the food. Each one names the recipe that uses it, so
          you can read the reason and then go and cook.
        </p>
      </header>

      {!configured || failed ? (
        <DatabaseNotice failed={failed} />
      ) : empty ? (
        // R-SCR-43. One sentence, not three empty headings.
        <p className="empty">
          No recipe has a science note yet. Add one to a recipe and it shows
          here.
        </p>
      ) : (
        <>
          <section className="section">
            <div className="section-head">
              <h2>Studies</h2>
              <span className="faint">{data.studies.length}</span>
            </div>
            {data.studies.length === 0 ? (
              <p className="empty">
                No study yet. A study is a recipe of the research kind, which
                holds the reasoning rather than the steps, or any recipe that
                carries a mechanism.
              </p>
            ) : (
              <div className="grid">
                {data.studies.map((study) => (
                  <Link
                    className="card"
                    href={`/science/${study.slug}`}
                    key={study.slug}
                  >
                    <h3>{study.title}</h3>
                    {study.summary ? <p>{study.summary}</p> : null}
                    <div className="card-meta">
                      <span className="num">{study.mechanismCount}</span>{' '}
                      mechanism
                      {study.mechanismCount === 1 ? '' : 's'}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-head">
              <h2>Mechanisms</h2>
              <span className="faint">{data.mechanisms.length}</span>
            </div>
            {data.mechanisms.length === 0 ? (
              // R-SCR-43 again: the studies can be there before any of them
              // carries a mechanism.
              <p className="empty">No recipe has a science note yet.</p>
            ) : (
              <div>
                {data.mechanisms.map((mechanism) => (
                  <article
                    className="note"
                    data-kind="science"
                    key={mechanism.id}
                  >
                    <header className="note-head">
                      <span className="badge num">{mechanism.code}</span>
                      {mechanism.title ? (
                        <strong>{mechanism.title}</strong>
                      ) : null}
                    </header>
                    <Markdown>{mechanism.body}</Markdown>
                    {/* R-SCR-41: separate values, never written into a
                        sentence, and no row at all when there are none.
                        `notes.conditions` is the column D-02 settled and
                        M5.5 added, so these are real now.

                        The key is the POSITION and not the value: two
                        stages of one mechanism can legitimately hold the
                        same condition, and a duplicate key drops one of
                        them.

                        R-CMP-14 — THREE BOUNDARIES, NOT ONE. A flex gap is
                        invisible to `textContent`, and so is the boundary
                        between two blocks. The row needs a real space
                        BETWEEN its chips (`232 °C45 MIN`), one BEFORE it
                        (`…is not redundant.dry duxelles + sealed wrap`) and
                        one AFTER it (`sealed wrapFrom Beef Wellington` —
                        the worst of the three, because it fuses two words
                        with no punctuation at all). `.note` is a plain
                        block and `.row` is the flex child, so an
                        inter-block whitespace text node is not rendered and
                        none of the three costs a pixel.

                        This is M2 markup and M6 rebuilds it onto
                        F/Mechanism. Only the data and those faults are
                        touched here. */}
                    {mechanism.conditions.length > 0 ? (
                      <>
                        {' '}
                        <div className="row">
                          {mechanism.conditions.map((condition, index) => (
                            <Fragment key={index}>
                              {index > 0 ? ' ' : null}
                              <span className="badge num">{condition}</span>
                            </Fragment>
                          ))}
                        </div>{' '}
                      </>
                    ) : null}
                    {/* R-SCR-40: a science note links back to its recipe. */}
                    <p className="faint">
                      From{' '}
                      <Link href={`/recipes/${mechanism.recipeSlug}`}>
                        {mechanism.recipeTitle}
                      </Link>
                      . Read{' '}
                      <Link href={`/science/${mechanism.recipeSlug}`}>
                        all its science
                      </Link>
                      .
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-head">
              <h2>From the recipes</h2>
              <span className="faint">{data.research.length}</span>
            </div>
            <p className="faint">
              What was learned around a dish: alternatives, sources and
              background. This is not what happens in the food.
            </p>
            {data.research.length === 0 ? (
              // R-STA-03. The design names three blocks on this screen, so
              // the third says it is empty rather than disappearing and
              // leaving the reader to wonder whether it exists.
              <p className="empty">No recipe carries a research note yet.</p>
            ) : (
              <div className="grid">
                {data.research.map((note) => (
                  <Link
                    className="card"
                    href={`/recipes/${note.recipeSlug}`}
                    key={note.id}
                  >
                    <h3>{note.title ?? note.recipeTitle}</h3>
                    <div className="card-meta">
                      <span className="num">{note.code}</span>
                      <span>{note.recipeTitle}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
