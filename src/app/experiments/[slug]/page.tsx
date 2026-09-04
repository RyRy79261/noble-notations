import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getExperiment } from '@/lib/queries/read';
import { safeRead } from '@/lib/safe';
import { NoteList } from '@/components/notes';
import { Markdown } from '@/components/markdown';
import { DatabaseNotice } from '@/components/database-notice';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await safeRead(() => getExperiment(slug), null);
  if (!data) return { title: 'Experiment not found' };

  const description =
    data.summary ??
    `A recorded run${data.startedAt ? ` started ${data.startedAt}` : ''} with ${data.observations.length} measurements.`;

  return {
    title: data.title,
    description,
    alternates: { canonical: `/experiments/${slug}` },
    openGraph: {
      type: 'article',
      title: data.title,
      description,
      url: `/experiments/${slug}`,
    },
  };
}

export default async function ExperimentPage({ params }: Params) {
  const { slug } = await params;
  const { data, configured, failed } = await safeRead(
    () => getExperiment(slug),
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

  // Observations arrive as (item, metric, value) triples. Pivot them into one
  // row per item with a column per metric — that is how they were recorded on
  // paper and the only shape in which a batch is readable at a glance.
  const metrics = [...new Set(data.observations.map((o) => o.metric))];
  const rows = new Map<string, Map<string, string>>();
  for (const observation of data.observations) {
    const key = observation.item ?? '—';
    const row = rows.get(key) ?? new Map<string, string>();
    const rendered =
      observation.value != null
        ? `${observation.value}${observation.unit ? ` ${observation.unit}` : ''}`
        : (observation.note ?? '');
    row.set(observation.metric, rendered);
    rows.set(key, row);
  }

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link href="/experiments">Experiments</Link> / {data.title}
      </div>

      <header className="hero">
        <h1>{data.title}</h1>
        {data.summary ? <p className="lede">{data.summary}</p> : null}
        <div className="row">
          {data.startedAt ? (
            <span className="badge">started {data.startedAt}</span>
          ) : null}
          {data.completedAt ? (
            <span className="badge">completed {data.completedAt}</span>
          ) : null}
          {data.scaleFactor ? (
            <span className="badge">×{data.scaleFactor} scale</span>
          ) : null}
          {data.costTotal != null ? (
            <span className="badge">
              {data.costTotal} {data.currency ?? ''}
            </span>
          ) : null}
        </div>
        {data.recipe ? (
          <p>
            Cooking{' '}
            <Link href={`/recipes/${data.recipe.slug}`}>
              {data.recipe.title}
            </Link>
            .
          </p>
        ) : null}
      </header>

      {data.outcome ? (
        <section className="section">
          <div className="section-head">
            <h2>Outcome</h2>
          </div>
          <Markdown>{data.outcome}</Markdown>
        </section>
      ) : null}

      {rows.size > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Measurements</h2>
            <span className="faint">
              {rows.size} items · {data.observations.length} readings
            </span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  {metrics.map((metric) => (
                    <th className="numeric" key={metric}>
                      {metric.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...rows.entries()].map(([item, values]) => (
                  <tr key={item}>
                    <td className="num">{item}</td>
                    {metrics.map((metric) => (
                      <td className="numeric" key={metric}>
                        {values.get(metric) ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data.notes.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Notes</h2>
          </div>
          <NoteList notes={data.notes} />
        </section>
      ) : null}
    </div>
  );
}
