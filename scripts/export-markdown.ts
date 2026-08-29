/**
 * Export every recipe and every revision back out to Markdown.
 *
 *   pnpm export
 *
 * The database is the source of truth, but it is a hosted service. This
 * writes a readable, greppable, diffable copy into content/generated/ so the
 * repository always holds the recipes even if Neon disappears — and so a
 * revision shows up as a reviewable diff in git rather than as an opaque row
 * change.
 *
 * Everything under content/generated/ is machine-written and safe to delete;
 * it is rebuilt from scratch on each run.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv } from './env';

loadEnv();

const OUT = path.join(process.cwd(), 'content', 'generated');

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

async function main() {
  const { getRecipeBySlug, listRecipeSlugs } =
    await import('@/lib/queries/read');
  const { formatQuantity } = await import('@/lib/domain/units');

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const slugs = await listRecipeSlugs();
  console.log(`Exporting ${slugs.length} recipes…`);

  const index: string[] = [
    '# Generated export',
    '',
    'Machine-written from the database by `pnpm export`. Do not hand-edit —',
    'the next run overwrites everything here. To change a recipe, add a',
    'revision (through the site or the MCP connector) and re-export.',
    '',
    `Last exported: ${new Date().toISOString()}`,
    '',
  ];

  for (const slug of slugs) {
    const current = await getRecipeBySlug(slug);
    if (!current) continue;

    await mkdir(path.join(OUT, slug), { recursive: true });
    index.push(`- [${current.title}](./${slug}/current.md)`);

    for (const entry of current.revisions) {
      const isCurrent = entry.revisionNumber === current.revisionNumber;
      const recipe = isCurrent
        ? current
        : await getRecipeBySlug(slug, entry.revisionNumber);
      if (!recipe) continue;

      const body: string[] = [
        frontMatter({
          title: recipe.title,
          slug: recipe.slug,
          kind: recipe.kind,
          revision: recipe.revision.revisionNumber,
          source: recipe.revision.source,
          created: recipe.revision.createdAt,
          generated: 'true',
        }),
        `# ${recipe.title}`,
        '',
      ];

      if (recipe.subtitle) body.push(`_${recipe.subtitle}_`, '');
      if (recipe.summary) body.push(recipe.summary, '');
      if (recipe.revision.rationale) {
        body.push('## Why this revision', '', recipe.revision.rationale, '');
      }

      if (recipe.terms.length > 0) {
        body.push('## Classification', '');
        const byFacet = new Map<string, string[]>();
        for (const term of recipe.terms) {
          const list = byFacet.get(term.facet) ?? [];
          list.push(term.label);
          byFacet.set(term.facet, list);
        }
        for (const [facet, labels] of byFacet) {
          body.push(`- **${facet.replace(/_/g, ' ')}**: ${labels.join(', ')}`);
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
            body.push(
              `- Source: ${source.url ?? source.title ?? source.citation}`,
            );
          }
          if (note.sources.length > 0) body.push('');
        }
      }

      const file = isCurrent
        ? 'current.md'
        : `revision-${entry.revisionNumber}.md`;
      await writeFile(path.join(OUT, slug, file), body.join('\n'), 'utf8');
    }

    console.log(`  ${slug} (${current.revisions.length} revisions)`);
  }

  await writeFile(path.join(OUT, 'README.md'), index.join('\n'), 'utf8');
  console.log(`\nWrote ${slugs.length} recipes to content/generated/.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
