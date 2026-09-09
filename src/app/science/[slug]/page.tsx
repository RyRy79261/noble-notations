import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Fragment } from 'react';
import { getScienceStudy } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { RecipeGrid } from '@/components/recipe-card';
import { Markdown } from '@/components/markdown';
import { DatabaseNotice } from '@/components/database-notice';
import { KIND_LABELS } from '@/lib/site';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/**
 * One study.
 *
 * The slug is a **recipe** slug. A study is a recipe of the research kind,
 * or any recipe that carries a mechanism, so this address and
 * `/recipes/[slug]` name the same thing seen two ways: the reasoning here,
 * the method there. `getScienceStudy` returns null for a recipe that is
 * neither, which keeps `/science/tomato-soup` a 404 rather than a second
 * thin address for a dish.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await safeRead(() => getScienceStudy(slug), null);
  if (!data) return { title: 'Study not found' };

  const description =
    data.summary ??
    `The science of ${data.title}: ${data.mechanisms.length} mechanisms and the sources behind them.`;

  return {
    title: data.title,
    description,
    alternates: { canonical: `/science/${slug}` },
    openGraph: {
      type: 'article',
      title: data.title,
      description,
      url: `/science/${slug}`,
    },
  };
}

export default async function ScienceStudyPage({ params }: Params) {
  const { slug } = await params;
  const { data, configured, failed } = await safeRead(
    () => getScienceStudy(slug),
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

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link href="/science">Science</Link> / {data.title}
      </div>

      <header className="hero">
        <span className="badge">{KIND_LABELS[data.kind] ?? data.kind}</span>
        <h1>{data.title}</h1>
        {data.subtitle ? <p className="faint">{data.subtitle}</p> : null}
        {data.summary ? <p className="lede">{data.summary}</p> : null}
        {/* R-SCR-40. The reasoning is here. The method is there. */}
        <p>
          Read the method at <Link href={`/recipes/${slug}`}>{data.title}</Link>
          .
        </p>
      </header>

      <section className="section">
        <div className="section-head">
          <h2>Mechanisms</h2>
          <span className="faint">{data.mechanisms.length}</span>
        </div>
        {data.mechanisms.length === 0 ? (
          <p className="empty">This study has no mechanism yet.</p>
        ) : (
          <div>
            {data.mechanisms.map((mechanism) => (
              <article className="note" data-kind="science" key={mechanism.id}>
                <header className="note-head">
                  <span className="badge num">{mechanism.code}</span>
                  {mechanism.title ? <strong>{mechanism.title}</strong> : null}
                </header>
                <Markdown>{mechanism.body}</Markdown>
                {/* R-SCR-41: each condition is its own value, never written
                    into a sentence, and there is no row when there are
                    none. `notes.conditions` is the column D-02 settled and
                    M5.5 added, so these are real now.

                    Keyed by POSITION, because two conditions of one
                    mechanism can legitimately read the same and a duplicate
                    key drops one.

                    R-CMP-14 — THREE BOUNDARIES, NOT ONE. A flex gap is
                    invisible to `textContent`, and so is the boundary
                    between two blocks. The row needs a real space BETWEEN
                    its chips (`8+ HOURSHELD UNDER 100 °C`), one BEFORE it,
                    where the body ends and the first chip starts (`…done
                    three times.8+ hours`), and one AFTER it, where the last
                    chip meets the next mechanism's code. `.note` is a plain
                    block and `.row` is the flex child, so an inter-block
                    whitespace text node is not rendered and none of the
                    three costs a pixel.

                    This is M2 markup and M6 rebuilds it onto F/Mechanism.
                    Only the data and those faults are touched here. */}
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
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Applied in</h2>
          <span className="faint">{data.appliedIn.length}</span>
        </div>
        <p className="faint">
          The recipes that lean on this study, whether they cite it or hold it
          as a component.
        </p>
        {data.appliedIn.length === 0 ? (
          // R-STA-03. The design draws this block on the study artboard, so
          // it says it is empty rather than vanishing.
          <p className="empty">No recipe links to this study yet.</p>
        ) : (
          <RecipeGrid recipes={data.appliedIn} />
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>References</h2>
          <span className="faint">{data.citations.length}</span>
        </div>
        {/* R-SCR-42: the work, the part of it, and the date a person read
            it. A citation with no work falls back to its part, and then
            to its address, so a source is never an empty line. */}
        {data.citations.length === 0 ? (
          // R-STA-03, as above.
          <p className="empty">No source is recorded for this study yet.</p>
        ) : (
          <ul className="note-sources">
            {data.citations.map((citation) => {
              const work = citation.work ?? citation.part ?? citation.url;
              return (
                <li key={citation.code}>
                  <span className="num">{citation.code}</span>{' '}
                  {citation.url ? (
                    <a
                      href={citation.url}
                      rel="noreferrer nofollow"
                      target="_blank"
                    >
                      {work}
                    </a>
                  ) : (
                    work
                  )}
                  {citation.work && citation.part ? (
                    <span className="faint"> · {citation.part}</span>
                  ) : null}
                  {citation.accessedAt ? (
                    <span className="faint"> · read {citation.accessedAt}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
