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
 * **The order of a seed's `notes` array is load-bearing.** `writeNotes`
 * stores it as `notes.position` (migration 0006), and every screen that
 * draws notes reads them back in it — including `/science`, which numbers a
 * study's mechanisms `M1…Mn` by their place in that list. Reordering the
 * array in seed-data.ts renames a mechanism; adding one in the middle
 * renames every mechanism after it. Append, unless the rename is the point.
 * Two loads of an unchanged seed produce the same order, which is what lets
 * `pnpm export` write byte-identical files.
 *
 * The third form is what `pnpm build` runs. It is off unless asked for,
 * because a build must not decide on its own to write to the database it is
 * deploying against.
 */
import { readFileSync } from 'node:fs';
import type { CreateRecipeArgs } from '@/lib/domain/schemas';
import { loadEnv } from './env';

loadEnv();

/**
 * The half of a seed record the mass-flow pass below reads.
 *
 * A recipe and a revision hold these two fields in the same shape — one is
 * `CreateRecipeArgs`, the other `RevisionSeed` — so the pass walks both
 * through this rather than through either concrete type.
 */
type RevisionBody = {
  massFlow?: CreateRecipeArgs['massFlow'];
  notes?: CreateRecipeArgs['notes'];
};

/**
 * A file on the branch is the primary way to ask for the archive.
 *
 * The obvious alternative — `[ingest]` in the commit message — was tried
 * first and did not survive contact with a real deployment. The diagnostic
 * below says why: VERCEL_GIT_COMMIT_MESSAGE reached the build, but Vercel
 * truncates it at roughly a thousand characters, and the marker sat at the
 * end of a long message. So that route works only for a marker near the
 * start, and only where the project exposes system environment variables
 * at all — two conditions invisible from inside this repository.
 *
 * A committed file has neither. It is in the checkout by definition, it
 * shows up in the diff of the pull request that asks for the load, and
 * deleting it is how you stop asking. The commit-message route is still
 * honoured, with that caveat.
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
  const {
    recipes,
    experiments: experimentsTable,
    ingredients: ingredientsTable,
    taxonomyTerms,
  } = await import('@/db/schema');
  const {
    addMassFlow,
    createRecipe,
    describeMechanism,
    reviseRecipe,
    upsertIngredient,
    upsertCategory,
    logExperiment,
    ConflictError,
  } = await import('@/lib/queries/write');
  const { getRecipeBySlug } = await import('@/lib/queries/read');
  const { slugify } = await import('@/lib/domain/slug');
  const { withTransaction } = await import('@/db/client');
  const { recipeLinks } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const {
    addMassFlowSchema,
    createRecipeSchema,
    describeMechanismSchema,
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
  // WHAT IS DELETED STAYS DELETED, and this is where that is decided — for
  // ALL FOUR passes, which is the part that took two goes to get right.
  //
  // A load must not undo a delete somebody made on purpose. The first attempt
  // gave the tag and ingredient passes an explicit check and left the recipe
  // and experiment passes to get it free: each reads the BASE table for what
  // is already present, so a deleted row counts as present and is skipped.
  //
  // That is true of `pnpm ingest` and false of `pnpm ingest --force`, which
  // is a documented, supported way to add revisions from a terminal — and
  // `--force` is exactly the flag that skips "already present". A deleted
  // seeded RUN then reached `logExperiment`, which restores a deleted run by
  // design, so the run came back with the notes its delete had cascaded and
  // nothing said so. A deleted seeded RECIPE reached `reviseRecipe`, which
  // refuses one, so the load aborted on an unhandled ConflictError with the
  // tag and ingredient passes already committed and the experiment and link
  // passes never run.
  //
  // So every pass now reads `deleted_at` for itself, before `force` is
  // consulted, and none of them is allowed to write through a tool that
  // restores: `upsertCategory` and `upsertIngredient` restore by design,
  // because naming one in a real recipe line is proof it exists, and
  // `logExperiment` restores for the same reason. `pnpm build` runs this
  // script on any deployment that asks for the archive, so a restore here is
  // a deleted record coming back on a deploy.
  //
  // The skip is printed rather than silent, and it names the way back. That
  // is the rule the mass-flow pass below states for itself: a visible skip an
  // operator can act on beats a silent write.
  const deletedTags = new Map(
    (
      await db
        .select({
          facet: taxonomyTerms.facet,
          slug: taxonomyTerms.slug,
          deletedAt: taxonomyTerms.deletedAt,
        })
        .from(taxonomyTerms)
    )
      .filter((row) => row.deletedAt !== null)
      .map((row) => [`${row.facet}/${row.slug}`, row.deletedAt!]),
  );
  const deletedIngredients = new Map(
    (
      await db
        .select({
          slug: ingredientsTable.slug,
          deletedAt: ingredientsTable.deletedAt,
        })
        .from(ingredientsTable)
    )
      .filter((row) => row.deletedAt !== null)
      .map((row) => [row.slug, row.deletedAt!]),
  );
  const deletedRecipes = new Map(
    (
      await db
        .select({ slug: recipes.slug, deletedAt: recipes.deletedAt })
        .from(recipes)
    )
      .filter((row) => row.deletedAt !== null)
      .map((row) => [row.slug, row.deletedAt!]),
  );
  const deletedExperiments = new Map(
    (
      await db
        .select({
          slug: experimentsTable.slug,
          deletedAt: experimentsTable.deletedAt,
        })
        .from(experimentsTable)
    )
      .filter((row) => row.deletedAt !== null)
      .map((row) => [row.slug, row.deletedAt!]),
  );
  const deletedOn = (at: Date) => at.toISOString().slice(0, 10);
  const skipDeleted = (what: string, at: Date) =>
    console.log(
      `  skip ${what} (deleted on ${deletedOn(at)} — ` +
        'restore_record to bring it back)',
    );

  console.log('Taxonomy…');
  const orderedTaxonomy = [
    ...TAXONOMY.filter((t) => !t.parent),
    ...TAXONOMY.filter((t) => t.parent),
  ];
  for (const term of orderedTaxonomy) {
    const gone = deletedTags.get(`${term.facet}/${term.slug}`);
    if (gone) {
      skipDeleted(`${term.facet}/${term.slug}`, gone);
      continue;
    }
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
    // The key `upsertIngredient` matches on, which is what a seed entry
    // without an explicit `slug` resolves to. Almost none of them carry one.
    const key = ingredient.slug ?? slugify(ingredient.name);
    const gone = deletedIngredients.get(key);
    if (gone) {
      skipDeleted(key, gone);
      continue;
    }
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
    // BEFORE `force` is consulted. `--force` is what turns the check below
    // off, and a deleted recipe is the one thing it must not turn off.
    const gone = slug ? deletedRecipes.get(slug) : undefined;
    if (gone) {
      skipDeleted(slug!, gone);
      continue;
    }
    if (slug && existing.has(slug) && !force) {
      console.log(`  skip ${slug} (already present)`);
      continue;
    }

    // A ConflictError here is one recipe refusing, not a broken load, and it
    // is the same argument the experiments loop below makes: every write in
    // this script is its own transaction, so a throw leaves the passes that
    // already ran committed and the passes after it unrun. The check above
    // covers the deleted recipe this used to abort on; this covers anything
    // else `createRecipe` or `reviseRecipe` refuses — a taken slug, a step
    // naming a line that a rewritten seed no longer has — with a line saying
    // which recipe stopped and why.
    try {
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
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      console.log(`  skip ${slug ?? seed.recipe.title}: ${error.message}`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Mass flow figures and mechanism conditions — D-12 and D-02
  // ───────────────────────────────────────────────────────────────────────
  //
  // On a database that has never been loaded these two fields arrive with
  // the recipe: `createRecipe` and `reviseRecipe` write `massFlow` and a
  // note's `conditions` straight from the seed above. This pass then finds
  // both already present and says so.
  //
  // It exists for the database that HAS been loaded. Both fields were added
  // after the archive was in Postgres, and nothing else reaches back: the
  // loop above skips a recipe that exists, `--force` appends revisions
  // rather than filling columns on stored ones, and a revision whose only
  // change is a diagram breaks "every revision records why it exists" and
  // moves a number that is in URLs and in the ticked-ingredient keys.
  //
  // The two writes it makes are additions and not edits. Each names a
  // record that is already stored and fills a field that has never held a
  // value; each refuses a second write. So this reads first, writes only
  // into a gap, and running it twice does nothing the second time — which
  // is what keeps `pnpm ingest` idempotent.
  console.log('\nMass flow figures and mechanism conditions…');
  for (const seed of RECIPES) {
    const slug = seed.recipe.slug;
    if (!slug) continue;

    // WHICH STORED REVISION EACH SEED VERSION IS — resolved by identity,
    // never by counting.
    //
    // Revision 1 is the recipe as created and the seed's revisions follow
    // it, so on a database this seed loaded exactly once the nth entry is
    // revision n + 2. That arithmetic is only safe if the seed ran once.
    // `pnpm ingest --force` re-runs every seed revision through
    // `reviseRecipe`, which always appends `MAX(revision_number) + 1` and
    // has no no-op guard, and AGENTS.md documents --force as the supported
    // way to add revisions from a terminal. A biltong that was force-loaded
    // once holds revisions 1–11 with 11 current; the arithmetic would then
    // write the figure onto revision 6, log it as a success, and leave
    // /recipes/baumy-biltong drawing nothing — on exactly the loaded
    // database this pass exists for. Re-running would not repair it either,
    // because `addMassFlow` refuses the second write.
    //
    // `rationale` is what a revision IS — every revision records why it
    // exists, and the seed states it verbatim — so the stored revision
    // carrying it is the seed entry. A rationale that matches no stored
    // revision, or more than one, is not guessed at: the pass says which,
    // names the current revision, and moves on. A visible skip an operator
    // can act on beats a silent write to a version nobody reads.
    const head = await getRecipeBySlug(slug);
    if (!head) {
      console.log(`  skip ${slug} (not stored)`);
      continue;
    }
    const currentRevision = head.revision.revisionNumber;

    const versions = [
      { rationale: seed.recipe.rationale, body: seed.recipe as RevisionBody },
      ...(seed.revisions ?? []).map((revision) => ({
        rationale: revision.rationale,
        body: revision as RevisionBody,
      })),
    ];

    for (const { rationale, body } of versions) {
      const mechanisms = (body.notes ?? []).filter(
        (note) => (note.conditions ?? []).length > 0,
      );
      if (!body.massFlow && mechanisms.length === 0) continue;

      const named = rationale
        ? `"${rationale.slice(0, 48)}${rationale.length > 48 ? '…' : ''}"`
        : '(no rationale)';
      const matches = rationale
        ? head.revisions.filter((r) => r.rationale === rationale)
        : [];
      if (matches.length !== 1) {
        console.log(
          `  skip ${slug} ${named}: ${matches.length} stored revisions ` +
            `state it, expected 1. Current revision is ${currentRevision}. ` +
            'Call add_mass_flow or describe_mechanism naming the revision ' +
            'you mean.',
        );
        continue;
      }
      const revisionNumber = matches[0]!.revisionNumber;

      const stored = await getRecipeBySlug(slug, revisionNumber);
      if (!stored) {
        console.log(`  skip ${slug} revision ${revisionNumber} (not stored)`);
        continue;
      }

      if (body.massFlow) {
        if (stored.revision.massFlow) {
          console.log(
            `  skip ${slug} revision ${revisionNumber} mass flow (already recorded)`,
          );
        } else {
          await addMassFlow(
            addMassFlowSchema.parse({ slug, revisionNumber, ...body.massFlow }),
          );
          console.log(
            `  ${slug} revision ${revisionNumber} of ${currentRevision}: ` +
              `mass flow, ${body.massFlow.stages.length} stages`,
          );
        }
      }

      for (const note of mechanisms) {
        // Matched on kind and title because that pair is what a person
        // reads. A seeded note carries no stable identifier of its own —
        // `notes.id` is a random uuid minted at insert — so there is
        // nothing else to match on, and a title that no longer matches
        // means the seed changed and the note should be re-read, not
        // guessed at.
        const match = stored.notes.find(
          (candidate) =>
            candidate.kind === note.kind && candidate.title === note.title,
        );
        if (!match) {
          console.log(
            `  skip "${note.title}" on ${slug} (no note with that title)`,
          );
          continue;
        }
        if (match.conditions.length > 0) {
          console.log(`  skip "${note.title}" on ${slug} (already described)`);
          continue;
        }
        await describeMechanism(
          describeMechanismSchema.parse({
            noteId: match.id,
            conditions: note.conditions,
          }),
        );
        console.log(
          `  ${slug} revision ${revisionNumber}: "${note.title}" — ` +
            `${note.conditions!.length} ` +
            `${note.conditions!.length === 1 ? 'condition' : 'conditions'}`,
        );
      }
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
    // The same check the taxonomy, ingredient and recipe passes make, and for
    // the sharpest version of the reason: `logExperiment` RESTORES a deleted
    // run by design — that is the escape hatch a run whose recipe is still
    // deleted needs — so without this, `pnpm ingest --force` brought every
    // withdrawn seeded run back, with its notes, and printed it as a success.
    const goneRun = experiment.slug
      ? deletedExperiments.get(experiment.slug)
      : undefined;
    if (goneRun) {
      skipDeleted(experiment.slug!, goneRun);
      continue;
    }
    if (experiment.slug && existingExperiments.has(experiment.slug) && !force) {
      console.log(`  skip ${experiment.slug} (already present)`);
      continue;
    }
    // A ConflictError here is one run refusing, not a broken load. The
    // mass-flow pass above already prefers a visible skip to an abort for the
    // same reason: every write in this script is its own transaction, so a
    // throw leaves the half that ran behind it committed, and `pnpm ingest
    // --force` re-logs every seeded run — one of which may name a version
    // somebody withdrew. Say which run stopped and why, and load the rest.
    try {
      const result = await logExperiment(logExperimentSchema.parse(experiment));
      console.log(
        `  ${result.slug}: ${result.itemCount} items, ${result.observationCount} observations`,
      );
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      console.log(`  skip ${experiment.slug}: ${error.message}`);
    }
  }

  console.log('\nDone.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
