import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * What the write layer refuses to change, and what it refuses to lose.
 *
 * The repository exists because a recipe kept being re-derived instead of
 * getting better, so the whole model rests on two promises: a stored
 * revision is what it was, and a write either lands whole or does not land.
 * Both are invisible when they hold. This file makes each one observable.
 *
 * Three shapes of promise are covered, and they fail differently:
 *
 * - **Never edited.** A later revision does not reach back into an earlier
 *   one, and a note pinned to a version stays on that version.
 * - **Written once.** `add_mass_flow` and `describe_mechanism` are the only
 *   two writes that reach a record that already exists. Each may turn
 *   absent into present and nothing else. `e2e/mcp-contract.spec.ts` covers
 *   the sequential refusal; what is here is the concurrent one, because the
 *   connector is multi-client by design and READ COMMITTED lets two callers
 *   both read "absent" unless the row is locked.
 * - **All or nothing.** `withTransaction` is the reason a recipe cannot end
 *   up with a revision that has no ingredients. AGENTS.md calls that state
 *   worse than no recipe, because the site renders it as an empty dish.
 *   Nothing tested it: every other refusal in this system is pre-flight, so
 *   a rollback is only reachable where a write has already inserted rows
 *   before something later refuses.
 */

const KEPT_SLUG = 'data-immutable-kept';
const ROLLBACK_SLUG = 'data-immutable-rollback';
const FLOW_SLUG = 'data-immutable-flow';
const RACE_FLOW_SLUG = 'data-immutable-flow-race';
const MECHANISM_SLUG = 'data-immutable-mechanism';
const RUN_SLUG = 'data-immutable-run';

/** How many callers race for the same one-shot write. */
const RACERS = 8;

interface WriteResult {
  slug: string;
  revisionNumber: number;
}

interface NoteResult {
  noteId: string;
}

interface RecipeResult {
  slug: string;
  title: string;
  revisionNumber: number;
  /** The version being read, which is where a rationale and a figure live. */
  revision: {
    revisionNumber: number;
    rationale: string | null;
    servings: number | null;
    massFlow: { label: string; value: string | null }[] | null;
  };
  ingredients: {
    rawText: string;
    quantity: number | null;
    unit: string | null;
    ingredient: { slug: string; name: string } | null;
  }[];
  steps: { instruction: string }[];
  notes: {
    id: string;
    kind: string;
    title: string | null;
    conditions: string[];
  }[];
  revisions: { revisionNumber: number; rationale: string | null }[];
}

interface ExperimentResult {
  slug: string;
  title: string;
  items: { label: string }[];
  observations: { metric: string; value: number | null }[];
}

function rw() {
  return mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
}

/**
 * The message off a refused call, without the throw.
 *
 * The same helper `e2e/mcp-contract.spec.ts` uses, and for the same reason:
 * a negated `toThrow` cannot tell a call that failed differently from one
 * that never failed at all, and half of what these tests assert is that a
 * call was refused rather than quietly accepted.
 */
async function refusal(call: Promise<unknown>): Promise<string> {
  try {
    await call;
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('The call was accepted. It had to be refused.');
}

/** Every name a line answers to, so an assertion cannot pass vacuously. */
function names(recipe: RecipeResult): string {
  return recipe.ingredients
    .flatMap((line) => [line.rawText, line.ingredient?.name])
    .filter(Boolean)
    .join(' | ');
}

test.describe.configure({ mode: 'serial' });

test.describe('what a stored record refuses', () => {
  test('a later revision does not reach back into an earlier one', async () => {
    const mcp = rw();

    await mcp.call<WriteResult>('create_recipe', {
      title: 'Immutable subject',
      slug: KEPT_SLUG,
      kind: 'recipe',
      rationale: 'The first version, and the one this test reads back.',
      servings: 4,
      ingredients: [
        { name: 'Immutable ox cheek', quantity: 800, unit: 'g' },
        { name: 'Immutable stout', quantity: 500, unit: 'ml' },
      ],
      steps: [{ instruction: 'Brown the cheek in dripping.' }],
    });

    // A note pinned to revision 1, not to the recipe. It has to stay there.
    await mcp.call<NoteResult>('add_note', {
      recipeSlug: KEPT_SLUG,
      revisionNumber: 1,
      kind: 'observation',
      title: 'Version one was too sweet',
      body: 'The stout carried more sugar than the wine it replaced.',
    });

    await mcp.call<WriteResult>('revise_recipe', {
      slug: KEPT_SLUG,
      rationale: 'Wine instead of stout, and less of it.',
      servings: 6,
      ingredients: [
        { name: 'Immutable ox cheek', quantity: 800, unit: 'g' },
        { name: 'Immutable red wine', quantity: 300, unit: 'ml' },
      ],
      steps: [{ instruction: 'Brown the cheek in oil.' }],
    });

    const first = await mcp.call<RecipeResult>('get_recipe', {
      slug: KEPT_SLUG,
      revisionNumber: 1,
    });

    // Every field of the superseded version is what was written into it.
    expect(first.revision.rationale).toBe(
      'The first version, and the one this test reads back.',
    );
    expect(first.revision.servings).toBe(4);
    expect(names(first)).toMatch(/stout/i);
    expect(names(first)).not.toMatch(/red wine/i);
    expect(first.steps.map((step) => step.instruction)).toEqual([
      'Brown the cheek in dripping.',
    ]);

    // The note went to a version, so it is on that version and nowhere else.
    // A note that leaked forward would tell a cook that the version they are
    // reading has a fault it does not have.
    expect(first.notes.map((note) => note.title)).toContain(
      'Version one was too sweet',
    );

    const current = await mcp.call<RecipeResult>('get_recipe', {
      slug: KEPT_SLUG,
    });
    expect(current.revisionNumber).toBe(2);
    expect(current.notes.map((note) => note.title)).not.toContain(
      'Version one was too sweet',
    );
  });

  test('a mass flow figure belongs to the version that was weighed', async () => {
    const mcp = rw();

    await mcp.call<WriteResult>('create_recipe', {
      title: 'Weighed subject',
      slug: FLOW_SLUG,
      kind: 'recipe',
      rationale: 'A batch that was actually put on the scales.',
      ingredients: [{ name: 'Weighed pork loin', quantity: 3, unit: 'kg' }],
      steps: [{ instruction: 'Cure, then hang.' }],
      massFlow: {
        stages: [
          { label: 'Raw', quantity: 3, unit: 'kg' },
          { label: 'Cured', quantity: 1.8, unit: 'kg' },
        ],
        netChangePercent: -40,
      },
    });

    await mcp.call<WriteResult>('revise_recipe', {
      slug: FLOW_SLUG,
      rationale: 'More salt in the cure. This batch was never weighed.',
      ingredients: [
        { name: 'Weighed pork loin', quantity: 3, unit: 'kg' },
        { name: 'Weighed curing salt', quantity: 90, unit: 'g' },
      ],
    });

    const weighed = await mcp.call<RecipeResult>('get_recipe', {
      slug: FLOW_SLUG,
      revisionNumber: 1,
    });
    expect(weighed.revision.massFlow?.map((stage) => stage.label)).toEqual([
      'Raw',
      'Cured',
    ]);

    // A mass flow is a measurement of one batch. Carrying it forward would
    // put a figure on a version nobody weighed — the ingredients and the
    // steps carry forward because an unchanged intent is still true, and a
    // measurement is not an intent.
    const current = await mcp.call<RecipeResult>('get_recipe', {
      slug: FLOW_SLUG,
    });
    expect(current.revisionNumber).toBe(2);
    expect(current.revision.massFlow).toBeNull();
  });

  test('a refused revision leaves no half-written version behind', async () => {
    const mcp = rw();

    await mcp.call<WriteResult>('create_recipe', {
      title: 'Rollback subject',
      slug: ROLLBACK_SLUG,
      kind: 'recipe',
      rationale: 'Two lines of one ingredient, which is legitimate.',
      ingredients: [
        {
          name: 'Rollback glutinous rice',
          quantity: 40,
          unit: 'g',
          component: 'Powder',
        },
        {
          name: 'Rollback glutinous rice',
          quantity: 400,
          unit: 'g',
          component: 'To serve',
        },
      ],
      steps: [{ instruction: 'Toast the powder rice in a dry pan.' }],
    });

    const before = await mcp.call<RecipeResult>('get_recipe', {
      slug: ROLLBACK_SLUG,
    });
    expect(before.revisionNumber).toBe(1);
    expect(before.revisions).toHaveLength(1);

    // A steps-only revision naming a line that fits both. The refusal is in
    // `reviseRecipe` rather than in the schema — the carried-forward lines
    // are not in the caller's hand, so Zod never sees them — and by the time
    // it fires the new revision row has already been inserted.
    await refusal(
      mcp.call('revise_recipe', {
        slug: ROLLBACK_SLUG,
        rationale: 'Adding the soaking step.',
        steps: [
          {
            instruction: 'Rice into cold water.',
            uses: ['Rollback glutinous rice'],
          },
        ],
      }),
    );

    const after = await mcp.call<RecipeResult>('get_recipe', {
      slug: ROLLBACK_SLUG,
    });

    // THE ASSERTION THAT NEEDS THE TRANSACTION. Without the rollback the
    // revision row survives its own refusal: `revisions` grows to two,
    // `/recipes/…/revisions/2` answers 200, and what it draws is a version
    // with no ingredients and no steps. AGENTS.md calls that worse than no
    // recipe, because the site renders it as an empty dish.
    expect(after.revisions).toHaveLength(1);
    expect(after.revisionNumber).toBe(1);
    expect(after.steps.map((step) => step.instruction)).toEqual([
      'Toast the powder rice in a dry pan.',
    ]);
  });

  test('a re-log that fails part way keeps the measurements it already held', async () => {
    const mcp = rw();

    await mcp.call('log_experiment', {
      slug: RUN_SLUG,
      title: 'Rollback batch',
      summary: 'Four pieces, weighed in and weighed out.',
      items: [{ label: 'A1' }, { label: 'A2' }],
      observations: [
        { item: 'A1', metric: 'initial_weight', value: 412 },
        { item: 'A2', metric: 'initial_weight', value: 388 },
      ],
    });

    // `logExperiment` DELETES the stored items and observations before it
    // writes the new ones, so this is the one write in the repository where
    // a failure half way through destroys data that was already recorded.
    // A value of 1e11 passes `z.number().finite()` and overflows
    // `numeric(14,4)`, so the insert fails after the delete has run.
    await refusal(
      mcp.call('log_experiment', {
        slug: RUN_SLUG,
        title: 'Rollback batch',
        observations: [{ item: 'A1', metric: 'final_weight', value: 1e11 }],
      }),
    );

    const run = await mcp.call<ExperimentResult>('get_experiment', {
      slug: RUN_SLUG,
    });

    // The measurements are the whole value of a batch log, and there is no
    // revision history to recover them from.
    expect(run.items.map((item) => item.label)).toEqual(['A1', 'A2']);
    expect(
      run.observations.map((o) => o.value).sort((a, b) => a! - b!),
    ).toEqual([388, 412]);
  });

  test('one figure reaches a revision, however many callers send one at once', async () => {
    const mcp = rw();

    await mcp.call<WriteResult>('create_recipe', {
      title: 'Contended figure subject',
      slug: RACE_FLOW_SLUG,
      kind: 'recipe',
      rationale: 'A version that gets its figure from whoever wins.',
      ingredients: [
        { name: 'Contended beef silverside', quantity: 4, unit: 'kg' },
      ],
      steps: [{ instruction: 'Hang until it is ready.' }],
    });

    // Separate clients, so each call gets its own MCP session and the
    // requests are genuinely concurrent rather than queued behind one
    // session. Each sends a different first stage, so the stored figure
    // says which caller won.
    const racers = Array.from({ length: RACERS }, (_, index) => ({
      index,
      client: mcpClient(test.info().project.use.baseURL!, tokens().readWrite),
    }));

    const settled = await Promise.allSettled(
      racers.map(({ index, client }) =>
        client.call('add_mass_flow', {
          slug: RACE_FLOW_SLUG,
          stages: [
            { label: `Raw ${index}`, quantity: 4, unit: 'kg' },
            { label: 'Dried', quantity: 2, unit: 'kg' },
          ],
        }),
      ),
    );

    const winners = settled.filter((r) => r.status === 'fulfilled');
    // A figure records what a batch weighed. Two of them on one version is
    // not a merge conflict — it is a measurement that has been overwritten
    // by a different batch, with nothing to say it happened.
    expect(winners).toHaveLength(1);

    const stored = await mcp.call<RecipeResult>('get_recipe', {
      slug: RACE_FLOW_SLUG,
    });
    expect(stored.revision.massFlow).toHaveLength(2);
    // Exactly one "Raw n" survived, and it is a whole figure rather than
    // stages from several callers interleaved.
    expect(stored.revision.massFlow![0]!.label).toMatch(/^Raw \d$/);
  });

  test('one set of conditions reaches a note, however many callers send one at once', async () => {
    const mcp = rw();

    await mcp.call<WriteResult>('create_recipe', {
      title: 'Contended mechanism subject',
      slug: MECHANISM_SLUG,
      kind: 'recipe',
      rationale: 'A science note that several callers try to qualify at once.',
      ingredients: [
        { name: 'Contended egg white', quantity: 3, unit: 'piece' },
      ],
      steps: [{ instruction: 'Whip to soft peaks.' }],
    });

    const note = await mcp.call<NoteResult>('add_note', {
      recipeSlug: MECHANISM_SLUG,
      kind: 'science',
      title: 'Why a copper bowl helps',
      body: 'Copper ions bind to conalbumin and slow over-coagulation.',
    });

    const racers = Array.from({ length: RACERS }, (_, index) => ({
      index,
      client: mcpClient(test.info().project.use.baseURL!, tokens().readWrite),
    }));

    const settled = await Promise.allSettled(
      racers.map(({ index, client }) =>
        client.call<{ conditions: string[] }>('describe_mechanism', {
          noteId: note.noteId,
          conditions: [`caller ${index}`],
        }),
      ),
    );

    const winners = settled.filter(
      (r): r is PromiseFulfilledResult<{ conditions: string[] }> =>
        r.status === 'fulfilled',
    );
    expect(winners).toHaveLength(1);

    // …and what is stored is what the caller that succeeded was told it
    // stored. A second writer that quietly replaced the first would leave
    // the winner holding a receipt for conditions nobody can read back.
    const stored = await mcp.call<RecipeResult>('get_recipe', {
      slug: MECHANISM_SLUG,
    });
    const written = stored.notes.find((n) => n.id === note.noteId)!;
    expect(written.conditions).toEqual(winners[0]!.value.conditions);
  });

  test('a note is added to, never edited', async () => {
    const mcp = rw();

    await mcp.call('add_note', {
      recipeSlug: MECHANISM_SLUG,
      kind: 'correction',
      title: 'The copper claim overstates it',
      body: 'A clean stainless bowl and a pinch of cream of tartar do as well.',
    });

    const recipe = await mcp.call<RecipeResult>('get_recipe', {
      slug: MECHANISM_SLUG,
    });

    // Both are there. The model's answer to a wrong note is another note,
    // so the write layer offers no path that would remove or rewrite one —
    // and a reader can see that the claim was revised rather than silently
    // swapped.
    const titles = recipe.notes.map((note) => note.title);
    expect(titles).toContain('Why a copper bowl helps');
    expect(titles).toContain('The copper claim overstates it');
  });
});

/**
 * A move changes where a note is, never what it says.
 *
 * `reattach_note` is the one write in this connector that reaches a stored
 * note and changes which record holds it (D-13), so it sits in the file
 * that guards the rule it looks like an exception to. It is not one: a
 * note's TEXT being fixed and its LOCATION being fixed are two decisions,
 * and only the first follows from the revision rule.
 */
test.describe('a note can move without being edited', () => {
  const MOVE_A = 'data-immutable-move-from';
  const MOVE_B = 'data-immutable-move-to';

  interface MovedNote {
    id: string;
    kind: string;
    title: string | null;
    body: string;
    createdAt: string;
    movedFrom: string[];
    sources: { title: string | null }[];
  }
  interface MoveResult {
    noteId: string;
    from: string;
    to: string;
    previousSubjects: string[];
  }
  interface RecipeNotes {
    notes: MovedNote[];
  }

  test('sets up two recipes and a note on the first', async () => {
    const mcp = rw();
    for (const [slug, title] of [
      [MOVE_A, 'The recipe the note starts on'],
      [MOVE_B, 'The recipe the note moves to'],
    ]) {
      await mcp.call('create_recipe', {
        title,
        slug,
        kind: 'recipe',
        rationale: 'A destination for a note that moves.',
        ingredients: [{ name: 'Water', quantity: 1, unit: 'l' }],
        steps: [{ instruction: 'Wait.' }],
      });
    }
  });

  test('every field a reader reads survives the move unchanged', async () => {
    const mcp = rw();

    // A research note, because it is the kind that carries sources — the
    // part of a note most likely to be dropped by a careless UPDATE.
    const { noteId } = await mcp.call<{ noteId: string }>('add_note', {
      recipeSlug: MOVE_A,
      kind: 'research',
      title: 'A sourced claim that will be moved',
      body: 'The body, which must come back byte for byte.',
      sources: [{ title: 'Shimizu, Dashi, 2019, p. 42.' }],
    });

    const before = (
      await mcp.call<RecipeNotes>('get_recipe', { slug: MOVE_A })
    ).notes.find((n) => n.id === noteId)!;

    await mcp.call<MoveResult>('reattach_note', {
      noteId,
      recipeSlug: MOVE_B,
    });

    const after = (
      await mcp.call<RecipeNotes>('get_recipe', { slug: MOVE_B })
    ).notes.find((n) => n.id === noteId)!;

    expect(after.kind).toBe(before.kind);
    expect(after.title).toBe(before.title);
    expect(after.body).toBe(before.body);
    // The date the note was WRITTEN, not the date it was moved. A move that
    // restamped this would rewrite when the claim was made.
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.sources.map((s) => s.title)).toEqual(
      before.sources.map((s) => s.title),
    );
    // The one thing that does change, and it only ever grows.
    expect(before.movedFrom).toEqual([]);
    expect(after.movedFrom).toEqual([`recipe:${MOVE_A}`]);
  });

  test('one move lands, however many callers send one at once', async () => {
    const mcp = rw();
    const { noteId } = await mcp.call<{ noteId: string }>('add_note', {
      recipeSlug: MOVE_A,
      kind: 'observation',
      body: 'A note that several callers try to move at the same moment.',
    });

    // Every racer aims at the same destination, so they are told apart by
    // which one is allowed to append to `previousSubjects`. Two winners
    // would append twice and invent a home the note never had.
    const racers = Array.from({ length: RACERS }, () =>
      mcpClient(test.info().project.use.baseURL!, tokens().readWrite),
    );

    const settled = await Promise.allSettled(
      racers.map((client) =>
        client.call<MoveResult>('reattach_note', {
          noteId,
          recipeSlug: MOVE_B,
        }),
      ),
    );
    const winners = settled.filter(
      (r): r is PromiseFulfilledResult<MoveResult> => r.status === 'fulfilled',
    );
    expect(winners).toHaveLength(1);

    // And what is stored is what the winner was told it stored.
    const stored = (
      await mcp.call<RecipeNotes>('get_recipe', { slug: MOVE_B })
    ).notes.find((n) => n.id === noteId)!;
    expect(stored.movedFrom).toEqual(winners[0]!.value.previousSubjects);
    expect(stored.movedFrom).toEqual([`recipe:${MOVE_A}`]);
  });
});
