import Link from 'next/link';
import { KIND_LABELS } from '@/lib/site';
import type {
  IngredientLineView,
  RecipeView,
  StepView,
} from '@/lib/queries/read';
import { formatQuantity } from '@/lib/domain/units';
import { TermList } from './tags';
import { NoteList } from './notes';
import { Markdown } from './markdown';

const LINK_LABELS: Record<string, string> = {
  derived_from: 'Derived from',
  variant_of: 'Variant of',
  component_of: 'Component of',
  pairs_with: 'Pairs with',
  references: 'References',
};

/** Preserve the order components first appeared in rather than sorting them. */
function groupByComponent(lines: IngredientLineView[]) {
  const groups = new Map<string, IngredientLineView[]>();
  for (const line of lines) {
    const key = line.component ?? '';
    const list = groups.get(key) ?? [];
    list.push(line);
    groups.set(key, list);
  }
  return [...groups.entries()];
}

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

function IngredientLine({ line }: { line: IngredientLineView }) {
  const amount = formatQuantity(line.quantity, line.quantityMax);
  const label = line.ingredient?.name ?? line.rawText;

  return (
    <li>
      <span className="amount">
        {amount ? `${amount}${line.unit ? ` ${line.unit}` : ''}` : ''}
      </span>
      <span className="what">
        {line.ingredient ? (
          <Link href={`/ingredients/${line.ingredient.slug}`}>{label}</Link>
        ) : (
          label
        )}
        {line.preparation ? (
          <span className="prep">, {line.preparation}</span>
        ) : null}
        {line.optional ? <span className="faint"> (optional)</span> : null}
        {line.note ? (
          <div className="faint" style={{ fontSize: '0.85rem' }}>
            {line.note}
          </div>
        ) : null}
      </span>
    </li>
  );
}

export function RecipeDetail({
  recipe,
  isHistorical,
}: {
  recipe: RecipeView;
  isHistorical: boolean;
}) {
  const groups = groupByComponent(recipe.ingredients);
  const phases = groupByPhase(recipe.steps);
  const rev = recipe.revision;

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

      <div className="recipe-layout">
        <aside className="recipe-aside">
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
              {groups.map(([component, lines]) => (
                <div className="ingredient-group" key={component || 'main'}>
                  {component ? <h4>{component}</h4> : null}
                  <ul className="ingredient-list">
                    {lines.map((line) => (
                      <IngredientLine key={line.id} line={line} />
                    ))}
                  </ul>
                </div>
              ))}
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
        </aside>

        <div>
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
                                  href={`/taxonomy/technique/${step.technique.slug}`}
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

          {recipe.notes.length > 0 ? (
            <section className="section">
              <div className="section-head">
                <h2>Notes</h2>
                <span className="faint">{recipe.notes.length}</span>
              </div>
              <NoteList notes={recipe.notes} />
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
        </div>
      </div>
    </div>
  );
}
