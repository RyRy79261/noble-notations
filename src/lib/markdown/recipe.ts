/**
 * Render a recipe as Markdown.
 *
 * Two callers want the same bytes for different reasons, so the rendering
 * lives here rather than in either of them:
 *
 * - `pnpm export` writes a readable copy of every recipe into
 *   content/generated/, so a revision is a reviewable diff in git.
 * - `/recipes/<slug>.md` serves the same text to an agent, which would
 *   otherwise have to reconstruct the recipe out of the page's markup.
 *
 * Both must agree. A recipe that reads one way in the repository and
 * another way over HTTP is two recipes.
 */
import { formatQuantity } from '@/lib/domain/units';
import { CATEGORY_TYPE_LABELS } from '@/lib/site';
import type { RecipeView } from '@/lib/queries/read';

/** YAML-safe single-quoted scalar. */
function yamlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function frontMatter(
  fields: Record<string, string | number | undefined>,
): string {
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) =>
      typeof value === 'number'
        ? `${key}: ${value}`
        : `${key}: ${yamlString(String(value))}`,
    );
  return ['---', ...lines, '---', ''].join('\n');
}

export interface RecipeMarkdownOptions {
  /**
   * Prepend YAML front matter. The export writes it so the files round-trip
   * as documents; the HTTP route writes it too, because it is the cheapest
   * way to tell an agent which revision it is holding.
   */
  frontMatter?: boolean;
  /** Extra front-matter fields, merged over the defaults. */
  extraFields?: Record<string, string | number | undefined>;
}

export function recipeToMarkdown(
  recipe: RecipeView,
  options: RecipeMarkdownOptions = {},
): string {
  const body: string[] = [];

  if (options.frontMatter !== false) {
    body.push(
      frontMatter({
        title: recipe.title,
        slug: recipe.slug,
        kind: recipe.kind,
        revision: recipe.revision.revisionNumber,
        source: recipe.revision.source,
        created: recipe.revision.createdAt,
        ...options.extraFields,
      }),
    );
  }

  body.push(`# ${recipe.title}`, '');

  if (recipe.subtitle) body.push(`_${recipe.subtitle}_`, '');
  if (recipe.summary) body.push(recipe.summary, '');
  if (recipe.revision.rationale) {
    body.push('## Why this revision', '', recipe.revision.rationale, '');
  }

  if (recipe.terms.length > 0) {
    body.push('## Categories', '');
    const byType = new Map<string, string[]>();
    for (const term of recipe.terms) {
      const list = byType.get(term.categoryType) ?? [];
      list.push(term.label);
      byType.set(term.categoryType, list);
    }
    for (const [type, labels] of byType) {
      const label = CATEGORY_TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
      body.push(`- **${label}**: ${labels.join(', ')}`);
    }
    body.push('');
  }

  if (recipe.ingredients.length > 0) {
    body.push('## Ingredients', '');
    let component: string | null | undefined;
    for (const line of recipe.ingredients) {
      if (line.component !== component) {
        component = line.component;
        if (component) body.push('', `### ${component}`, '');
      }
      const amount = formatQuantity(line.quantity, line.quantityMax);
      const measure = amount
        ? `${amount}${line.unit ? ` ${line.unit}` : ''} `
        : '';
      const name = line.ingredient?.name ?? line.rawText;
      const prep = line.preparation ? `, ${line.preparation}` : '';
      const opt = line.optional ? ' _(optional)_' : '';
      body.push(`- ${measure}${name}${prep}${opt}`);
    }
    body.push('');
  }

  if (recipe.steps.length > 0) {
    body.push('## Method', '');
    let phase: string | null | undefined;
    let counter = 0;
    for (const step of recipe.steps) {
      if (step.phase !== phase) {
        phase = step.phase;
        if (phase) body.push('', `### ${phase}`, '');
      }
      counter += 1;
      const meta = [
        step.durationMinutes != null ? `${step.durationMinutes} min` : null,
        step.temperatureC != null ? `${step.temperatureC} °C` : null,
        step.technique?.label ?? null,
      ].filter(Boolean);
      body.push(
        `${counter}. ${step.instruction}${meta.length ? ` _(${meta.join(' · ')})_` : ''}`,
      );
      if (step.note) body.push(`   > ${step.note}`);
    }
    body.push('');
  }

  if (recipe.notes.length > 0) {
    body.push('## Notes', '');
    for (const note of recipe.notes) {
      body.push(
        `### ${note.title ?? note.kind} _(${note.kind})_`,
        '',
        note.body,
        '',
      );
      for (const source of note.sources) {
        body.push(`- Source: ${source.url ?? source.title ?? source.citation}`);
      }
      if (note.sources.length > 0) body.push('');
    }
  }

  return body.join('\n');
}
