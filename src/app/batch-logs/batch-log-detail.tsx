import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ExperimentView } from '@/lib/queries/read';
import { NoteList } from '@/components/notes';
import { Markdown } from '@/components/markdown';

/**
 * The body of one run.
 *
 * Two routes draw it. `/batch-logs/[log]` serves a run that names no
 * recipe; `/recipes/[slug]/batch-logs/[log]` serves one that does. D-01
 * gives each run exactly one live address, so the two pages differ only in
 * the trail above the title — everything below it is this component, which
 * is why it exists rather than the same 100 lines twice.
 *
 * It sits beside the pages instead of in `src/components/` because that
 * folder belongs to M4. Nothing here is a route: Next.js only treats
 * `page`, `layout`, `route` and their siblings as one, so a component can
 * be colocated with the pages that use it.
 *
 * The trail arrives as a node. Each route knows its own place in the site
 * and this component should not have to work it out from the data. A
 * Server Component may pass JSX across a boundary but not a function
 * (R-CON-02), so a node is also the only shape that stays safe if either
 * page later becomes a client component.
 */
export function BatchLogDetail({
  log,
  breadcrumb,
}: {
  log: ExperimentView;
  breadcrumb: ReactNode;
}) {
  // Observations arrive as (item, metric, value) triples. Pivot them into one
  // row per item with a column per metric — that is how they were recorded on
  // paper and the only shape in which a batch is readable at a glance.
  const metrics = [...new Set(log.observations.map((o) => o.metric))];
  const rows = new Map<string, Map<string, string>>();
  for (const observation of log.observations) {
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
      <div className="breadcrumb">{breadcrumb}</div>

      <header className="hero">
        <h1>{log.title}</h1>
        {log.summary ? <p className="lede">{log.summary}</p> : null}
        <div className="row">
          {log.startedAt ? (
            <span className="badge">started {log.startedAt}</span>
          ) : null}
          {log.completedAt ? (
            <span className="badge">completed {log.completedAt}</span>
          ) : null}
          {log.scaleFactor ? (
            <span className="badge">×{log.scaleFactor} scale</span>
          ) : null}
          {log.costTotal != null ? (
            <span className="badge">
              {log.costTotal} {log.currency ?? ''}
            </span>
          ) : null}
        </div>
        {log.recipe ? (
          <p>
            Cooking{' '}
            <Link href={`/recipes/${log.recipe.slug}`}>{log.recipe.title}</Link>
            .
          </p>
        ) : null}
      </header>

      {log.outcome ? (
        <section className="section">
          <div className="section-head">
            <h2>Outcome</h2>
          </div>
          <Markdown>{log.outcome}</Markdown>
        </section>
      ) : null}

      {rows.size > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Measurements</h2>
            <span className="faint">
              {rows.size} items · {log.observations.length} readings
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

      {log.notes.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Notes</h2>
          </div>
          <NoteList notes={log.notes} />
        </section>
      ) : null}
    </div>
  );
}
