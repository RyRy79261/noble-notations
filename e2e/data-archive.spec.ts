import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mcpClient, tokens } from './helpers';

/**
 * The two round trips the archive rests on.
 *
 * `pnpm ingest` loads `content/` into the database and `pnpm export` writes
 * the database back out to `content/generated/`. Both are claimed to be
 * safe to repeat — the ingest "is idempotent, so it is safe to run against a
 * database that already has content", the export "byte-identical, so a diff
 * here is always a change to a recipe". Neither claim had a test, and both
 * are the kind that hold until they quietly do not.
 *
 * They matter for different reasons. The ingest runs on a Vercel build
 * whenever a deployment asks for it, and AGENTS.md warns that a marked
 * preview build writes to what is probably the production database — so an
 * ingest that stopped skipping would append a second copy of the archive to
 * production, on a build nobody was watching. The export is the offline
 * copy of everything, and it is reviewed as a git diff; a run that reordered
 * its own output would fill that diff with noise until a reader learned to
 * skip it, at which point the copy is unreviewed.
 *
 * WHY THE EXPORT RUNS IN A SCRATCH DIRECTORY. `scripts/export-markdown.ts`
 * writes to `path.join(process.cwd(), 'content', 'generated')` and deletes
 * that directory first. Run from the repository it would replace the
 * committed export with one made from a database this suite has been
 * writing test recipes into, and leave the working tree dirty for whoever
 * ran the suite. Given a different working directory it writes there
 * instead, so the committed archive is never touched.
 */

/** The project root. Playwright runs from it. */
const ROOT = process.cwd();
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');
const TSCONFIG = path.join(ROOT, 'tsconfig.json');
const EXPORTER = path.join(ROOT, 'scripts', 'export-markdown.ts');

interface Stats {
  recipes: number;
  revisions: number;
  ingredients: number;
  terms: number;
  notes: number;
  experiments: number;
}

interface RecipeResult {
  slug: string;
  revisionNumber: number;
  revisions: { revisionNumber: number }[];
}

function rw() {
  return mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
}

/** Every file under `dir`, as paths relative to it, sorted. */
function tree(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(path.relative(dir, full));
    }
  };
  walk(dir);
  return out.sort();
}

/** Run the exporter with a working directory of its own. */
function exportInto(dir: string): string {
  execFileSync(TSX, ['--tsconfig', TSCONFIG, EXPORTER], {
    cwd: dir,
    stdio: 'pipe',
    env: { ...process.env, NODE_OPTIONS: '--conditions=react-server' },
  });
  return path.join(dir, 'content', 'generated');
}

test.describe.configure({ mode: 'serial' });

test.describe('the archive round trips', () => {
  // Both of these shell out to a script that talks to the database, which
  // is slower than a tool call by an order of magnitude.
  test.slow();

  test('a second ingest of the same archive adds nothing', async () => {
    const mcp = rw();

    const before = await mcp.call<Stats>('get_repository_stats', {});
    const biltongBefore = await mcp.call<RecipeResult>('get_recipe', {
      slug: 'baumy-biltong',
    });

    // The same command `e2e/global-setup.ts` seeded with, and the same one
    // a Vercel build runs when a deployment asks for the archive. No
    // `--force`: the deploy path never passes it either.
    execFileSync('pnpm', ['ingest'], { stdio: 'pipe', env: process.env });

    const after = await mcp.call<Stats>('get_repository_stats', {});

    // Not one row anywhere. A recipe that stopped being skipped would show
    // up here as a recipe count that moved, and in production as a second
    // copy of the archive with no way to tell the copies apart.
    expect(after).toEqual(before);

    // And the recipe with the deepest history is the one to check by hand:
    // an ingest that appended instead of skipping would take a six-revision
    // recipe to twelve and move what a reader sees as current.
    const biltongAfter = await mcp.call<RecipeResult>('get_recipe', {
      slug: 'baumy-biltong',
    });
    expect(biltongAfter.revisionNumber).toBe(biltongBefore.revisionNumber);
    expect(biltongAfter.revisions).toHaveLength(biltongBefore.revisions.length);
  });

  test('an ingest does not resurrect a tag or an ingredient somebody deleted', async () => {
    const mcp = rw();

    // THE RECIPE AND THE EXPERIMENT PASSES read the base table for what is
    // already present, so a deleted row counts as present and is skipped.
    // These two passes had no such check and both write through an upsert,
    // and `upsertCategory` and `upsertIngredient` RESTORE by design. So a
    // seeded tag and a seeded ingredient came back on the next load, with
    // the notes their delete cascaded, logging the same word they log for a
    // live row. `pnpm build` runs `pnpm ingest:deploy`, so it was a deploy
    // undoing an owner's delete with nothing in the build log to say so.
    //
    // The test above cannot catch it: it asserts row COUNTS, and a restore
    // changes no count.
    await mcp.call('delete_record', {
      kind: 'tag',
      slug: 'german',
      categoryType: 'cuisine',
      reason: 'Deleted on purpose by e2e/data-archive.spec.ts.',
    });
    await mcp.call('delete_record', {
      kind: 'ingredient',
      slug: 'star-anise',
      reason: 'Deleted on purpose by e2e/data-archive.spec.ts.',
    });

    const log = execFileSync('pnpm', ['ingest'], {
      stdio: 'pipe',
      env: process.env,
    }).toString();

    // A visible skip an operator can act on, not a silent write.
    expect(log).toContain('skip cuisine/german (deleted on');
    expect(log).toContain('skip star-anise (deleted on');
    expect(log).toContain('restore_record');

    await expect(
      mcp.call('get_ingredient', { slug: 'star-anise' }),
    ).rejects.toThrow();
    const categories = await mcp.call<{ slug: string }[]>('list_categories', {
      categoryType: 'cuisine',
    });
    expect(categories.some((row) => row.slug === 'german')).toBe(false);

    // Put both back, so the two exports below run against the whole archive.
    await mcp.call('restore_record', {
      kind: 'tag',
      slug: 'german',
      categoryType: 'cuisine',
    });
    await mcp.call('restore_record', {
      kind: 'ingredient',
      slug: 'star-anise',
    });
  });

  test('an ingest --force does not resurrect a recipe or a run, and does not abort', async () => {
    const mcp = rw();

    // `--force` IS THE HOLE THE TEST ABOVE CANNOT SEE. That one runs plain
    // `pnpm ingest`, where the recipe and the experiment passes skip
    // anything already present and a deleted row counts as present. `--force`
    // is exactly the flag that turns "already present" off, and AGENTS.md
    // documents it as the supported way to add revisions from a terminal.
    //
    // Both passes broke, differently:
    //
    // - The RUN: `logExperiment` restores a deleted run by design — that is
    //   the escape hatch a run whose recipe is still deleted needs — so a
    //   withdrawn seeded run came back with the notes its delete cascaded,
    //   logged as a success.
    // - The RECIPE: `reviseRecipe` refuses a deleted recipe, so the load
    //   died on an unhandled ConflictError with a raw stack trace at exit 1,
    //   AFTER the taxonomy and ingredient passes had committed and BEFORE
    //   the links and experiments passes ran.
    //
    // The run goes first and on its own, so it carries its own event and the
    // recipe's cascade skips it — which is also what makes the restore order
    // at the end exact.
    await mcp.call('delete_record', {
      kind: 'experiment',
      slug: 'biltong-batch-4',
      reason: 'Deleted on purpose by e2e/data-archive.spec.ts.',
    });
    await mcp.call('delete_record', {
      kind: 'recipe',
      slug: 'baumy-biltong',
      reason: 'Deleted on purpose by e2e/data-archive.spec.ts.',
    });

    // execFileSync throws on a non-zero exit, so reaching the next line is
    // itself the assertion that the load no longer aborts.
    const log = execFileSync('pnpm', ['ingest', '--force'], {
      stdio: 'pipe',
      env: process.env,
    }).toString();

    // The same skip the taxonomy and ingredient passes print, from the
    // recipe and experiment passes, and BEFORE `force` is consulted. The
    // wording is what says the pass read `deleted_at` itself rather than
    // relying on a downstream tool to refuse.
    expect(log).toContain('skip baumy-biltong (deleted on');
    expect(log).toContain('skip biltong-batch-4 (deleted on');
    expect(log).toContain('restore_record');

    // Every pass after the one that used to throw ran to the end.
    expect(log).toContain('Recipe links…');
    expect(log).toContain('Experiments…');
    expect(log.trimEnd().endsWith('Done.')).toBe(true);

    // And nothing came back.
    await expect(
      mcp.call('get_recipe', { slug: 'baumy-biltong' }),
    ).rejects.toThrow();
    await expect(
      mcp.call('get_experiment', { slug: 'biltong-batch-4' }),
    ).rejects.toThrow();

    // The recipe first: a run cannot be restored while the recipe it names
    // is still deleted, and the run carries its own event so the recipe's
    // restore does not reach it.
    await mcp.call('restore_record', { kind: 'recipe', slug: 'baumy-biltong' });
    await mcp.call('restore_record', {
      kind: 'experiment',
      slug: 'biltong-batch-4',
    });
    const back = await mcp.call<RecipeResult>('get_recipe', {
      slug: 'baumy-biltong',
    });
    // Six, not eleven: `--force` skipped the recipe rather than appending
    // its five seeded revisions to a record somebody had withdrawn.
    expect(back.revisions).toHaveLength(6);
  });

  test('two exports of one database are byte-identical', async () => {
    const first = mkdtempSync(path.join(tmpdir(), 'nn-export-a-'));
    const second = mkdtempSync(path.join(tmpdir(), 'nn-export-b-'));

    try {
      const one = exportInto(first);
      const two = exportInto(second);

      const filesOne = tree(one);
      const filesTwo = tree(two);

      // The export exists and is not a stub. Every assertion below is
      // satisfied by two empty directories.
      expect(filesOne.length).toBeGreaterThan(5);
      expect(filesOne).toContain(path.join('baumy-biltong', 'current.md'));
      expect(filesOne).toContain('README.md');

      // Same files, same names, same nesting.
      expect(filesTwo).toEqual(filesOne);

      // Same bytes. Three things have broken this before and all three
      // were clocks or missing sort keys rather than anything about a
      // recipe: the order of notes and of the sources under a note, an
      // unordered `listRecipeSlugs`, and two timestamps. A byte comparison
      // is the only assertion that covers all three at once, and it is
      // what "a diff here is always a change to a recipe" means.
      const differing = filesOne.filter(
        (file) =>
          !readFileSync(path.join(one, file)).equals(
            readFileSync(path.join(two, file)),
          ),
      );
      expect(differing).toEqual([]);
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });

  test('the export follows the database rather than the committed archive', async () => {
    const mcp = rw();

    await mcp.call('create_recipe', {
      title: 'Exported subject',
      slug: 'data-archive-exported',
      kind: 'recipe',
      rationale: 'Written through the connector, so only the database has it.',
      ingredients: [{ name: 'Exported turnip', quantity: 400, unit: 'g' }],
      steps: [{ instruction: 'Roast the turnip hard.' }],
    });

    const dir = mkdtempSync(path.join(tmpdir(), 'nn-export-c-'));
    try {
      const out = exportInto(dir);
      const files = tree(out);

      // The database is the source of truth and this is the readable copy
      // of it, so a recipe that exists only in the database has to appear.
      // An export that read `content/` instead would be a copy of the
      // input, which is a copy of nothing.
      expect(files).toContain(path.join('data-archive-exported', 'current.md'));

      const written = readFileSync(
        path.join(out, 'data-archive-exported', 'current.md'),
        'utf8',
      );
      expect(written).toContain('Exported subject');
      expect(written).toMatch(/400 g/);
      expect(written).toContain('Roast the turnip hard.');

      // The index names it too, so the copy is navigable rather than a heap
      // of files.
      expect(readFileSync(path.join(out, 'README.md'), 'utf8')).toContain(
        'data-archive-exported',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
