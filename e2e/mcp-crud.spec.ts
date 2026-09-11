import { test, expect } from '@playwright/test';
import {
  mcpClient,
  tokens,
  type AdvertisedTool,
  type McpClient,
} from './helpers';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * FULL CRUD OVER THE REAL WIRE: correct a record, delete one, bring it back.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The connector could only ever add. It can now correct three records and
 * delete six, and a delete is SOFT: the row stays, it stops being visible,
 * and `restore_record` brings it back. Everything here goes through the MCP
 * endpoint with a real bearer token, because a helper that wrote
 * `deleted_at` itself would test the column and not the tool.
 *
 * WHAT EACH GROUP DEFENDS, AND WHY IT IS NOT OBVIOUS:
 *
 * - **The correction tools.** `revise_recipe` and `update_revision` are the
 *   one pair in this surface where the wrong pick destroys something and no
 *   refusal can detect it, because both calls are valid. So the tests below
 *   assert the property that separates them: an update makes NO version and
 *   moves NO number, and a revise makes one and moves one.
 * - **The cascade stamp.** One delete mints one event id and writes it to
 *   every row it touches, and each UPDATE carries `deleted_at IS NULL` — so a
 *   row that was already deleted is skipped and keeps its own stamp. That is
 *   the whole of the child-deleted-first case, and it has no bookkeeping to
 *   go wrong; it has an assertion instead.
 * - **The pointer.** `recipes.current_revision_id` must always name a live
 *   revision of a live recipe. Deleting the current one moves it to the
 *   newest survivor BY DATE, which is not the highest number — a backfilled
 *   version carries a later number and an earlier date, and pointing at the
 *   number makes a recipe read as its own oldest version.
 * - **The retired number.** A deleted revision keeps its number, so the next
 *   revise cannot reuse it and `/recipes/x/revisions/3` answers 404 forever.
 *   A hard delete would free the number and an old bookmark would quietly
 *   draw a different version. This is the second place the *soft* part of
 *   the delete earns its keep.
 * - **The withdrawn version.** A run pinned to a deleted version is not
 *   deleted with it: the run happened. It keeps the number and says the
 *   version was withdrawn, because both other answers state something false
 *   — a hard delete would null the link and make the run say it recorded no
 *   version, and hiding the fact sends a reader at a page that 404s.
 * - **The write side.** A write that names a deleted row by its own key
 *   RESTORES it when the tool is an upsert and REFUSES when the tool appends
 *   or corrects.
 */

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`;

function rw(): McpClient {
  return mcpClient(BASE, tokens().readWrite);
}

/**
 * A name nothing else in the suite uses.
 *
 * The counter matters as much as the clock: several of these tests write
 * three records inside one millisecond, and a slug that collided would fail
 * with a message about uniqueness rather than about what is under test.
 */
let counter = 0;
function stamp(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

interface WriteResult {
  slug: string;
  revisionNumber: number;
  message: string;
}
interface NoteResult {
  noteId: string;
}
interface UpsertResult {
  slug: string;
  created?: boolean;
  restored: boolean;
}
interface DeleteResult {
  kind: string;
  id: string;
  handle: string;
  deletedAt: string;
  eventId: string;
  cascaded: { kind: string; count: number }[];
  message: string;
}
interface RestoreResult {
  kind: string;
  id: string;
  handle: string;
  restored: { kind: string; count: number }[];
  message: string;
}
interface RecipeResult {
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  kind: string;
  revisionNumber: number;
  terms: { categoryType: string; slug: string; label: string }[];
  revision: {
    revisionNumber: number;
    title: string;
    rationale: string | null;
    servings: number | null;
    massFlow: { label: string; value: string | null }[] | null;
  };
  ingredients: {
    rawText: string;
    quantity: number | null;
    ingredient: { slug: string; name: string } | null;
  }[];
  steps: { instruction: string }[];
  notes: {
    id: string;
    kind: string;
    title: string | null;
    body: string;
    conditions: string[];
    sources: { url: string | null; title: string | null }[];
  }[];
  revisions: { revisionNumber: number; rationale: string | null }[];
  links: { kind: string; recipe: { slug: string } }[];
}
interface ExperimentResult {
  slug: string;
  title: string;
  revisionNumber: number | null;
  revisionWithdrawn: boolean;
}
interface BinRow {
  kind: string;
  id: string;
  handle: string;
  reason: string | null;
  deletedBy: string | null;
  address: Record<string, unknown>;
  withParent: { kind: string; handle: string } | null;
  restoreBlockedBy: { kind: string; handle: string } | null;
}

/** A minimal recipe with one line and one step. Returns its slug. */
async function makeRecipe(
  mcp: McpClient,
  slug: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  await mcp.call('create_recipe', {
    title: `CRUD ${slug}`,
    slug,
    rationale: 'Written by e2e/mcp-crud.spec.ts.',
    ingredients: [{ name: `CRUD salt ${slug}`, quantity: 10, unit: 'g' }],
    steps: [{ instruction: 'Salt it and wait.' }],
    ...extra,
  });
  return slug;
}

/** Run a call and hand back the refusal text, or fail when it succeeded. */
async function refusal(run: Promise<unknown>, what: string): Promise<string> {
  try {
    await run;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`${what} was accepted and should have been refused`);
}

// ═════════════════════════════════════════════════════════════════════════
// 1. The three correction tools
// ═════════════════════════════════════════════════════════════════════════

test('update_recipe corrects the record and touches no version', async () => {
  const mcp = rw();
  const id = stamp();
  const other = await makeRecipe(mcp, `crud-link-${id}`);
  const slug = await makeRecipe(mcp, `crud-update-recipe-${id}`, {
    subtitle: 'The wrong subtitle',
    summary: 'The wrong summary.',
    categories: { technique: [`CRUD wrong ${id}`] },
  });

  const before = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(before.revisionNumber).toBe(1);

  await mcp.call('update_recipe', {
    slug,
    title: `CRUD corrected ${id}`,
    subtitle: 'The right subtitle',
    summary: 'The right summary.',
    kind: 'preparation',
    originNote: 'Corrected by the CRUD spec.',
    // Both of these REPLACE the whole list. A caller that means to keep a
    // tag sends it back; that is why the description says to call get_recipe
    // first, and it is the behaviour asserted here.
    categories: { technique: [`CRUD right ${id}`] },
    links: [{ kind: 'variant_of', slug: other }],
  });

  const after = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(after.title).toBe(`CRUD corrected ${id}`);
  expect(after.subtitle).toBe('The right subtitle');
  expect(after.summary).toBe('The right summary.');
  expect(after.kind).toBe('preparation');
  expect(after.terms.map((t) => t.label)).toEqual([`CRUD right ${id}`]);
  expect(after.links.map((l) => l.recipe.slug)).toEqual([other]);

  // THE PROPERTY THAT SEPARATES THIS TOOL FROM revise_recipe. No version was
  // made, no number moved, and the stored version is byte-for-byte what it
  // was: the food did not change, the record was wrong.
  expect(after.revisionNumber).toBe(1);
  expect(after.revisions).toHaveLength(1);
  expect(after.revision.rationale).toBe(before.revision.rationale);
  expect(after.ingredients.map((i) => i.rawText)).toEqual(
    before.ingredients.map((i) => i.rawText),
  );
  expect(after.steps).toEqual(before.steps);

  // And the slug is the public address, so it is not renamable: the recipe
  // still answers where it did.
  expect(after.slug).toBe(slug);
});

test('update_recipe moves what people read, and refuses a version that is deleted', async () => {
  const mcp = rw();
  const slug = await makeRecipe(mcp, `crud-pointer-${stamp()}`);
  await mcp.call('revise_recipe', {
    slug,
    rationale: 'A second version, with more salt.',
    ingredients: [{ name: 'Second salt', quantity: 20, unit: 'g' }],
    steps: [{ instruction: 'Salt it twice.' }],
  });
  await mcp.call('revise_recipe', { slug, rationale: 'A third version.' });

  expect(
    (await mcp.call<RecipeResult>('get_recipe', { slug })).revisionNumber,
  ).toBe(3);

  // This is the explicit way to say what people read, and it is the reason
  // the field exists: a restore deliberately does not move the pointer back.
  await mcp.call('update_recipe', { slug, currentRevisionNumber: 1 });
  const moved = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(moved.revisionNumber).toBe(1);
  expect(moved.ingredients[0]!.quantity).toBe(10);
  // Every version stays. Moving the pointer is not a delete.
  expect(moved.revisions.map((r) => r.revisionNumber).sort()).toEqual([
    1, 2, 3,
  ]);

  await mcp.call('delete_record', {
    kind: 'revision',
    slug,
    revisionNumber: 2,
    reason: 'A version written twice.',
  });
  const message = await refusal(
    mcp.call('update_recipe', { slug, currentRevisionNumber: 2 }),
    'pointing a recipe at a deleted version',
  );
  // The invariant: current_revision_id always names a LIVE revision of a
  // live recipe, and every child read depends on it.
  expect(message).toMatch(/deleted/i);
  expect(message).toContain('restore_record');
});

test('update_revision corrects a stored version in place and makes no version', async () => {
  const mcp = rw();
  const id = stamp();
  const slug = await makeRecipe(mcp, `crud-update-revision-${id}`);
  await mcp.call('revise_recipe', {
    slug,
    rationale: 'A second version, which must not be touched.',
    ingredients: [{ name: 'Untouched pepper', quantity: 5, unit: 'g' }],
    steps: [{ instruction: 'Leave this alone.' }],
  });

  await mcp.call('update_revision', {
    slug,
    revisionNumber: 1,
    title: `CRUD corrected version ${id}`,
    rationale: 'The rationale said 400 g and nobody cooked 400 g.',
    servings: 4,
    // Both lists replace wholly, and they are sent together because a step
    // names a line: `checkStepReferences` refuses a step that points at a
    // line the call does not carry.
    ingredients: [
      { name: `Corrected salt ${id}`, quantity: 40, unit: 'g' },
      { name: `Corrected water ${id}`, quantity: 1, unit: 'l' },
    ],
    steps: [
      {
        instruction: 'Dissolve the salt in the water.',
        uses: [`Corrected salt ${id}`, `Corrected water ${id}`],
      },
    ],
  });

  const one = await mcp.call<RecipeResult>('get_recipe', {
    slug,
    revisionNumber: 1,
  });
  expect(one.revision.title).toBe(`CRUD corrected version ${id}`);
  expect(one.revision.rationale).toMatch(/nobody cooked 400 g/);
  expect(one.revision.servings).toBe(4);
  expect(one.ingredients.map((i) => i.quantity)).toEqual([40, 1]);
  expect(one.steps.map((s) => s.instruction)).toEqual([
    'Dissolve the salt in the water.',
  ]);

  // NO NEW VERSION AND NO NUMBER MOVED. A correction that quietly appended a
  // revision would be `revise_recipe` under another name, and the caller
  // that reached for it because the record was wrong would find the history
  // says a person cooked the dish twice.
  const current = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(current.revisionNumber).toBe(2);
  expect(current.revisions.map((r) => r.revisionNumber).sort()).toEqual([1, 2]);
  // And version 2 is untouched: an update reaches the version it names.
  expect(current.ingredients.map((i) => i.ingredient?.name)).toEqual([
    'Untouched pepper',
  ]);
  expect(current.steps.map((s) => s.instruction)).toEqual([
    'Leave this alone.',
  ]);
});

test('update_revision replaces a mass flow figure and removes one, where add_mass_flow cannot', async () => {
  const mcp = rw();
  const slug = await makeRecipe(mcp, `crud-flow-${stamp()}`);
  await mcp.call('add_mass_flow', {
    slug,
    stages: [
      { label: 'Raw', quantity: 1000, unit: 'g' },
      { label: 'Dried', quantity: 450, unit: 'g' },
    ],
  });

  // add_mass_flow is fill-once and stays fill-once — but the sentence it
  // refuses with used to say a figure "cannot be changed once it is
  // written", and `update_revision` makes that false. The refusal now names
  // the tool that can.
  const refused = await refusal(
    mcp.call('add_mass_flow', {
      slug,
      stages: [
        { label: 'Raw', quantity: 2000, unit: 'g' },
        { label: 'Dried', quantity: 900, unit: 'g' },
      ],
    }),
    'a second add_mass_flow',
  );
  expect(refused).toMatch(/already has a mass flow figure/);
  expect(refused).toContain('update_revision');
  expect(refused).toContain('revise_recipe');

  await mcp.call('update_revision', {
    slug,
    revisionNumber: 1,
    massFlow: {
      stages: [
        { label: 'Raw', quantity: 2000, unit: 'g' },
        { label: 'Dried', quantity: 900, unit: 'g', emphasis: true },
      ],
    },
  });
  const replaced = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(replaced.revision.massFlow!.map((s) => s.value)).toEqual([
    '2000 g',
    '900 g',
  ]);

  // An explicit null removes the figure; an omitted field leaves it alone.
  await mcp.call('update_revision', { slug, revisionNumber: 1, servings: 2 });
  expect(
    (await mcp.call<RecipeResult>('get_recipe', { slug })).revision.massFlow,
  ).not.toBeNull();
  await mcp.call('update_revision', {
    slug,
    revisionNumber: 1,
    massFlow: null,
  });
  expect(
    (await mcp.call<RecipeResult>('get_recipe', { slug })).revision.massFlow,
  ).toBeNull();
});

test('update_note corrects a note and moves it to another recipe', async () => {
  const mcp = rw();
  const id = stamp();
  const from = await makeRecipe(mcp, `crud-note-from-${id}`);
  const to = await makeRecipe(mcp, `crud-note-to-${id}`);

  const note = await mcp.call<NoteResult>('add_note', {
    recipeSlug: from,
    kind: 'science',
    title: 'The wrong claim',
    body: 'Salt melts at 40 °C.',
  });
  await mcp.call('describe_mechanism', {
    noteId: note.noteId,
    conditions: ['40 °C'],
  });

  // describe_mechanism is the other fill-once tool, and its refusal used to
  // say conditions "cannot be changed". It names update_note now.
  const refused = await refusal(
    mcp.call('describe_mechanism', {
      noteId: note.noteId,
      conditions: ['801 °C'],
    }),
    'a second describe_mechanism',
  );
  expect(refused).toMatch(/already states its conditions/);
  expect(refused).toContain('update_note');
  expect(refused).toContain('correction');

  await mcp.call('update_note', {
    noteId: note.noteId,
    title: 'The right claim',
    body: 'Salt melts at 801 °C.',
    conditions: ['801 °C', 'dry'],
    sources: [
      { url: 'https://example.invalid/salt', title: 'A melting point' },
    ],
  });

  const corrected = (
    await mcp.call<RecipeResult>('get_recipe', { slug: from })
  ).notes.find((n) => n.id === note.noteId)!;
  expect(corrected.title).toBe('The right claim');
  expect(corrected.body).toBe('Salt melts at 801 °C.');
  expect(corrected.conditions).toEqual(['801 °C', 'dry']);
  expect(corrected.sources.map((s) => s.title)).toEqual(['A melting point']);

  // A subject field moves the note. All five subject columns are rewritten,
  // so the note leaves the recipe it was on rather than hanging off two.
  await mcp.call('update_note', { noteId: note.noteId, recipeSlug: to });
  expect(
    (await mcp.call<RecipeResult>('get_recipe', { slug: from })).notes.map(
      (n) => n.id,
    ),
  ).not.toContain(note.noteId);
  expect(
    (await mcp.call<RecipeResult>('get_recipe', { slug: to })).notes.map(
      (n) => n.id,
    ),
  ).toContain(note.noteId);

  // An empty list clears one, which is the only way to say "there are none".
  await mcp.call('update_note', { noteId: note.noteId, conditions: [] });
  expect(
    (await mcp.call<RecipeResult>('get_recipe', { slug: to })).notes.find(
      (n) => n.id === note.noteId,
    )!.conditions,
  ).toEqual([]);
});

test('an update that names no field is refused, and the refusal names revise_recipe', async () => {
  const mcp = rw();
  const slug = await makeRecipe(mcp, `crud-empty-${stamp()}`);
  const note = await mcp.call<NoteResult>('add_note', {
    recipeSlug: slug,
    kind: 'observation',
    body: 'Something happened.',
  });

  // Accepting one of these would write `updated_at` and report success, and
  // the caller would read that as "the correction landed".
  for (const [tool, args] of [
    ['update_recipe', { slug }],
    ['update_revision', { slug, revisionNumber: 1 }],
    ['update_note', { noteId: note.noteId }],
  ] as const) {
    const message = await refusal(mcp.call(tool, args), `an empty ${tool}`);
    expect(message, tool).toMatch(/change nothing|at least one field/i);
    expect(message, tool).toContain('revise_recipe');
  }
});

test('no correction tool asks for a reason', async () => {
  // This is the owner's instruction and it is also the rule: a rationale
  // records why the DISH changed, and a correction is the statement that it
  // did not. A required reason here would be friction paid for a sentence
  // that is false by construction.
  const advertised = await rw().listToolSchemas();
  const required = (name: string) => {
    const tool = advertised.find((t) => t.name === name);
    expect(tool, `${name} is not registered`).toBeTruthy();
    const schema = tool!.inputSchema as { required?: string[] };
    return (schema.required ?? []).sort();
  };

  expect(required('update_recipe')).toEqual(['slug']);
  expect(required('update_revision')).toEqual(['revisionNumber', 'slug']);
  expect(required('update_note')).toEqual(['noteId']);
  // And `delete_record` asks for a reason in its description without making
  // it required, because a delete here is reversible.
  expect(required('delete_record')).toEqual(['kind']);
  expect(required('restore_record')).toEqual(['kind']);
});

// ═════════════════════════════════════════════════════════════════════════
// 2. Delete and restore, one of every kind
// ═════════════════════════════════════════════════════════════════════════

test('each of the six kinds deletes and comes back', async () => {
  test.slow();
  const mcp = rw();
  const id = stamp();

  const slug = await makeRecipe(mcp, `crud-six-${id}`, {
    categories: { technique: [`CRUD six ${id}`] },
  });
  await mcp.call('revise_recipe', { slug, rationale: 'A second version.' });
  const note = await mcp.call<NoteResult>('add_note', {
    recipeSlug: slug,
    kind: 'observation',
    body: 'A note of its own.',
  });
  await mcp.call('log_experiment', {
    slug: `crud-six-run-${id}`,
    title: `CRUD six run ${id}`,
    recipeSlug: slug,
    revisionNumber: 1,
  });
  await mcp.call('upsert_ingredient', {
    name: `CRUD six spice ${id}`,
    slug: `crud-six-spice-${id}`,
    category: 'spice',
    description: 'An ingredient that goes and comes back.',
  });

  /** Is this record readable right now? One probe per kind. */
  const readable: Record<string, () => Promise<boolean>> = {
    recipe: async () =>
      Boolean(
        await mcp
          .call('get_recipe', { slug })
          .then(() => true)
          .catch(() => false),
      ),
    revision: async () =>
      (await mcp.call<RecipeResult>('get_recipe', { slug })).revisions.some(
        (r) => r.revisionNumber === 1,
      ),
    note: async () =>
      (await mcp.call<RecipeResult>('get_recipe', { slug })).notes.some(
        (n) => n.id === note.noteId,
      ),
    experiment: async () =>
      mcp
        .call('get_experiment', { slug: `crud-six-run-${id}` })
        .then(() => true)
        .catch(() => false),
    ingredient: async () =>
      mcp
        .call('get_ingredient', { slug: `crud-six-spice-${id}` })
        .then(() => true)
        .catch(() => false),
    tag: async () =>
      (await mcp.call<{ slug: string }[]>('list_categories', {})).some(
        (t) => t.slug === `crud-six-${id}`,
      ),
  };

  const addresses: [string, Record<string, unknown>][] = [
    ['revision', { kind: 'revision', slug, revisionNumber: 1 }],
    ['note', { kind: 'note', id: note.noteId }],
    ['experiment', { kind: 'experiment', slug: `crud-six-run-${id}` }],
    ['ingredient', { kind: 'ingredient', slug: `crud-six-spice-${id}` }],
    ['tag', { kind: 'tag', slug: `crud-six-${id}`, categoryType: 'technique' }],
    // The recipe goes last: deleting it takes the other three with it, and
    // each of those has to be tested on its own first.
    ['recipe', { kind: 'recipe', slug }],
  ];

  for (const [kind, address] of addresses) {
    expect(
      await readable[kind]!(),
      `${kind} is not readable to begin with`,
    ).toBe(true);

    const deleted = await mcp.call<DeleteResult>('delete_record', {
      ...address,
      reason: `A ${kind} written by mistake.`,
    });
    expect(deleted.kind).toBe(kind);
    expect(
      deleted.handle.length,
      `${kind} has no readable handle`,
    ).toBeGreaterThan(0);
    expect(deleted.message).toContain('restore_record');
    expect(await readable[kind]!(), `${kind} is still readable`).toBe(false);

    const back = await mcp.call<RestoreResult>('restore_record', address);
    expect(back.kind).toBe(kind);
    expect(back.handle).toBe(deleted.handle);
    expect(await readable[kind]!(), `${kind} did not come back`).toBe(true);
  }
});

test('a recipe takes its versions, its notes and its runs, and one restore brings the same set back', async () => {
  const mcp = rw();
  const id = stamp();
  const slug = await makeRecipe(mcp, `crud-cascade-${id}`);
  await mcp.call('revise_recipe', { slug, rationale: 'A second version.' });
  await mcp.call('add_note', {
    recipeSlug: slug,
    kind: 'observation',
    body: 'A note on the recipe.',
  });
  await mcp.call('add_note', {
    recipeSlug: slug,
    revisionNumber: 1,
    kind: 'observation',
    body: 'A note on version one.',
  });
  const run = `crud-cascade-run-${id}`;
  await mcp.call('log_experiment', {
    slug: run,
    title: `CRUD cascade run ${id}`,
    recipeSlug: slug,
    revisionNumber: 2,
  });
  await mcp.call('add_note', {
    experimentSlug: run,
    kind: 'observation',
    body: 'A note on the run.',
  });

  const deleted = await mcp.call<DeleteResult>('delete_record', {
    kind: 'recipe',
    slug,
    reason: 'A recipe two chats wrote twice.',
  });

  // The result names what went with it, which is what makes a generic
  // `delete_record` safe to call: the blast radius is in the answer.
  expect(
    Object.fromEntries(deleted.cascaded.map((c) => [c.kind, c.count])),
  ).toEqual({ revision: 2, note: 3, experiment: 1 });
  // And it says so in the reader's vocabulary — `version` and `run`, not
  // `revision` and `experiment` — because that is the word the guide, the
  // site and every other description use.
  expect(deleted.message).toContain(
    '2 versions, 3 notes and 1 run went with it',
  );

  // The run went with the recipe rather than being left behind pointing at
  // a 404, and the alternative — nulling `experiments.recipe_id` — is a
  // destructive edit that cannot be undone.
  await expect(mcp.call('get_experiment', { slug: run })).rejects.toThrow();

  const back = await mcp.call<RestoreResult>('restore_record', {
    kind: 'recipe',
    slug,
  });
  expect(
    Object.fromEntries(back.restored.map((c) => [c.kind, c.count])),
  ).toEqual({ revision: 2, note: 3, experiment: 1 });

  const restored = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(restored.revisions).toHaveLength(2);
  expect(restored.notes).toHaveLength(1);
  expect(
    (await mcp.call<ExperimentResult>('get_experiment', { slug: run })).slug,
  ).toBe(run);
});

test('a note deleted on its own before its recipe stays deleted when the recipe comes back', async () => {
  const mcp = rw();
  const id = stamp();
  const slug = await makeRecipe(mcp, `crud-early-${id}`);
  const early = await mcp.call<NoteResult>('add_note', {
    recipeSlug: slug,
    kind: 'observation',
    body: 'Deleted early, on its own.',
  });
  const late = await mcp.call<NoteResult>('add_note', {
    recipeSlug: slug,
    kind: 'observation',
    body: 'Deleted late, with the recipe.',
  });

  await mcp.call('delete_record', {
    kind: 'note',
    id: early.noteId,
    reason: 'Its own reason, written first.',
  });
  const cascade = await mcp.call<DeleteResult>('delete_record', {
    kind: 'recipe',
    slug,
    reason: 'The recipe, written second.',
  });

  // Each UPDATE in the cascade carries `deleted_at IS NULL`, so the note
  // that was already gone is SKIPPED and keeps its own stamp. One note went
  // with the recipe; the other did not.
  expect(
    Object.fromEntries(cascade.cascaded.map((c) => [c.kind, c.count])),
  ).toEqual({ revision: 1, note: 1 });

  const restored = await mcp.call<RestoreResult>('restore_record', {
    kind: 'recipe',
    slug,
  });
  expect(
    Object.fromEntries(restored.restored.map((c) => [c.kind, c.count])),
  ).toEqual({ revision: 1, note: 1 });

  const notes = (
    await mcp.call<RecipeResult>('get_recipe', { slug })
  ).notes.map((n) => n.id);
  expect(notes, 'the note deleted late came back').toContain(late.noteId);
  expect(
    notes,
    'the note deleted early came back with the recipe',
  ).not.toContain(early.noteId);

  // It keeps its own date and its own reason, and restoring it is what
  // brings it back.
  const bin = await mcp.call<{ rows: BinRow[] }>('list_deleted', {
    kind: 'note',
    limit: 200,
  });
  const row = bin.rows.find((r) => r.id === early.noteId);
  expect(row, 'the early note is not in the bin').toBeTruthy();
  expect(row!.reason).toBe('Its own reason, written first.');
  expect(row!.withParent, 'the early note went with nothing').toBeNull();

  await mcp.call('restore_record', { kind: 'note', id: early.noteId });
  expect(
    (await mcp.call<RecipeResult>('get_recipe', { slug })).notes.map(
      (n) => n.id,
    ),
  ).toContain(early.noteId);
});

test('a restore is refused while the record it belongs to is still deleted, and the refusal names it', async () => {
  const mcp = rw();
  const id = stamp();
  const slug = await makeRecipe(mcp, `crud-blocked-${id}`);
  await mcp.call('revise_recipe', { slug, rationale: 'A second version.' });
  await mcp.call('delete_record', {
    kind: 'recipe',
    slug,
    reason: 'Everything goes at once.',
  });

  const message = await refusal(
    mcp.call('restore_record', { kind: 'revision', slug, revisionNumber: 1 }),
    'restoring a version whose recipe is deleted',
  );
  // The rule is uniform and it is what lets a restore never know the tree: a
  // cascaded child's parent is always deleted in the same event.
  expect(message).toContain('is deleted');
  expect(message).toContain('Restore that first');
  expect(message).toContain('restore_record');
  expect(message).toContain(slug);

  // And the refusal is actionable: sending what it names works.
  await mcp.call('restore_record', { kind: 'recipe', slug });
  expect(
    (await mcp.call<RecipeResult>('get_recipe', { slug })).revisions,
  ).toHaveLength(2);
});

test('list_deleted hands back arguments restore_record takes unchanged', async () => {
  const mcp = rw();
  const id = stamp();
  const slug = await makeRecipe(mcp, `crud-bin-${id}`, {
    categories: { technique: [`CRUD bin ${id}`] },
  });
  await mcp.call('upsert_ingredient', {
    name: `CRUD bin spice ${id}`,
    slug: `crud-bin-spice-${id}`,
    category: 'spice',
    description: 'An ingredient for the bin.',
  });

  const deleted = [
    await mcp.call<DeleteResult>('delete_record', {
      kind: 'recipe',
      slug,
      reason: 'For the bin.',
    }),
    await mcp.call<DeleteResult>('delete_record', {
      kind: 'ingredient',
      slug: `crud-bin-spice-${id}`,
      reason: 'For the bin.',
    }),
    await mcp.call<DeleteResult>('delete_record', {
      kind: 'tag',
      slug: `crud-bin-${id}`,
      categoryType: 'technique',
      reason: 'For the bin.',
    }),
  ];

  const bin = await mcp.call<{ rows: BinRow[]; total: number }>(
    'list_deleted',
    {
      limit: 200,
    },
  );
  expect(bin.total).toBeGreaterThanOrEqual(deleted.length);

  for (const record of deleted) {
    const row = bin.rows.find((r) => r.id === record.id);
    expect(row, `${record.handle} is not in the bin`).toBeTruthy();
    expect(row!.handle).toBe(record.handle);
    expect(row!.reason).toBe('For the bin.');
    // The bin prints who deleted the record, and this is the field the audit
    // log cannot supply: `writeMcpAudit` is fire-and-forget, nothing reads
    // that table, and it records tool CALLS rather than row state.
    expect(row!.deletedBy, 'the bin does not say who').toBeTruthy();
    expect(row!.restoreBlockedBy).toBeNull();

    // THE ROUND TRIP. The address a listing prints has to be a thing the
    // restore accepts verbatim — which it is not if the listing helpfully
    // includes both an id and a slug, because `checkRecordAddress` refuses
    // exactly that pair.
    const back = await mcp.call<RestoreResult>('restore_record', row!.address);
    expect(back.id).toBe(record.id);
  }

  // A cascaded row says what it went with, so a reader can tell a record
  // somebody deleted from one that followed something else.
  const cascadeSlug = await makeRecipe(mcp, `crud-bin-cascade-${id}`);
  await mcp.call('delete_record', { kind: 'recipe', slug: cascadeSlug });
  const after = await mcp.call<{ rows: BinRow[] }>('list_deleted', {
    kind: 'revision',
    limit: 200,
  });
  const child =
    after.rows.find((r) => r.handle.includes(cascadeSlug)) ??
    after.rows.find((r) => r.handle.includes(`CRUD ${cascadeSlug}`));
  expect(child, 'the cascaded version is not in the bin').toBeTruthy();
  expect(child!.withParent?.kind).toBe('recipe');
  expect(child!.restoreBlockedBy?.kind).toBe('recipe');
});

test('a second delete is refused, and so is a restore of something that is live', async () => {
  const mcp = rw();
  const slug = await makeRecipe(mcp, `crud-twice-${stamp()}`);

  const live = await refusal(
    mcp.call('restore_record', { kind: 'recipe', slug }),
    'restoring a live recipe',
  );
  expect(live).toMatch(/not deleted/i);

  await mcp.call('delete_record', { kind: 'recipe', slug, reason: 'Once.' });
  const twice = await refusal(
    mcp.call('delete_record', { kind: 'recipe', slug, reason: 'Twice.' }),
    'a second delete',
  );
  // Refused rather than ignored, because a second delete would overwrite the
  // first stamp — its date, its reason and its event — and the record would
  // then come back with the wrong set.
  expect(twice).toMatch(/deleted already/i);
  expect(twice).toContain('list_deleted');
  expect(twice).toContain('restore_record');

  // And the first reason survived the refusal.
  const bin = await mcp.call<{ rows: BinRow[] }>('list_deleted', {
    kind: 'recipe',
    limit: 200,
  });
  expect(bin.rows.find((r) => r.handle.includes(slug))?.reason).toBe('Once.');
});

test('an address that does not match its kind is refused, and the refusal says what to send', async () => {
  const mcp = rw();
  const slug = await makeRecipe(mcp, `crud-address-${stamp()}`);

  // The address table is enforced at the parse boundary, once, so
  // delete_record and restore_record cannot disagree about what
  // `{ kind: 'tag', slug: 'braising' }` means. A field that does not belong
  // to the kind is refused rather than dropped: dropping it silently is how
  // "the argument was discarded" reports get filed, and the cost of guessing
  // here is a caller that meant one version and deleted a recipe.
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ['a version with no number', { kind: 'revision', slug }, /revisionNumber/],
    ['a tag with no category type', { kind: 'tag', slug }, /categoryType/],
    ['a note by slug', { kind: 'note', slug }, /an `id`/],
    [
      'an id and a slug together',
      { kind: 'recipe', id: '00000000-0000-4000-8000-000000000000', slug },
      /not both/,
    ],
    ['nothing at all', { kind: 'recipe' }, /names no record/],
  ];

  for (const [what, address, expected] of cases) {
    const message = await refusal(mcp.call('delete_record', address), what);
    expect(message, what).toMatch(expected);
    const mirrored = await refusal(
      mcp.call('restore_record', address),
      `${what}, on restore`,
    );
    expect(mirrored, `${what}, on restore`).toMatch(expected);
  }
});

// ═════════════════════════════════════════════════════════════════════════
// 3. The pointer, and the numbers
// ═════════════════════════════════════════════════════════════════════════

test('deleting the current version moves the pointer to the newest survivor by date, not by number', async () => {
  const mcp = rw();
  const slug = await makeRecipe(mcp, `crud-survivor-${stamp()}`);
  await mcp.call('revise_recipe', {
    slug,
    rationale: 'The second version, and the current one.',
  });
  // A backfill takes the NEXT number and an EARLIER date. That is the whole
  // point of this fixture: version 3 is the highest number and the oldest
  // dish, so a pointer that took `MAX(revision_number)` would make the
  // recipe read as its own oldest version — which is the trap
  // `getRecipeIdentity`'s own comment warns about.
  await mcp.call('backfill_revision', {
    slug,
    occurredAt: '1999-01-01',
    rationale: 'The oldest version, written down late.',
    // A backfill states its own ingredients: nothing carries forward into
    // one, because inheriting a later version's list would invent a history
    // that never happened.
    ingredients: [{ name: 'Old salt', quantity: 1, unit: 'g' }],
    steps: [{ instruction: 'Barely salt it.' }],
  });

  const before = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(before.revisionNumber).toBe(2);
  expect(before.revisions.map((r) => r.revisionNumber)).toEqual([2, 1, 3]);

  await mcp.call('delete_record', {
    kind: 'revision',
    slug,
    revisionNumber: 2,
    reason: 'The current version, written twice.',
  });

  const after = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(
    after.revisionNumber,
    'the pointer went to the highest number rather than the newest version',
  ).toBe(1);

  // A restore does NOT move the pointer back. Restoring a version returns it
  // to the history; what people read is a separate decision, and
  // update_recipe is where somebody states it.
  await mcp.call('restore_record', {
    kind: 'revision',
    slug,
    revisionNumber: 2,
  });
  expect(
    (await mcp.call<RecipeResult>('get_recipe', { slug })).revisionNumber,
  ).toBe(1);
  await mcp.call('update_recipe', { slug, currentRevisionNumber: 2 });
  expect(
    (await mcp.call<RecipeResult>('get_recipe', { slug })).revisionNumber,
  ).toBe(2);
});

test('deleting the only version of a recipe is refused', async () => {
  const mcp = rw();
  const slug = await makeRecipe(mcp, `crud-only-${stamp()}`);

  const message = await refusal(
    mcp.call('delete_record', { kind: 'revision', slug, revisionNumber: 1 }),
    'deleting the only version',
  );
  // A null pointer is a leak, not a state: `listRecipes` would print the
  // recipe with a revision number it invented while `getRecipeBySlug`
  // returned null and the link 404d.
  expect(message).toMatch(/only version/i);
  expect(message).toContain(slug);
  expect(message).toMatch(/delete the recipe/i);

  // The recipe is untouched — the refusal happened before anything was
  // stamped, and the whole call is one transaction.
  expect(
    (await mcp.call<RecipeResult>('get_recipe', { slug })).revisionNumber,
  ).toBe(1);
});

test('a deleted version number is retired and the next revise does not reuse it', async ({
  request,
}) => {
  const mcp = rw();
  const slug = await makeRecipe(mcp, `crud-retired-${stamp()}`);
  await mcp.call('revise_recipe', { slug, rationale: 'Version two.' });
  await mcp.call('delete_record', {
    kind: 'revision',
    slug,
    revisionNumber: 2,
    reason: 'Version two was written twice.',
  });

  const next = await mcp.call<WriteResult>('revise_recipe', {
    slug,
    rationale: 'Version three, after two went.',
  });
  // THE SECOND PLACE THE SOFT PART EARNS ITS KEEP. `reviseRecipe` computes
  // `MAX(revision_number) + 1` over the BASE table, so the deleted row is
  // still there holding its number. A hard delete would have freed 2, this
  // call would have taken it, and `/recipes/x/revisions/2` — a real address
  // that a person may have bookmarked and a phone's ticked checklist keys on
  // — would quietly start drawing a different version.
  expect(next.revisionNumber).toBe(3);

  const history = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(history.revisions.map((r) => r.revisionNumber).sort()).toEqual([1, 3]);

  // AND THE REFUSAL NAMES THE VERSION, not the recipe. `getRecipeBySlug`
  // returns null both for a slug that is not here and for a live recipe
  // whose numbered version is deleted, so the tool used to answer "No recipe
  // with slug x" for a recipe it had just read — the one answer that stops a
  // model looking. Every other deleted-row path on this connector names
  // `list_deleted` or `restore_record`; this one now does too.
  const said = await refusal(
    mcp.call('get_recipe', { slug, revisionNumber: 2 }),
    'get_recipe on a deleted version',
  );
  expect(said).toContain('has no revision 2');
  expect(said).toContain('list_deleted');
  expect(said).not.toContain('No recipe with slug');

  // Not dense, and that is the point: the hole is visible and the address
  // answers 404 rather than serving a wrong page silently.
  expect((await request.get(`/recipes/${slug}/revisions/2`)).status()).toBe(
    404,
  );
  expect((await request.get(`/recipes/${slug}/revisions/3`)).status()).toBe(
    200,
  );
});

// ═════════════════════════════════════════════════════════════════════════
// 4. A run pinned to a version that was withdrawn
// ═════════════════════════════════════════════════════════════════════════

test('a run pinned to a deleted version keeps its number and says the version was withdrawn', async ({
  request,
  page,
}) => {
  const mcp = rw();
  const id = stamp();
  const slug = await makeRecipe(mcp, `crud-wd-${id}`);
  await mcp.call('revise_recipe', { slug, rationale: 'Version two.' });
  await mcp.call('revise_recipe', { slug, rationale: 'Version three.' });

  const gone = `crud-wd-gone-${id}`;
  const kept = `crud-wd-kept-${id}`;
  await mcp.call('log_experiment', {
    slug: gone,
    title: `CRUD gone run ${id}`,
    recipeSlug: slug,
    revisionNumber: 2,
    startedAt: '2024-10-18',
  });
  await mcp.call('log_experiment', {
    slug: kept,
    title: `CRUD kept run ${id}`,
    recipeSlug: slug,
    revisionNumber: 3,
    startedAt: '2024-10-19',
  });

  /**
   * What a reader sees on the index screen.
   *
   * `innerText` and not the HTML, for a reason worth stating: Next.js embeds
   * the flight payload in the document, so every rendered string appears in
   * the response body TWICE and a count over the raw text is double
   * everywhere. This reads the rendered DOM, and it also applies the CSS
   * `text-transform`, which is why every match below is case-insensitive.
   */
  const indexText = async () => {
    await page.goto('/batch-logs');
    return page.locator('body').innerText();
  };
  const withdrawnCount = (text: string) =>
    (text.match(/withdrawn/gi) ?? []).length;
  const before = withdrawnCount(await indexText());

  await mcp.call('delete_record', {
    kind: 'revision',
    slug,
    revisionNumber: 2,
    reason: 'Version two was written twice.',
  });

  // THE RUN IS NOT DELETED WITH THE VERSION, because the run happened.
  const run = await mcp.call<ExperimentResult>('get_experiment', {
    slug: gone,
  });
  expect(run.revisionNumber, 'the run lost the version it recorded').toBe(2);
  expect(run.revisionWithdrawn).toBe(true);

  const list = await mcp.call<ExperimentResult[]>('list_experiments', {
    recipeSlug: slug,
  });
  expect(list.find((e) => e.slug === gone)!.revisionWithdrawn).toBe(true);
  // The control: a run on a version that is still there says nothing.
  expect(list.find((e) => e.slug === kept)!.revisionWithdrawn).toBe(false);
  expect(list.find((e) => e.slug === kept)!.revisionNumber).toBe(3);

  // And the two screens say it. `second revision · withdrawn` rather than a
  // bare `second revision`, because the reader has to be told the version is
  // gone — not shown a dangling number and not told the run cooked nothing.
  // The screens uppercase the first letter in CSS and keep a string a screen
  // reader can pronounce, so the match is case-insensitive.
  const index = await indexText();
  expect(index).toMatch(/second revision · withdrawn/i);
  // EXACTLY ONE MORE ROW says it than before this delete. A counted delta
  // rather than a bare presence, because the index carries every run in the
  // repository and a `withdrawn` stuck on all of them would read the same.
  expect(withdrawnCount(index)).toBe(before + 1);

  const detail = await (await request.get(`/batch-logs/${gone}`)).text();
  expect(detail).toMatch(/second revision · withdrawn/i);

  // The run's own page has NEVER printed the version — its kicker is the
  // recipe and the date — so the ordinal appearing at all is what makes
  // `withdrawn` mean something. The control run therefore says neither.
  const untouched = await (await request.get(`/batch-logs/${kept}`)).text();
  expect(untouched).not.toMatch(/withdrawn/i);
  expect(untouched, 'the control page did not render').toContain(
    `CRUD kept run ${id}`,
  );

  // Restoring the version takes the word away again, on both screens.
  await mcp.call('restore_record', {
    kind: 'revision',
    slug,
    revisionNumber: 2,
  });
  expect(
    (await mcp.call<ExperimentResult>('get_experiment', { slug: gone }))
      .revisionWithdrawn,
  ).toBe(false);
  expect(withdrawnCount(await indexText())).toBe(before);
  expect(await (await request.get(`/batch-logs/${gone}`)).text()).not.toMatch(
    /withdrawn/i,
  );
});

// ═════════════════════════════════════════════════════════════════════════
// 5. The write side: restore on an upsert, refuse on an append or a correct
// ═════════════════════════════════════════════════════════════════════════

test('an upsert that names a deleted record by its own key brings it back and says so', async () => {
  const mcp = rw();
  const id = stamp();

  await mcp.call('upsert_ingredient', {
    name: `CRUD revive spice ${id}`,
    slug: `crud-revive-spice-${id}`,
    category: 'spice',
    description: 'One.',
  });
  await mcp.call('upsert_category', {
    categoryType: 'technique',
    label: `CRUD revive tag ${id}`,
    slug: `crud-revive-tag-${id}`,
    description: 'One.',
  });
  const run = `crud-revive-run-${id}`;
  await mcp.call('log_experiment', { slug: run, title: `CRUD revive ${id}` });

  await mcp.call('delete_record', {
    kind: 'ingredient',
    slug: `crud-revive-spice-${id}`,
  });
  await mcp.call('delete_record', {
    kind: 'tag',
    slug: `crud-revive-tag-${id}`,
    categoryType: 'technique',
  });
  await mcp.call('delete_record', { kind: 'experiment', slug: run });

  // Naming a record by its own key on an UPSERT is a statement that it
  // exists, so it is restored rather than refused — and the result says so,
  // because a caller that did not know it was deleted has just un-deleted
  // something and must be told.
  const spice = await mcp.call<UpsertResult>('upsert_ingredient', {
    name: `CRUD revive spice ${id}`,
    slug: `crud-revive-spice-${id}`,
    description: 'Two.',
  });
  expect(spice.restored).toBe(true);
  expect(
    await mcp.call('get_ingredient', { slug: `crud-revive-spice-${id}` }),
  ).toBeTruthy();

  const tag = await mcp.call<UpsertResult>('upsert_category', {
    categoryType: 'technique',
    label: `CRUD revive tag ${id}`,
    slug: `crud-revive-tag-${id}`,
    description: 'Two.',
  });
  expect(tag.restored).toBe(true);

  const logged = await mcp.call<UpsertResult>('log_experiment', {
    slug: run,
    title: `CRUD revive ${id}`,
  });
  expect(logged.restored).toBe(true);
  expect(await mcp.call('get_experiment', { slug: run })).toBeTruthy();

  // And a second call on a live record says nothing happened.
  expect(
    (
      await mcp.call<UpsertResult>('upsert_ingredient', {
        name: `CRUD revive spice ${id}`,
        slug: `crud-revive-spice-${id}`,
        description: 'Three.',
      })
    ).restored,
  ).toBe(false);
});

test('a write that appends to or corrects a deleted record is refused and names restore_record', async () => {
  test.slow();
  const mcp = rw();
  const id = stamp();
  const slug = await makeRecipe(mcp, `crud-refuse-${id}`);
  const note = await mcp.call<NoteResult>('add_note', {
    recipeSlug: slug,
    kind: 'science',
    body: 'A note that will be deleted.',
  });
  await mcp.call('delete_record', {
    kind: 'note',
    id: note.noteId,
    reason: 'Written by mistake.',
  });
  await mcp.call('delete_record', {
    kind: 'recipe',
    slug,
    reason: 'Written by mistake.',
  });

  const refusals: [string, Record<string, unknown>][] = [
    ['revise_recipe', { slug, rationale: 'A version for a deleted recipe.' }],
    [
      'backfill_revision',
      {
        slug,
        occurredAt: '1990-01-01',
        rationale: 'An older version.',
        ingredients: [{ name: 'Old salt', quantity: 1, unit: 'g' }],
      },
    ],
    ['add_note', { recipeSlug: slug, kind: 'observation', body: 'A note.' }],
    [
      'add_mass_flow',
      {
        slug,
        stages: [
          { label: 'Raw', quantity: 1000, unit: 'g' },
          { label: 'Dried', quantity: 450, unit: 'g' },
        ],
      },
    ],
    ['update_recipe', { slug, title: 'A corrected title' }],
    ['update_revision', { slug, revisionNumber: 1, servings: 2 }],
    ['update_note', { noteId: note.noteId, body: 'A corrected body.' }],
    ['describe_mechanism', { noteId: note.noteId, conditions: ['4 °C'] }],
  ];

  for (const [tool, args] of refusals) {
    const message = await refusal(mcp.call(tool, args), tool);
    // ConflictError and not NotFoundError, because the row EXISTS — and the
    // message has to say what to do, since "no recipe with that slug" would
    // send a caller to create a second one, which is the failure this
    // repository exists to stop.
    expect(message, tool).toMatch(/is deleted/i);
    expect(message, tool).toContain('restore_record');
  }

  // create_recipe on the same slug is refused for the same reason: a new
  // recipe at a deleted address would take over its URL and its history.
  const taken = await refusal(
    mcp.call('create_recipe', {
      title: 'A new dish at an old address',
      slug,
      rationale: 'Should not land.',
    }),
    'create_recipe on a deleted slug',
  );
  expect(taken).toContain('restore_record');

  // But create_recipe with NO slug never collides: `uniqueSlug` runs over
  // every slug, deleted ones included, so it takes the next free name rather
  // than failing or resurrecting anything.
  const fresh = await mcp.call<WriteResult>('create_recipe', {
    title: `CRUD ${slug}`,
    rationale: 'A different dish with the same title.',
  });
  expect(fresh.slug).not.toBe(slug);
  expect(await mcp.call('get_recipe', { slug: fresh.slug })).toBeTruthy();
  // And the deleted recipe is still deleted: nothing here resurrected it.
  await expect(mcp.call('get_recipe', { slug })).rejects.toThrow();
});

test('naming a deleted ingredient in a real recipe line brings it back', async () => {
  const mcp = rw();
  const id = stamp();
  await mcp.call('upsert_ingredient', {
    name: `CRUD line spice ${id}`,
    slug: `crud-line-spice-${id}`,
    category: 'spice',
    description: 'An ingredient a recipe will name.',
  });
  await mcp.call('delete_record', {
    kind: 'ingredient',
    slug: `crud-line-spice-${id}`,
    reason: 'Nobody uses it.',
  });

  // Refusing here would fail a whole recipe over a bookkeeping state, and
  // naming an ingredient in a real line IS proof that it exists. So it is
  // restored, quietly — there is nowhere in a recipe's result to say it.
  const slug = await makeRecipe(mcp, `crud-line-${id}`, {
    ingredients: [{ name: `CRUD line spice ${id}`, quantity: 5, unit: 'g' }],
    steps: [{ instruction: 'Use the spice.' }],
  });

  const ingredient = await mcp.call<{ ingredient: { slug: string } }>(
    'get_ingredient',
    { slug: `crud-line-spice-${id}` },
  );
  expect(ingredient.ingredient.slug).toBe(`crud-line-spice-${id}`);
  expect(
    (await mcp.call<RecipeResult>('get_recipe', { slug })).ingredients[0]!
      .ingredient?.slug,
  ).toBe(`crud-line-spice-${id}`);
});

// ═════════════════════════════════════════════════════════════════════════
// 6. Scope
// ═════════════════════════════════════════════════════════════════════════

test('the five new write tools need the write scope and list_deleted answers on read alone', async () => {
  const readOnly = mcpClient(BASE, tokens().readOnly);

  // Each call is shape-valid so it reaches the scope check, and each would
  // be refused a second time after it — so this sweep writes nothing even
  // against a build whose scope check has been taken out.
  const writes: [string, Record<string, unknown>][] = [
    ['update_recipe', { slug: 'no-such-recipe-for-a-scope-check', title: 'X' }],
    [
      'update_revision',
      {
        slug: 'no-such-recipe-for-a-scope-check',
        revisionNumber: 1,
        servings: 1,
      },
    ],
    [
      'update_note',
      { noteId: '00000000-0000-4000-8000-000000000000', body: 'X' },
    ],
    [
      'delete_record',
      { kind: 'recipe', slug: 'no-such-recipe-for-a-scope-check' },
    ],
    [
      'restore_record',
      { kind: 'recipe', slug: 'no-such-recipe-for-a-scope-check' },
    ],
  ];

  for (const [tool, args] of writes) {
    const message = await refusal(readOnly.call(tool, args), tool);
    expect(message, tool).toMatch(/read-only access/i);
  }

  // list_deleted is a READ, deliberately. A caller that can delete already
  // sees what it deleted in the delete's own result; the value of the bin is
  // to the caller that arrives afterwards and has to find out what is
  // missing and why. Putting it behind write would mean a read-only agent
  // could see that a recipe is absent and never learn it is recoverable.
  const bin = await readOnly.call<{ rows: BinRow[]; total: number }>(
    'list_deleted',
    { limit: 5 },
  );
  expect(Array.isArray(bin.rows)).toBe(true);
  expect(typeof bin.total).toBe('number');
});

test('the six kinds delete_record accepts are the six kinds the schema advertises', async () => {
  // The enum in the schema is how a model learns what it may delete — that
  // is the whole argument for two generic tools rather than twelve typed
  // ones, so the enum has to be there and it has to be complete.
  const advertised: AdvertisedTool[] = await rw().listToolSchemas();
  const kinds = (name: string) => {
    const tool = advertised.find((t) => t.name === name);
    expect(tool, `${name} is not registered`).toBeTruthy();
    const schema = tool!.inputSchema as {
      properties?: { kind?: { enum?: string[] } };
    };
    return (schema.properties?.kind?.enum ?? []).sort();
  };

  const six = ['experiment', 'ingredient', 'note', 'recipe', 'revision', 'tag'];
  expect(kinds('delete_record')).toEqual(six);
  expect(kinds('restore_record')).toEqual(six);
  expect(kinds('list_deleted')).toEqual(six);
});

// ═════════════════════════════════════════════════════════════════════════
// 8. What happens to a deleted row when a SECOND actor touches it
// ═════════════════════════════════════════════════════════════════════════
//
// Every test above drives one caller at a time. This connector is held by
// several conversations at once, and a build script is a caller too, so the
// four cases below are the ones a single-threaded reading of the code cannot
// see. Each one was a real defect before it was a test.

test('two delete_record calls at once do not split one record between two events', async () => {
  const mcp = rw();
  const id = stamp();
  const slug = await makeRecipe(mcp, `crud-race-${id}`);
  await mcp.call('revise_recipe', { slug, rationale: 'Version two.' });

  // Under READ COMMITTED both calls read the recipe live and both passed the
  // guard. The cascade was already safe — every cascade UPDATE carries
  // `deleted_at IS NULL`, so the loser stamped nothing — but the ROOT update
  // did not carry it, so the loser's event id overwrote the winner's on the
  // recipe while the revisions kept the winner's. `restore_record` clears by
  // the ROOT's id, so it brought back the recipe alone and left a live
  // recipe whose `current_revision_id` named a deleted revision: listed on
  // /recipes and /sitemap.xml, 404 at its own address.
  const both = await Promise.allSettled([
    mcp.call<DeleteResult>('delete_record', { kind: 'recipe', slug }),
    mcp.call<DeleteResult>('delete_record', { kind: 'recipe', slug }),
  ]);
  const won = both.filter((r) => r.status === 'fulfilled');
  expect(won).toHaveLength(1);

  // The loser is refused with the same sentence a sequential second delete
  // gets, and it names the way back.
  const lost = both.find((r) => r.status === 'rejected');
  expect(String((lost as PromiseRejectedResult).reason)).toMatch(
    /deleted|restore_record/i,
  );

  // One event holds the whole tree, so one restore returns the whole tree.
  const back = await mcp.call<RestoreResult>('restore_record', {
    kind: 'recipe',
    slug,
  });
  expect(back.restored.find((r) => r.kind === 'revision')?.count).toBe(2);

  const read = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(read.revisionNumber).toBe(2);
});

test('two delete_record calls on two revisions of one recipe leave the pointer live', async () => {
  const mcp = rw();
  const id = stamp();
  const slug = await makeRecipe(mcp, `crud-race2-${id}`);
  for (const n of [2, 3, 4, 5, 6]) {
    await mcp.call('revise_recipe', { slug, rationale: `Version ${n}.` });
  }

  // THE TEST ABOVE DELETES ONE RECORD TWICE. This deletes two records once
  // each, and the row the two calls disagree about belongs to neither of
  // them: `recipes.current_revision_id`.
  //
  // Unlocked, `deleteRecord`'s revision branch read that pointer, decided
  // from it, and wrote it, and the read was not repeated. A deleted the
  // revision the pointer named and moved the pointer onto B's target; B,
  // holding the value it read before A ran, saw a pointer that did not name
  // its own target and left it alone. Both committed and the pointer named a
  // DELETED revision — 7 rounds out of 8 in a loop, and the first ad-hoc
  // attempt. The page still drew, because `getRecipeBySlug` falls back to
  // the newest live revision, so nothing on the site said anything was
  // wrong. What did: the page foot lost its effectivity line,
  // `update_recipe` reported a deleted revision number as a success, and
  // `revise_recipe` carried the deleted revision's ingredients and steps
  // into a new LIVE revision. Deleted content public again, no restore
  // called, nothing in any log.
  const both = await Promise.allSettled([
    mcp.call<DeleteResult>('delete_record', {
      kind: 'revision',
      slug,
      revisionNumber: 6,
      reason: 'Deleted on purpose by e2e/mcp-crud.spec.ts.',
    }),
    mcp.call<DeleteResult>('delete_record', {
      kind: 'revision',
      slug,
      revisionNumber: 5,
      reason: 'Deleted on purpose by e2e/mcp-crud.spec.ts.',
    }),
  ]);
  // Both are legitimate deletes of two different records. Both must succeed;
  // a refusal here would mean the fix was a lock that serialises them into
  // one winner, which is a different bug.
  expect(
    both.map((r) => r.status),
    both
      .map((r) =>
        r.status === 'rejected'
          ? String((r as PromiseRejectedResult).reason)
          : 'ok',
      )
      .join(' | '),
  ).toEqual(['fulfilled', 'fulfilled']);

  // The invariant, read the way a reader reaches it. `get_recipe` answers
  // from the pointer, and the number it reports is the number a page foot
  // draws — it was `null` there while the fallback kept the page rendering.
  const read = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(read.revisionNumber).toBe(4);
  expect(read.revision.revisionNumber).toBe(4);
  expect(read.revisions.map((r) => r.revisionNumber)).toEqual([4, 3, 2, 1]);

  // And the third effect, which is the one that put withdrawn text back on
  // the public page: a revision appended now must carry version 4 forward,
  // not the deleted 5 or 6.
  const next = await mcp.call<WriteResult>('revise_recipe', {
    slug,
    rationale: 'Appended after the two deletes.',
  });
  expect(next.revisionNumber).toBe(7);
  const after = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(after.revision.rationale).toBe('Appended after the two deletes.');
  expect(after.ingredients.map((line) => line.ingredient?.slug)).toEqual([
    `crud-salt-crud-race2-${id}`,
  ]);
});

test('update_recipe cannot point a recipe at a revision a concurrent delete is removing', async () => {
  const mcp = rw();
  const id = stamp();
  const slug = await makeRecipe(mcp, `crud-race3-${id}`);
  for (const n of [2, 3, 4]) {
    await mcp.call('revise_recipe', { slug, rationale: `Version ${n}.` });
  }

  // The same race arriving from the other side, and it needs the same
  // answer. `updateRecipe` read the revision it was about to point at,
  // checked `deleted_at`, and wrote the pointer — three statements with
  // nothing holding the recipe row between them. A concurrent delete of that
  // very revision stamps it, sees a pointer naming something else, leaves
  // the pointer alone, and this call then moves the pointer onto the row the
  // delete just removed. 7 rounds out of 8.
  //
  // Either order is correct and both are asserted the same way, because the
  // result is the same invariant: whichever call reaches the recipe row
  // first, what the recipe points at when both have finished is LIVE.
  const both = await Promise.allSettled([
    mcp.call<WriteResult>('update_recipe', { slug, currentRevisionNumber: 2 }),
    mcp.call<DeleteResult>('delete_record', {
      kind: 'revision',
      slug,
      revisionNumber: 2,
      reason: 'Deleted on purpose by e2e/mcp-crud.spec.ts.',
    }),
  ]);
  const [update, remove] = both;

  // The delete is addressed at a live record and must always go through.
  expect(remove.status, String(remove)).toBe('fulfilled');

  const read = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(read.revisions.map((r) => r.revisionNumber)).toEqual([4, 3, 1]);
  // Never 2. Either the update lost the row and was refused, or it won it
  // and the delete moved the pointer off again.
  expect(read.revisionNumber).not.toBe(2);
  expect([1, 3, 4]).toContain(read.revisionNumber);

  // The two orders, and what each one is allowed to answer. This is the
  // ONE assertion that would have to be weakened to make the broken code
  // pass, so it is worth being exact about.
  //
  // `update_recipe` succeeding and reporting version 2 is CORRECT when the
  // update reached the recipe row first: version 2 was live when that call
  // committed, and the delete that followed moved the pointer off it. The
  // defect the review measured is the other thing — a result naming a
  // revision that was ALREADY deleted when the call ran — and the assertion
  // above is what catches it: if the update had gone second and still
  // written the pointer, the recipe would be sitting on a deleted revision
  // now. So a success is checked against the state afterwards, and a
  // refusal has to be the right refusal.
  if (update.status === 'rejected') {
    expect(String(update.reason)).toMatch(/deleted/i);
  }

  // Version 2 keeps its number and its address stays a 404, the way every
  // other deleted revision does.
  await expect(
    mcp.call('get_recipe', { slug, revisionNumber: 2 }),
  ).rejects.toThrow(/list_deleted|deleted/i);

  // THE OTHER ORDER, ISSUED THE OTHER WAY ROUND. The pair above reaches the
  // recipe row update-first every time it has been run, so on its own it
  // never exercises the branch that matters most: an `update_recipe` that
  // arrives AFTER the delete has to be refused rather than write the
  // pointer. A second recipe, and the delete goes first.
  const other = await makeRecipe(mcp, `crud-race4-${id}`);
  for (const n of [2, 3, 4]) {
    await mcp.call('revise_recipe', {
      slug: other,
      rationale: `Version ${n}.`,
    });
  }
  const reversed = await Promise.allSettled([
    mcp.call<DeleteResult>('delete_record', {
      kind: 'revision',
      slug: other,
      revisionNumber: 2,
      reason: 'Deleted on purpose by e2e/mcp-crud.spec.ts.',
    }),
    mcp.call<WriteResult>('update_recipe', {
      slug: other,
      currentRevisionNumber: 2,
    }),
  ]);
  expect(reversed[0].status, String(reversed[0])).toBe('fulfilled');
  if (reversed[1].status === 'rejected') {
    expect(String(reversed[1].reason)).toMatch(/deleted/i);
  }
  const afterReversed = await mcp.call<RecipeResult>('get_recipe', {
    slug: other,
  });
  expect(afterReversed.revisionNumber).not.toBe(2);
  expect([1, 3, 4]).toContain(afterReversed.revisionNumber);
});

test('a revision that changes only its steps does not restore a deleted ingredient', async () => {
  const mcp = rw();
  const id = stamp();
  const slug = `crud-carry-${id}`;
  const spice = `CRUD carry spice ${id}`;
  await mcp.call('create_recipe', {
    title: `CRUD carry ${id}`,
    slug,
    rationale: 'Written by e2e/mcp-crud.spec.ts.',
    ingredients: [{ name: spice, quantity: 10, unit: 'g' }],
    steps: [{ instruction: 'Add the spice.' }],
  });

  const spiceSlug = `crud-carry-spice-${id}`;
  await mcp.call('delete_record', {
    kind: 'ingredient',
    slug: spiceSlug,
    reason: 'Deleted on purpose by this test.',
  });
  await expect(
    mcp.call('get_ingredient', { slug: spiceSlug }),
  ).rejects.toThrow();

  // THE CALLER NAMES NO INGREDIENT HERE. `copyIngredientLines` reads the
  // canonical name off the base table, so the carried line came back holding
  // the deleted ingredient's own name and `resolveIngredient` restored it on
  // the slug hit — the write layer naming its own row at itself. The restore
  // rule is about a key the CALLER wrote.
  await mcp.call('revise_recipe', {
    slug,
    rationale: 'The steps were wrong; the list was not.',
    steps: [{ instruction: 'Add the spice at the end, not the start.' }],
  });
  await expect(
    mcp.call('get_ingredient', { slug: spiceSlug }),
  ).rejects.toThrow();

  // The same through the correction tool, which carries the list the same
  // way.
  await mcp.call('update_revision', {
    slug,
    revisionNumber: 2,
    steps: [{ instruction: 'Add the spice at the very end.' }],
  });
  await expect(
    mcp.call('get_ingredient', { slug: spiceSlug }),
  ).rejects.toThrow();

  // And the line is still cookable: it draws its own text.
  const read = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(read.ingredients[0]!.ingredient).toBeNull();
  expect(read.ingredients[0]!.rawText).toContain(spice);

  // Restoring the ingredient re-attaches every line that named it.
  await mcp.call('restore_record', { kind: 'ingredient', slug: spiceSlug });
  const after = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(after.ingredients[0]!.ingredient?.slug).toBe(spiceSlug);
});

test('no write result names a deleted tag or a deleted ingredient', async () => {
  const mcp = rw();
  const id = stamp();
  const slug = `crud-needs-${id}`;
  const tag = `CRUD ghostcure ${id}`;
  const spice = `CRUD ghostspice ${id}`;
  await mcp.call('create_recipe', {
    title: `CRUD needs ${id}`,
    slug,
    rationale: 'Written by e2e/mcp-crud.spec.ts.',
    ingredients: [{ name: spice, quantity: 10, unit: 'g' }],
    steps: [{ instruction: 'Cure it.' }],
    categories: { technique: [tag] },
  });

  await mcp.call('delete_record', {
    kind: 'tag',
    slug: `crud-ghostcure-${id}`,
    categoryType: 'technique',
  });
  await mcp.call('delete_record', {
    kind: 'ingredient',
    slug: `crud-ghostspice-${id}`,
  });

  // `needsDescription` is the ONE place a write result could carry a deleted
  // record out: `read.ts` reaches every table through a view and the census
  // checks it, but a write result is outside both. And the leak did not stop
  // at reporting — `followUpMessage` then tells the model to call
  // upsert_category and upsert_ingredient on what it named, and both of
  // those restore by design.
  const corrected = await mcp.call<{ message: string }>('update_recipe', {
    slug,
    summary: 'A summary that names neither of them.',
  });
  expect(corrected.message).not.toContain(`crud-ghostcure-${id}`);
  expect(corrected.message).not.toContain(`crud-ghostspice-${id}`);

  // Still deleted, which is what the instruction would have undone.
  await expect(
    mcp.call('get_ingredient', { slug: `crud-ghostspice-${id}` }),
  ).rejects.toThrow();
});

test('an edge to a deleted tag survives a correction and comes back with the tag', async () => {
  const mcp = rw();
  const id = stamp();
  const slug = await makeRecipe(mcp, `crud-edge-${id}`, {
    categories: { technique: [`CRUD keepme ${id}`, `CRUD doomed ${id}`] },
  });
  const doomed = `crud-doomed-${id}`;

  await mcp.call('delete_record', {
    kind: 'tag',
    slug: doomed,
    categoryType: 'technique',
    reason: 'Deleted on purpose by this test.',
  });

  // What get_recipe shows is what the tool's own description tells the model
  // to send back: "Call get_recipe first. Then send back each tag that you
  // want to keep." The deleted tag is not in that list and cannot be.
  const shown = await mcp.call<RecipeResult>('get_recipe', { slug });
  const keep = shown.terms
    .filter((t) => t.categoryType === 'technique')
    .map((t) => t.label);
  expect(keep).toHaveLength(1);

  // `applyTaxonomy` used to clear every edge and rewrite from that list, so
  // this call destroyed the edge to the deleted tag permanently — with no
  // correct call available to prevent it, and `recipe_terms` carries no
  // delete stamp to restore from.
  await mcp.call('update_recipe', {
    slug,
    categories: { technique: keep },
  });

  await mcp.call('restore_record', {
    kind: 'tag',
    slug: doomed,
    categoryType: 'technique',
  });
  const after = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(
    after.terms
      .filter((t) => t.categoryType === 'technique')
      .map((t) => t.slug),
  ).toContain(doomed);
});

test('re-logging a run that names the withdrawn version it already holds is accepted', async () => {
  const mcp = rw();
  const id = stamp();
  const slug = await makeRecipe(mcp, `crud-relog-${id}`);
  await mcp.call('revise_recipe', { slug, rationale: 'Version two.' });
  const run = `crud-relog-run-${id}`;
  await mcp.call('log_experiment', {
    slug: run,
    title: `CRUD relog run ${id}`,
    recipeSlug: slug,
    revisionNumber: 2,
    startedAt: '2024-10-18',
  });

  await mcp.call('delete_record', {
    kind: 'revision',
    slug,
    revisionNumber: 2,
    reason: 'Withdrawn after the run.',
  });

  // Pinning a NEW run to a withdrawn version is a caller naming a row it
  // cannot see, and stays refused. Naming the pin the run ALREADY holds is
  // neither: it moves nothing, and the state it asks for is the state on
  // disk. Refusing it aborted `pnpm ingest --force` at exit 1 after a
  // partial load, because every seeded run re-logs with the number it was
  // stored with.
  await mcp.call('log_experiment', {
    slug: run,
    title: `CRUD relog run ${id}`,
    recipeSlug: slug,
    revisionNumber: 2,
    startedAt: '2024-10-18',
  });
  const read = await mcp.call<ExperimentResult>('get_experiment', {
    slug: run,
  });
  expect(read.revisionNumber).toBe(2);
  expect(read.revisionWithdrawn).toBe(true);

  // A DIFFERENT deleted version is still refused.
  await mcp.call('revise_recipe', { slug, rationale: 'Version three.' });
  await mcp.call('delete_record', {
    kind: 'revision',
    slug,
    revisionNumber: 3,
  });
  const said = await refusal(
    mcp.call('log_experiment', {
      slug: run,
      title: `CRUD relog run ${id}`,
      recipeSlug: slug,
      revisionNumber: 3,
      startedAt: '2024-10-18',
    }),
    'a re-log moving the run onto a different deleted version',
  );
  expect(said).toContain('restore_record');
});

test('correcting occurredAt does not label a version that was recorded in sequence', async ({
  page,
}) => {
  const mcp = rw();
  const id = stamp();
  const slug = await makeRecipe(mcp, `crud-occurred-${id}`);
  await mcp.call('revise_recipe', { slug, rationale: 'Version two.' });

  // `backfilled` used to read `occurred_at IS NOT NULL`, which was the same
  // statement only while `backfill_revision` was the column's one writer —
  // that tool refuses a date that is not older than everything stored.
  // `update_revision` writes it too and its `occurredAt` is unconstrained,
  // so a correction could put TODAY on a version and make the page assert
  // "Recorded later — written down <today>" about a version recorded today.
  // The badge claims a relation, so the relation is what is asked for.
  await mcp.call('update_revision', {
    slug,
    revisionNumber: 2,
    occurredAt: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  });

  // Read off the whole document rather than the timeline element: the
  // Revisions band sits in a column the stylesheet hides below the `recipe:`
  // breakpoint, so the badge is in the DOM and not visible at this viewport.
  // The claim under test is what the page SAYS.
  await page.goto(`/recipes/${slug}`);
  await expect(page.locator('body')).not.toContainText('Recorded later');

  // A date that really is earlier than the day the row was written keeps the
  // badge, because then the sentence is true.
  await mcp.call('update_revision', {
    slug,
    revisionNumber: 2,
    occurredAt: '2019-03-01',
  });
  await page.goto(`/recipes/${slug}`);
  await expect(page.locator('body')).toContainText('Recorded later');
});
