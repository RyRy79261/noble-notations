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

async function main() {
  const { getRecipeBySlug, listRecipeSlugs } =
    await import('@/lib/queries/read');
  const { recipeToMarkdown } = await import('@/lib/markdown/recipe');

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

      const markdown = recipeToMarkdown(recipe, {
        extraFields: { generated: 'true' },
      });

      const file = isCurrent
        ? 'current.md'
        : `revision-${entry.revisionNumber}.md`;
      await writeFile(path.join(OUT, slug, file), markdown, 'utf8');
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
