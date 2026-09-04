import Link from 'next/link';
import { KIND_LABELS } from '@/lib/site';
import type { RecipeView, StepView } from '@/lib/queries/read';
import { formatQuantity } from '@/lib/domain/units';
import { TermList } from './tags';
import { NoteList } from './notes';
import { Markdown } from './markdown';
import { IngredientChecklist } from './ingredient-checklist';
import { AddToBasket } from './shopping-basket';
import { RecipeTabs } from './recipe-tabs';

const LINK_LABELS: Record<string, string> = {
  derived_from: 'Derived from',
  variant_of: 'Variant of',
  component_of: 'Component of',
  pairs_with: 'Pairs with',
  references: 'References',
};

function groupByPhase(steps: StepView[]) {
  const groups: { phase: string; steps: StepView[] }[] = [];
  for (const step of steps) {
    const phase = step.phase ?? '';
    const last = groups[groups.length - 1];
    if (last && last.phase === phase) last.steps.push(step);
    else groups.push({ phase, steps: [step] });
  }
  return groups;
}

function formatDuration(
  minutes: number | null,
  max: number | null,
): string | null {
  if (minutes == null) return null;
  const render = (m: number) =>
    m >= 1440
      ? `${Math.round((m / 1440) * 10) / 10} d`
      : m >= 60
        ? `${Math.round((m / 60) * 10) / 10} h`
        : `${m} min`;
  return max != null && max !== minutes
    ? `${render(minutes)}–${render(max)}`
    : render(minutes);
}

export function RecipeDetail({
  recipe,
  isHistorical,
}: {
  recipe: RecipeView;
  isHistorical: boolean;
}) {
  const phases = groupByPhase(recipe.steps);
  const rev = recipe.revision;

  // Science gets its own section at the bottom: it explains what is
  // happening in the dish, which is a different question from the running
  // commentary of observations, results and corrections above it.
  const science = recipe.notes.filter((note) => note.kind === 'science');
  const otherNotes = recipe.notes.filter((note) => note.kind !== 'science');

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link href="/recipes">Recipes</Link> / {recipe.title}
      </div>

      <header className="hero">
        <div className="row">
          <span className="badge">
            {KIND_LABELS[recipe.kind] ?? recipe.kind}
          </span>
          <span className="badge">revision {rev.revisionNumber}</span>
          {rev.source !== 'human' ? (
            <span className="badge">via {rev.source}</span>
          ) : null}
        </div>
        <h1>{recipe.title}</h1>
        {recipe.subtitle ? <p className="lede">{recipe.subtitle}</p> : null}
        {recipe.summary ? <p>{recipe.summary}</p> : null}
        {recipe.heroImageUrl ? (
          <figure className="recipe-hero-image">
            {/* Plain <img>, not next/image: these URLs come from arbitrary
                hosts via the MCP, and pointing the image optimiser at
                attacker-supplied origins is a request-forgery surface that
                buys nothing here. Sized by CSS, lazy below the fold. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={recipe.heroImageUrl}
              alt={recipe.heroImageAlt ?? ''}
              loading="lazy"
              decoding="async"
            />
            {recipe.heroImageAlt ? (
              <figcaption>{recipe.heroImageAlt}</figcaption>
            ) : null}
          </figure>
        ) : null}
        <TermList terms={recipe.terms} showFacet />

        {isHistorical ? (
          <p className="notice" style={{ marginTop: '1.25rem' }}>
            You are reading revision {rev.revisionNumber}, which has been
            superseded.{' '}
            <Link href={`/recipes/${recipe.slug}`}>
              Read the current revision
            </Link>
            .
          </p>
        ) : null}
      </header>

      <RecipeTabs
        ingredients={
          <>
            {(rev.yieldQuantity ||
              rev.servings ||
              rev.totalTimeMinutes ||
              rev.activeTimeMinutes) && (
              <section className="panel">
                <h2>At a glance</h2>
                <table>
                  <tbody>
                    {rev.yieldQuantity ? (
                      <tr>
                        <td>Yield</td>
                        <td className="numeric">
                          {formatQuantity(rev.yieldQuantity)}{' '}
                          {rev.yieldUnit ?? ''}
                        </td>
                      </tr>
                    ) : null}
                    {rev.servings ? (
                      <tr>
                        <td>Servings</td>
                        <td className="numeric">{rev.servings}</td>
                      </tr>
                    ) : null}
                    {rev.totalTimeMinutes ? (
                      <tr>
                        <td>Total time</td>
                        <td className="numeric">
                          {formatDuration(rev.totalTimeMinutes, null)}
                        </td>
                      </tr>
                    ) : null}
                    {rev.activeTimeMinutes ? (
                      <tr>
                        <td>Active time</td>
                        <td className="numeric">
                          {formatDuration(rev.activeTimeMinutes, null)}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            )}

            {recipe.ingredients.length > 0 ? (
              <section className="panel">
                <h2>Ingredients</h2>
                <IngredientChecklist
                  slug={recipe.slug}
                  revisionNumber={rev.revisionNumber}
                  lines={recipe.ingredients}
                />
                <div className="basket-cta">
                  <AddToBasket slug={recipe.slug} title={recipe.title} />
                </div>
              </section>
            ) : null}

            {recipe.revisions.length > 1 ? (
              <section className="panel">
                <h2>Revisions</h2>
                <ol className="timeline">
                  {recipe.revisions.map((entry) => (
                    <li
                      key={entry.revisionNumber}
                      data-current={entry.revisionNumber === rev.revisionNumber}
                    >
                      <Link
                        href={
                          entry.revisionNumber === recipe.revisionNumber &&
                          !isHistorical
                            ? `/recipes/${recipe.slug}`
                            : `/recipes/${recipe.slug}/revisions/${entry.revisionNumber}`
                        }
                        className="rev-label"
                      >
                        Revision {entry.revisionNumber}
                      </Link>
                      {entry.backfilled && entry.occurredAt ? (
                        // The number says when it was written down, which
                        // for an older version found later is not when it
                        // existed. Say both, or the list reads as wrong.
                        <p className="rev-when">
                          From{' '}
                          <time dateTime={entry.occurredAt}>
                            {entry.occurredAt.slice(0, 10)}
                          </time>
                          , recorded later
                        </p>
                      ) : null}
                      <p className="rev-rationale">
                        {entry.rationale ?? (
                          <span className="faint">No rationale recorded.</span>
                        )}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </>
        }
        method={
          <>
            {rev.rationale ? (
              <section>
                <h2>Why this revision</h2>
                <p className="lede">{rev.rationale}</p>
              </section>
            ) : null}

            {recipe.steps.length > 0 ? (
              <section className={rev.rationale ? 'section' : undefined}>
                <div className="section-head">
                  <h2>Method</h2>
                  <span className="faint">{recipe.steps.length} steps</span>
                </div>
                <div className="method">
                  {phases.map((group, index) => (
                    <div key={`${group.phase}-${index}`}>
                      {group.phase ? (
                        <h3 className="phase-head">{group.phase}</h3>
                      ) : null}
                      <ol className="steps">
                        {group.steps.map((step) => (
                          <li key={step.id}>
                            <div className="step-body">
                              <p>{step.instruction}</p>
                              {step.note ? (
                                <p className="faint">{step.note}</p>
                              ) : null}
                              {step.imageUrl ? (
                                <figure className="step-image">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={step.imageUrl}
                                    alt={step.imageAlt ?? ''}
                                    loading="lazy"
                                    decoding="async"
                                  />
                                  {step.imageAlt ? (
                                    <figcaption>{step.imageAlt}</figcaption>
                                  ) : null}
                                </figure>
                              ) : null}
                              <div className="step-meta">
                                {formatDuration(
                                  step.durationMinutes,
                                  step.durationMaxMinutes,
                                ) ? (
                                  <span className="badge">
                                    {formatDuration(
                                      step.durationMinutes,
                                      step.durationMaxMinutes,
                                    )}
                                  </span>
                                ) : null}
                                {step.temperatureC != null ? (
                                  <span className="badge">
                                    {step.temperatureC} °C
                                  </span>
                                ) : null}
                                {step.technique ? (
                                  <Link
                                    className="tag"
                                    href={`/categories/technique/${step.technique.slug}`}
                                  >
                                    {step.technique.label}
                                  </Link>
                                ) : null}
                                {step.equipment.map((item) => (
                                  <span className="badge" key={item}>
                                    {item}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {otherNotes.length > 0 ? (
              <section className="section">
                <div className="section-head">
                  <h2>Notes</h2>
                  <span className="faint">{otherNotes.length}</span>
                </div>
                <NoteList notes={otherNotes} />
              </section>
            ) : null}

            {recipe.originNote ? (
              <section className="section">
                <div className="section-head">
                  <h2>Provenance</h2>
                </div>
                <Markdown>{recipe.originNote}</Markdown>
              </section>
            ) : null}

            {recipe.links.length > 0 || recipe.backlinks.length > 0 ? (
              <section className="section">
                <div className="section-head">
                  <h2>Related</h2>
                </div>
                <div className="grid">
                  {recipe.links.map((link) => (
                    <article
                      className="card"
                      key={`out-${link.recipe.slug}-${link.kind}`}
                    >
                      <span className="badge">
                        {LINK_LABELS[link.kind] ?? link.kind}
                      </span>
                      <h3>
                        <Link href={`/recipes/${link.recipe.slug}`}>
                          {link.recipe.title}
                        </Link>
                      </h3>
                      {link.note ? <p>{link.note}</p> : null}
                    </article>
                  ))}
                  {recipe.backlinks.map((link) => (
                    <article
                      className="card"
                      key={`in-${link.recipe.slug}-${link.kind}`}
                    >
                      <span className="badge">
                        Referenced by ({LINK_LABELS[link.kind] ?? link.kind})
                      </span>
                      <h3>
                        <Link href={`/recipes/${link.recipe.slug}`}>
                          {link.recipe.title}
                        </Link>
                      </h3>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {recipe.experiments.length > 0 ? (
              <section className="section">
                <div className="section-head">
                  <h2>Recorded runs</h2>
                  <span className="faint">{recipe.experiments.length}</span>
                </div>
                <ul>
                  {recipe.experiments.map((experiment) => (
                    <li key={experiment.slug}>
                      <Link href={`/experiments/${experiment.slug}`}>
                        {experiment.title}
                      </Link>
                      {experiment.startedAt ? (
                        <span className="faint"> — {experiment.startedAt}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {science.length > 0 ? (
              <section className="section science-section">
                <div className="section-head">
                  <h2>The science</h2>
                  <span className="faint">{science.length}</span>
                </div>
                <p className="faint">
                  What is actually happening in the dish, and why the techniques
                  work.
                </p>
                <NoteList notes={science} />
              </section>
            ) : null}
          </>
        }
      />
    </div>
  );
}
