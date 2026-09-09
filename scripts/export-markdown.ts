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

  /**
   * THE EXPORT IS BYTE-STABLE. Two loads of one seed must produce two
   * identical trees, or the diff this directory exists to give is noise
   * and a reviewer learns to skip it.
   *
   * Three things used to break that, and all three were clocks or missing
   * sort keys rather than anything about a recipe:
   *
   * 1. The note order, and the order of the sources under a note. Both are
   *    fixed at the source: `notes.position` and `note_sources.position`,
   *    migration 0006, and the reads in `read.ts` that use them.
   * 2. `listRecipeSlugs()` had no ORDER BY, so the index below reshuffled.
   *    It is ordered by slug now.
   * 3. The two timestamps — this line, and the `created:` front-matter
   *    field. Both are handled here; see the note at `extraFields`.
   *
   * A "last exported" stamp is the clearer case of the two. It changes on
   * every run by definition, so it makes README.md diff on a run that
   * changed nothing, and it is answered exactly by `git log` on this
   * directory — which also says who ran it and against which commit. It is
   * gone rather than frozen.
   */
  const index: string[] = [
    '# Generated export',
    '',
    'Machine-written from the database by `pnpm export`. Do not hand-edit —',
    'the next run overwrites everything here. To change a recipe, add a',
    'revision (through the site or the MCP connector) and re-export.',
    '',
    'Two exports of the same content are byte-identical, so a diff here is',
    'always a change to a recipe. `git log content/generated` says when this',
    'was last written.',
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
        extraFields: {
          generated: 'true',
          /**
           * `created:` is dropped from the exported copy, and only from the
           * exported copy.
           *
           * `recipeToMarkdown` writes `recipe.revision.createdAt` — the
           * moment the ROW was inserted. On a database that is rebuilt from
           * a seed that is a different value every load, so every file in
           * this tree diffed on every re-seed while saying nothing about
           * the recipe. It is a fact about a Postgres instance, not about a
           * revision, and this directory is a mirror of the recipes.
           *
           * `undefined` removes the key: `extraFields` is spread over the
           * defaults and `frontMatter()` drops an undefined value.
           *
           * `/recipes/<slug>.md` keeps it. There it is a fact worth having
           * — it tells an agent which snapshot it is holding — and nothing
           * over HTTP is diffed against a previous run. That route and this
           * one already differ by `generated: true`; the module doc's rule
           * that both must agree is about the recipe, which is identical.
           * What stays out of both is the revision NUMBER moving: `revision`
           * is still in the front matter and still identifies the version.
           */
          created: undefined,
        },
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
