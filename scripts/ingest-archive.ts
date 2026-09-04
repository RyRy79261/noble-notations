/**
 * Load the Markdown archive into the database as structured records.
 *
 *   pnpm ingest                 # skip anything already present
 *   pnpm ingest --force         # add revisions to recipes that already exist
 *   pnpm ingest --if-requested  # run only when a deployment asks for it
 *
 * A deployment asks by committing a `.ingest-request` file; see below.
 *
 * Idempotent by default: running it twice does not duplicate anything, so it
 * is safe to run against a database that already has content. The seed data
 * lives in ./seed-data.ts, hand-derived from content/ — see the note at the
 * top of that file for why it is not parsed.
 *
 * The third form is what `pnpm build` runs. It is off unless asked for,
 * because a build must not decide on its own to write to the database it is
 * deploying against.
 */
import { readFileSync } from 'node:fs';
import { loadEnv } from './env';

loadEnv();

/**
 * A file on the branch is the primary way to ask for the archive.
 *
 * The obvious alternative — `[ingest]` in the commit message — was tried
 * first and did not survive contact with a real deployment: the marker
 * never reached the build. VERCEL_GIT_COMMIT_MESSAGE only appears in the
 * build environment when the project exposes system environment
 * variables, and what it exposes can be truncated, so a marker in a long
 * message depends on two things outside this repository.
 *
 * A committed file needs neither. It is in the checkout by definition, it
 * shows up in the diff of the pull request that asks for the load, and
 * deleting it is how you stop asking. The commit-message route is still
 * honoured for anyone whose project does expose it.
 */
const MARKER_FILE = '.ingest-request';

/**
 * Report why this deployment wants the archive loaded, or null if it does
 * not, and say what was checked either way. A build that silently declines
 * to do the one thing it was pushed for is worse than no feature.
 *
 * None of these routes can pass `--force`. A build may add what is
 * missing; rewriting history is a decision for a person at a terminal.
 */
function ingestRequest(): string | null {
  let marker: string | null = null;
  try {
    marker = readFileSync(MARKER_FILE, 'utf8').trim();
  } catch {
    // Absent — the normal case.
  }
  if (marker !== null) {
    // The file holds a prose reason over several lines; the log wants one.
    const reason = marker.replace(/\s+/g, ' ').slice(0, 200);
    return reason ? `${MARKER_FILE} says: ${reason}` : `${MARKER_FILE} exists`;
  }

  const flag = (process.env.INGEST_ON_DEPLOY ?? '').trim().toLowerCase();
  if (flag && flag !== '0' && flag !== 'false' && flag !== 'no') {
    return 'INGEST_ON_DEPLOY is set';
  }

  if (/\[ingest\]/i.test(process.env.VERCEL_GIT_COMMIT_MESSAGE ?? '')) {
    return 'the commit message contains [ingest]';
  }

  console.log('No deployment asked for the archive — skipping ingest.');
  console.log(`  ${MARKER_FILE}: absent`);
  console.log(
    `  INGEST_ON_DEPLOY: ${flag ? `set to "${flag}", which reads as off` : 'unset'}`,
  );
  console.log(
    `  commit message: ${
      process.env.VERCEL_GIT_COMMIT_MESSAGE
        ? 'available, no [ingest] marker in it'
        : 'not available to this build'
    }`,
  );
  return null;
}

async function main() {
  if (process.argv.includes('--if-requested')) {
    const reason = ingestRequest();
    if (!reason) return;
    // A marker can reach a build that has no database — CI builds every
    // commit, including one marked [ingest]. Skip rather than fail, the
    // same call migrate.ts makes.
    if (!process.env.DATABASE_URL) {
      console.log(
        'Asked to load the archive, but DATABASE_URL is not set — skipping.',
      );
      return;
    }
    console.log(`Loading the archive because ${reason}.\n`);
  }

  // Imported after loadEnv so the database client sees DATABASE_URL.
  const { db } = await import('@/db/client');
  const { recipes, experiments: experimentsTable } =
    await import('@/db/schema');
  const {
    createRecipe,
    reviseRecipe,
    upsertIngredient,
    upsertCategory,
    logExperiment,
  } = await import('@/lib/queries/write');
  const { withTransaction } = await import('@/db/client');
  const { recipeLinks } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const {
    createRecipeSchema,
    logExperimentSchema,
    reviseRecipeSchema,
    upsertIngredientSchema,
    upsertCategorySchema,
  } = await import('@/lib/domain/schemas');
  const { INGREDIENTS, RECIPES, RECIPE_LINKS, EXPERIMENTS } =
    await import('./seed-data');
  const { TAXONOMY } = await import('./taxonomy-seed');

  const force = process.argv.includes('--force');

  // Taxonomy first: recipes auto-create any term they name, and a term
  // created that way has no blurb. Describing them up front means the
  // recipe pass finds them already labelled and explained. Parents are
  // resolved by slug, so a child listed before its parent would fail —
  // the seed is ordered parent-first and sorted here as a backstop.
  console.log('Taxonomy…');
  const orderedTaxonomy = [
    ...TAXONOMY.filter((t) => !t.parent),
    ...TAXONOMY.filter((t) => t.parent),
  ];
  for (const term of orderedTaxonomy) {
    const result = await upsertCategory(
      upsertCategorySchema.parse({
        categoryType: term.facet,
        slug: term.slug,
        label: term.label,
        description: term.description,
        parentSlug: term.parent ?? null,
      }),
    );
    console.log(
      `  ${result.created ? 'created' : 'described'} ${result.categoryType}/${result.slug}`,
    );
  }

  console.log('\nIngredients…');
  for (const ingredient of INGREDIENTS) {
    const result = await upsertIngredient(
      upsertIngredientSchema.parse(ingredient),
    );
    console.log(`  ${result.created ? 'created' : 'updated'} ${result.slug}`);
  }

  console.log('\nRecipes…');
  const existing = new Set(
    (await db.select({ slug: recipes.slug }).from(recipes)).map((r) => r.slug),
  );

  for (const seed of RECIPES) {
    const slug = seed.recipe.slug;
    if (slug && existing.has(slug) && !force) {
      console.log(`  skip ${slug} (already present)`);
      continue;
    }

    let currentSlug = slug;
    if (!slug || !existing.has(slug)) {
      const created = await createRecipe(
        createRecipeSchema.parse(seed.recipe),
        'import',
      );
      currentSlug = created.slug;
      console.log(`  created ${created.slug} (revision 1)`);
    }

    for (const revision of seed.revisions ?? []) {
      const result = await reviseRecipe(
        reviseRecipeSchema.parse({ slug: currentSlug, ...revision }),
        'import',
      );
      console.log(`    revision ${result.revisionNumber}`);
    }
  }

  console.log('\nRecipe links…');
  for (const link of RECIPE_LINKS) {
    await withTransaction(async (tx) => {
      const [from] = await tx
        .select({ id: recipes.id })
        .from(recipes)
        .where(eq(recipes.slug, link.from))
        .limit(1);
      const [to] = await tx
        .select({ id: recipes.id })
        .from(recipes)
        .where(eq(recipes.slug, link.to))
        .limit(1);
      if (!from || !to) {
        console.log(`  skip ${link.from} → ${link.to} (missing recipe)`);
        return;
      }
      await tx
        .insert(recipeLinks)
        .values({
          fromRecipeId: from.id,
          toRecipeId: to.id,
          kind: link.kind,
          note: link.note ?? null,
        })
        .onConflictDoNothing();
      console.log(`  ${link.from} → ${link.to} (${link.kind})`);
    });
  }

  console.log('\nExperiments…');
  const existingExperiments = new Set(
    (
      await db.select({ slug: experimentsTable.slug }).from(experimentsTable)
    ).map((e) => e.slug),
  );
  for (const experiment of EXPERIMENTS) {
    if (experiment.slug && existingExperiments.has(experiment.slug) && !force) {
      console.log(`  skip ${experiment.slug} (already present)`);
      continue;
    }
    const result = await logExperiment(logExperimentSchema.parse(experiment));
    console.log(
      `  ${result.slug}: ${result.itemCount} items, ${result.observationCount} observations`,
    );
  }

  console.log('\nDone.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
