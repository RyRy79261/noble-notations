import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * Where a note lands, and what happens when it lands nowhere.
 *
 * `add_note` resolves four different targets — a recipe, one revision of a
 * recipe, an ingredient, an experiment — each with its own lookup and its
 * own refusal. Every `add_note` call in the suite used `recipeSlug`, so
 * three of the four attach paths and three of the four refusals had never
 * run. That matters more than it looks: a note is the only thing in this
 * repository that carries judgement rather than instructions, and a note
 * attached to nothing is written, acknowledged, and then invisible. The
 * caller is told `{"noteId": …}` either way.
 *
 * The refusal messages are asserted on the slug the caller sent, and that
 * is deliberate rather than lazy. These messages are read by an agent that
 * has to decide what to do next, and the fact it needs is WHICH argument
 * was wrong — a note with three optional targets fails identically to a
 * human eye. The wording around the slug can change freely.
 *
 * The order of the `notes` array is load-bearing and is asserted here too.
 * `writeNotes` stores it as `notes.position`, `/science` numbers a study's
 * mechanisms M1…Mn by it, and `pnpm export` depends on it to write
 * byte-identical files.
 */

const RECIPE_SLUG = 'data-notes-subject';
const INGREDIENT_SLUG = 'data-notes-kombu';
const RUN_SLUG = 'data-notes-run';

interface NoteResult {
  noteId: string;
}

interface NoteView {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  createdAt?: string;
  movedFrom?: string[];
  sources: {
    url: string | null;
    title: string | null;
    citation: string | null;
    accessedAt: string | null;
  }[];
}

interface RecipeResult {
  slug: string;
  revisionNumber: number;
  notes: NoteView[];
}

interface IngredientResult {
  ingredient: { slug: string };
  notes: NoteView[];
}

interface ExperimentResult {
  slug: string;
  notes: NoteView[];
}

function rw() {
  return mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
}

/** The message off a refused call, without the throw. */
async function refusal(call: Promise<unknown>): Promise<string> {
  try {
    await call;
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('The call was accepted. It had to be refused.');
}

test.describe.configure({ mode: 'serial' });

test.describe('where a note attaches', () => {
  test('sets up a recipe, an ingredient and a run to attach to', async () => {
    const mcp = rw();

    // The ingredient first, so the recipe line below resolves onto it by
    // name rather than auto-creating a second row under its own slug.
    await mcp.call('upsert_ingredient', {
      slug: INGREDIENT_SLUG,
      name: 'Notes kombu',
      category: 'other',
    });

    await mcp.call('create_recipe', {
      title: 'Note target subject',
      slug: RECIPE_SLUG,
      kind: 'recipe',
      rationale: 'Something for the notes to hang from.',
      ingredients: [{ name: 'Notes kombu', quantity: 10, unit: 'g' }],
      steps: [{ instruction: 'Steep the kombu at 60 °C.' }],
      // Written in one call, so all three share a timestamp and only
      // `notes.position` can order them. This is the property `/science`
      // numbers its mechanisms with and the exporter writes files from.
      notes: [
        { kind: 'science', title: 'First', body: 'The first mechanism.' },
        { kind: 'science', title: 'Second', body: 'The second mechanism.' },
        { kind: 'science', title: 'Third', body: 'The third mechanism.' },
      ],
    });

    await mcp.call('log_experiment', {
      slug: RUN_SLUG,
      title: 'Note target run',
      recipeSlug: RECIPE_SLUG,
      startedAt: '2026-03-01',
      items: [{ label: 'A1' }],
      observations: [{ item: 'A1', metric: 'initial_weight', value: 10 }],
    });

    // The recipe line bound to the ingredient that already existed rather
    // than minting a second row under its own slug. Every later assertion
    // reads notes off `data-notes-kombu`, so a split here would make three
    // of them pass against an ingredient nothing uses.
    const recipe = await mcp.call<{
      ingredients: { ingredient: { slug: string } | null }[];
    }>('get_recipe', { slug: RECIPE_SLUG });
    expect(recipe.ingredients[0]!.ingredient?.slug).toBe(INGREDIENT_SLUG);
  });

  test('the order a list of notes was written in is the order it reads back', async () => {
    const recipe = await rw().call<RecipeResult>('get_recipe', {
      slug: RECIPE_SLUG,
    });

    expect(recipe.notes.map((note) => note.title)).toEqual([
      'First',
      'Second',
      'Third',
    ]);
  });

  test('a note reaches an ingredient, and is readable on it', async () => {
    const mcp = rw();

    const written = await mcp.call<NoteResult>('add_note', {
      ingredientSlug: INGREDIENT_SLUG,
      kind: 'warning',
      title: 'Do not boil it',
      body: 'Above 60 °C kombu gives up alginates and the stock turns slimy.',
    });

    const ingredient = await mcp.call<IngredientResult>('get_ingredient', {
      slug: INGREDIENT_SLUG,
    });

    // The note is on the ingredient itself, which is what `/ingredients/…`
    // draws. Attaching it to nothing would have returned the same noteId.
    expect(ingredient.notes.map((note) => note.id)).toContain(written.noteId);
    expect(ingredient.notes.map((note) => note.title)).toContain(
      'Do not boil it',
    );

    // And it did not leak onto the recipe that uses the ingredient. A note
    // about kombu is not a note about every dish kombu appears in.
    const recipe = await mcp.call<RecipeResult>('get_recipe', {
      slug: RECIPE_SLUG,
    });
    expect(recipe.notes.map((note) => note.id)).not.toContain(written.noteId);
  });

  test('a note reaches an experiment, and is readable on it', async () => {
    const mcp = rw();

    const written = await mcp.call<NoteResult>('add_note', {
      experimentSlug: RUN_SLUG,
      kind: 'result',
      title: 'The 60 °C steep was clearer',
      body: 'Against batch one, which was brought to a simmer.',
    });

    const run = await mcp.call<ExperimentResult>('get_experiment', {
      slug: RUN_SLUG,
    });
    expect(run.notes.map((note) => note.id)).toContain(written.noteId);

    // The run names a recipe, and the note still belongs to the run. A note
    // that climbed to the recipe would put one batch's result on every
    // version of the dish.
    const recipe = await mcp.call<RecipeResult>('get_recipe', {
      slug: RECIPE_SLUG,
    });
    expect(recipe.notes.map((note) => note.id)).not.toContain(written.noteId);
  });

  test('a research note keeps its sources, in the order they were given', async () => {
    const mcp = rw();

    const written = await mcp.call<NoteResult>('add_note', {
      recipeSlug: RECIPE_SLUG,
      kind: 'research',
      title: 'Where to buy kombu in Berlin',
      body: 'Two shops carry rausu; one carries ma-kombu.',
      sources: [
        { title: 'Go Asia, Kantstrasse', accessedAt: '2026-03-02' },
        { url: 'https://example.org/kombu-grades' },
        { citation: 'Shimizu, Dashi, 2019, p. 42.' },
      ],
    });

    const recipe = await mcp.call<RecipeResult>('get_recipe', {
      slug: RECIPE_SLUG,
    });
    const note = recipe.notes.find((row) => row.id === written.noteId)!;

    // Three sources, in the order written. A citation list that reshuffles
    // makes two exports of one seed differ, which is the thing
    // `content/generated/` exists to make impossible.
    expect(note.sources).toHaveLength(3);
    expect(note.sources[0]!.title).toBe('Go Asia, Kantstrasse');
    expect(note.sources[0]!.accessedAt).toBe('2026-03-02');
    expect(note.sources[1]!.url).toBe('https://example.org/kombu-grades');
    expect(note.sources[2]!.citation).toBe('Shimizu, Dashi, 2019, p. 42.');
  });

  test('a target that does not exist is refused, and the refusal names it', async () => {
    const mcp = rw();

    // One case per lookup, because each has its own query and its own
    // message. The assertion is on the slug, which is the fact an agent
    // needs to work out which of its three optional arguments was wrong.
    expect(
      await refusal(
        mcp.call('add_note', {
          recipeSlug: 'data-notes-no-such-recipe',
          kind: 'idea',
          body: 'Should not land.',
        }),
      ),
    ).toContain('data-notes-no-such-recipe');

    expect(
      await refusal(
        mcp.call('add_note', {
          ingredientSlug: 'data-notes-no-such-ingredient',
          kind: 'idea',
          body: 'Should not land.',
        }),
      ),
    ).toContain('data-notes-no-such-ingredient');

    expect(
      await refusal(
        mcp.call('add_note', {
          experimentSlug: 'data-notes-no-such-run',
          kind: 'idea',
          body: 'Should not land.',
        }),
      ),
    ).toContain('data-notes-no-such-run');

    // The fourth lookup: the recipe is there and the version is not. The
    // message has to name the version, because naming the recipe would send
    // the caller to check something that is correct.
    expect(
      await refusal(
        mcp.call('add_note', {
          recipeSlug: RECIPE_SLUG,
          revisionNumber: 99,
          kind: 'idea',
          body: 'Should not land.',
        }),
      ),
    ).toMatch(/99/);
  });

  test('a note with no target, or with two, is refused before anything is read', async () => {
    const mcp = rw();

    const none = await refusal(
      mcp.call('add_note', { kind: 'idea', body: 'Nowhere to put this.' }),
    );
    // The rule JSON Schema cannot state, so the message is the only place a
    // caller learns it. It has to name all three fields.
    expect(none).toContain('recipeSlug');
    expect(none).toContain('ingredientSlug');
    expect(none).toContain('experimentSlug');

    const two = await refusal(
      mcp.call('add_note', {
        recipeSlug: RECIPE_SLUG,
        ingredientSlug: INGREDIENT_SLUG,
        kind: 'idea',
        body: 'Two targets is not one.',
      }),
    );
    expect(two).toMatch(/exactly one/i);

    // A version number with no recipe names nothing. It used to be dropped
    // without a word, so the note landed on the recipe instead of on the
    // version the caller meant.
    const orphanRevision = await refusal(
      mcp.call('add_note', {
        ingredientSlug: INGREDIENT_SLUG,
        revisionNumber: 1,
        kind: 'idea',
        body: 'A version of an ingredient is not a thing.',
      }),
    );
    expect(orphanRevision).toContain('revisionNumber');
    expect(orphanRevision).toContain('recipeSlug');
  });

  test('a refused note leaves the record it named exactly as it was', async () => {
    const mcp = rw();

    const before = await mcp.call<IngredientResult>('get_ingredient', {
      slug: INGREDIENT_SLUG,
    });

    await refusal(
      mcp.call('add_note', {
        ingredientSlug: INGREDIENT_SLUG,
        kind: 'research',
        title: 'A research note with nothing to cite',
        body: 'Refused, because research without a source is an observation.',
      }),
    );

    const after = await mcp.call<IngredientResult>('get_ingredient', {
      slug: INGREDIENT_SLUG,
    });
    expect(after.notes.map((note) => note.id)).toEqual(
      before.notes.map((note) => note.id),
    );
  });
});

/**
 * Finding a note without knowing where it is.
 *
 * This file's own fixtures are the proof that the problem was real: notes
 * sit on `data-notes-subject`, on `data-notes-kombu` and on
 * `data-notes-run`, and before `search_notes` the only way to see all three
 * was to already know all three parents. The tests below assert the two
 * things the query gets wrong if it is written the obvious way — resolving
 * a recipe note through `recipes.current_revision_id`, which silently drops
 * every superseded revision, and returning whole bodies.
 */
test.describe('finding a note across every record', () => {
  /* A word that cannot occur anywhere else in the seeded database, so the
     result set is exactly what this test wrote. */
  const WORD = 'zarquith';

  interface NoteHit {
    id: string;
    kind: string;
    title: string | null;
    excerpt: string;
    truncated: boolean;
    bodyLength: number;
    sourceCount: number;
    attachedTo: {
      type: string;
      slug: string | null;
      title: string | null;
      revisionNumber: number | null;
    };
  }
  interface NoteSearch {
    results: NoteHit[];
    total: number;
  }

  test('a note on each kind of parent is reachable from one call', async () => {
    const mcp = rw();

    await mcp.call('add_note', {
      recipeSlug: RECIPE_SLUG,
      kind: 'observation',
      title: 'On the recipe',
      body: `A ${WORD} seen on the recipe itself.`,
    });
    await mcp.call('add_note', {
      ingredientSlug: INGREDIENT_SLUG,
      kind: 'warning',
      title: 'On the ingredient',
      body: `A ${WORD} seen on the ingredient.`,
    });
    await mcp.call('add_note', {
      experimentSlug: RUN_SLUG,
      kind: 'result',
      title: 'On the run',
      body: `A ${WORD} seen on the run.`,
    });

    const found = await mcp.call<NoteSearch>('search_notes', {
      query: WORD,
      limit: 50,
    });
    expect(found.total).toBe(3);

    const byType = new Map(
      found.results.map((hit) => [hit.attachedTo.type, hit.attachedTo.slug]),
    );
    expect(byType.get('recipe')).toBe(RECIPE_SLUG);
    expect(byType.get('ingredient')).toBe(INGREDIENT_SLUG);
    expect(byType.get('experiment')).toBe(RUN_SLUG);

    // And `kind` narrows it to one, which is the "show me every warning"
    // question that had no answer at all before.
    const warnings = await mcp.call<NoteSearch>('search_notes', {
      query: WORD,
      kind: 'warning',
      limit: 50,
    });
    expect(warnings.total).toBe(1);
    expect(warnings.results[0]!.attachedTo.slug).toBe(INGREDIENT_SLUG);
  });

  test('a recipe filter finds notes on superseded revisions too', async () => {
    // THE ASSERTION THAT MATTERS. `reviseRecipe` attaches its notes to the
    // REVISION, and `noteBelongsToRecipe` — the existing helper, which
    // `/science` uses correctly — resolves a revision note only through
    // `recipes.current_revision_id`. Reusing it here would return the new
    // revision's note and silently hide the old one, which is exactly the
    // note an agent asking "what have we already learned" wants.
    const mcp = rw();

    await mcp.call('add_note', {
      recipeSlug: RECIPE_SLUG,
      revisionNumber: 1,
      kind: 'observation',
      title: 'Pinned to revision one',
      body: `A ${WORD} recorded against the first version.`,
    });

    await mcp.call('revise_recipe', {
      slug: RECIPE_SLUG,
      rationale: 'A second version, so the first one is superseded.',
      ingredients: [{ name: 'Notes kombu', quantity: 12, unit: 'g' }],
      steps: [{ instruction: 'Steep the kombu at 65 °C.' }],
      notes: [
        {
          kind: 'observation',
          title: 'Pinned to revision two',
          body: `A ${WORD} recorded against the second version.`,
        },
      ],
    });

    const found = await mcp.call<NoteSearch>('search_notes', {
      query: WORD,
      recipeSlug: RECIPE_SLUG,
      limit: 50,
    });

    const revisions = found.results
      .filter((hit) => hit.attachedTo.type === 'revision')
      .map((hit) => hit.attachedTo.revisionNumber)
      .sort();
    expect(revisions).toEqual([1, 2]);

    // The note on the recipe itself is in the same answer, and the run's
    // note is NOT — a batch is its own record.
    expect(found.results.some((hit) => hit.attachedTo.type === 'recipe')).toBe(
      true,
    );
    expect(
      found.results.some((hit) => hit.attachedTo.type === 'experiment'),
    ).toBe(false);
  });

  test('a long body comes back as an excerpt that says it was cut', async () => {
    const mcp = rw();
    const long = `${WORD} `.repeat(120).trim();

    await mcp.call('add_note', {
      ingredientSlug: INGREDIENT_SLUG,
      kind: 'observation',
      title: 'A long one',
      body: long,
    });

    /* No `kind` filter: the short note this compares against is a
       `warning`, and narrowing to observations would drop it. */
    const found = await mcp.call<NoteSearch>('search_notes', {
      query: WORD,
      ingredientSlug: INGREDIENT_SLUG,
      limit: 50,
    });
    const hit = found.results.find((note) => note.title === 'A long one');
    expect(hit).toBeTruthy();
    expect(hit!.truncated).toBe(true);
    expect(hit!.bodyLength).toBe(long.length);
    expect(hit!.excerpt.length).toBeLessThan(hit!.bodyLength);
    expect(long.startsWith(hit!.excerpt)).toBe(true);

    // A short one is not cut, and says so.
    const short = found.results.find(
      (note) => note.title === 'On the ingredient',
    );
    expect(short!.truncated).toBe(false);
    expect(short!.bodyLength).toBe(short!.excerpt.length);
  });

  test('paging does not repeat or skip a note', async () => {
    const mcp = rw();
    const all = await mcp.call<NoteSearch>('search_notes', {
      query: WORD,
      limit: 50,
    });
    expect(all.total).toBeGreaterThan(2);

    const first = await mcp.call<NoteSearch>('search_notes', {
      query: WORD,
      limit: 2,
      offset: 0,
    });
    const second = await mcp.call<NoteSearch>('search_notes', {
      query: WORD,
      limit: 2,
      offset: 2,
    });

    // `total` is the whole answer on every page, not the page size.
    expect(first.total).toBe(all.total);
    expect(second.total).toBe(all.total);
    expect(first.results).toHaveLength(2);

    // Not repeated…
    const paged = [...first.results, ...second.results].map((hit) => hit.id);
    expect(new Set(paged).size).toBe(paged.length);

    // …and not SKIPPED, which distinctness alone cannot show: two pages
    // that both dropped the same row would still hold no duplicate. The
    // first four of the unpaged answer are the ones the two pages must
    // between them contain, in that order.
    expect(paged).toEqual(all.results.slice(0, paged.length).map((h) => h.id));
  });

  test('two target filters are refused, and none means everywhere', async () => {
    const mcp = rw();

    expect(
      await refusal(
        mcp.call('search_notes', {
          recipeSlug: RECIPE_SLUG,
          ingredientSlug: INGREDIENT_SLUG,
        }),
      ),
    ).toMatch(/at most one/i);

    // And the bare call enumerates rather than refusing, which is what
    // makes a separate listing tool unnecessary.
    const everything = await mcp.call<NoteSearch>('search_notes', {
      limit: 1,
    });
    expect(everything.total).toBeGreaterThan(3);
    expect(everything.results).toHaveLength(1);
  });
});

/**
 * Moving a note, and what a move must not touch.
 *
 * Issue #23. A note was bound to one record at write time, for good, so a
 * note written before its natural parent existed was stranded there. The
 * repair available was to write it again on the right record, which
 * duplicates the text and lets the two copies drift.
 *
 * The tests below assert the two halves that make this a move and not an
 * edit: nothing a reader reads changes, and the store remembers where the
 * note used to be. The refusals matter as much — a note on a VERSION is a
 * statement about that version, and moving it would make a stored version
 * say something it never said.
 */
test.describe('moving a note to another record', () => {
  interface Moved {
    noteId: string;
    from: string;
    to: string;
    previousSubjects: string[];
  }
  interface MovableNote extends NoteView {
    movedFrom: string[];
  }

  test('a note moves off a run onto a recipe, and says so', async () => {
    const mcp = rw();

    // The reported shape exactly: a note that belongs to a dish, written
    // against a batch because the dish had no record yet.
    const { noteId } = await mcp.call<NoteResult>('add_note', {
      experimentSlug: RUN_SLUG,
      kind: 'warning',
      title: 'Bitter stock is a roasting fault',
      body: 'Garlic roasted as long as the bones turns the whole pot bitter.',
      sources: [],
    });

    const run = await mcp.call<ExperimentResult>('get_experiment', {
      slug: RUN_SLUG,
    });
    const before = (run.notes as MovableNote[]).find((n) => n.id === noteId);
    expect(before, 'the note did not land on the run').toBeTruthy();
    expect(before!.movedFrom).toEqual([]);

    const moved = await mcp.call<Moved>('reattach_note', {
      noteId,
      recipeSlug: RECIPE_SLUG,
    });
    expect(moved.from).toBe(`experiment:${RUN_SLUG}`);
    expect(moved.to).toBe(`recipe:${RECIPE_SLUG}`);
    expect(moved.previousSubjects).toEqual([`experiment:${RUN_SLUG}`]);

    // It is on the recipe now, with its text untouched and its old home
    // recorded — the assertion that makes this a move and not a rewrite.
    const recipe = await mcp.call<RecipeResult>('get_recipe', {
      slug: RECIPE_SLUG,
    });
    const after = (recipe.notes as MovableNote[]).find((n) => n.id === noteId);
    expect(after, 'the note is not on the recipe').toBeTruthy();
    expect(after!.kind).toBe(before!.kind);
    expect(after!.title).toBe(before!.title);
    expect(after!.body).toBe(before!.body);
    expect(after!.movedFrom).toEqual([`experiment:${RUN_SLUG}`]);

    // And it is gone from the run. A note hangs off exactly one record.
    const runAfter = await mcp.call<ExperimentResult>('get_experiment', {
      slug: RUN_SLUG,
    });
    expect(runAfter.notes.some((n) => n.id === noteId)).toBe(false);
  });

  test('a second move appends rather than replacing the first', async () => {
    const mcp = rw();
    const { noteId } = await mcp.call<NoteResult>('add_note', {
      ingredientSlug: INGREDIENT_SLUG,
      kind: 'observation',
      body: 'Something that will be moved twice.',
    });

    await mcp.call('reattach_note', { noteId, experimentSlug: RUN_SLUG });
    const second = await mcp.call<Moved>('reattach_note', {
      noteId,
      recipeSlug: RECIPE_SLUG,
    });

    // Oldest first, both homes kept. One place would be a worse answer
    // than none, because it would read as the whole history.
    expect(second.previousSubjects).toEqual([
      `ingredient:${INGREDIENT_SLUG}`,
      `experiment:${RUN_SLUG}`,
    ]);
  });

  test('a note on a version is refused, and stays where it is', async () => {
    const mcp = rw();
    const { noteId } = await mcp.call<NoteResult>('add_note', {
      recipeSlug: RECIPE_SLUG,
      revisionNumber: 1,
      kind: 'observation',
      body: 'Pinned to the first version, and therefore about it.',
    });

    const message = await refusal(
      mcp.call('reattach_note', { noteId, ingredientSlug: INGREDIENT_SLUG }),
    );
    // The refusal names the version and says what to do instead, because a
    // caller has to decide its next move from this sentence alone.
    expect(message).toMatch(/version 1/i);
    expect(message).toMatch(new RegExp(RECIPE_SLUG));
    expect(message).toMatch(/write the note again/i);

    // And nothing moved.
    const ingredient = await mcp.call<IngredientResult>('get_ingredient', {
      slug: INGREDIENT_SLUG,
    });
    expect(ingredient.notes.some((n) => n.id === noteId)).toBe(false);
  });

  test('a destination that is not there is refused by name', async () => {
    const mcp = rw();
    const { noteId } = await mcp.call<NoteResult>('add_note', {
      ingredientSlug: INGREDIENT_SLUG,
      kind: 'observation',
      body: 'A note whose move will be refused.',
    });

    // Named, for the same reason add_note names it: a call with three
    // optional targets fails identically to a human eye otherwise.
    expect(
      await refusal(
        mcp.call('reattach_note', { noteId, recipeSlug: 'no-such-recipe' }),
      ),
    ).toMatch(/no-such-recipe/);

    expect(
      await refusal(
        mcp.call('reattach_note', {
          noteId,
          experimentSlug: 'no-such-run-at-all',
        }),
      ),
    ).toMatch(/no-such-run-at-all/);
  });

  test('moving a note nowhere, or to two places, is refused', async () => {
    const mcp = rw();
    const { noteId } = await mcp.call<NoteResult>('add_note', {
      ingredientSlug: INGREDIENT_SLUG,
      kind: 'observation',
      body: 'A note for the target-count refusals.',
    });

    expect(await refusal(mcp.call('reattach_note', { noteId }))).toMatch(
      /exactly one/i,
    );
    expect(
      await refusal(
        mcp.call('reattach_note', {
          noteId,
          recipeSlug: RECIPE_SLUG,
          ingredientSlug: INGREDIENT_SLUG,
        }),
      ),
    ).toMatch(/exactly one/i);

    // And a move to where it already is says so rather than pretending.
    expect(
      await refusal(
        mcp.call('reattach_note', {
          noteId,
          ingredientSlug: INGREDIENT_SLUG,
        }),
      ),
    ).toMatch(/already on/i);
  });

  test('a note id that does not exist is refused', async () => {
    expect(
      await refusal(
        rw().call('reattach_note', {
          noteId: '00000000-0000-0000-0000-000000000000',
          recipeSlug: RECIPE_SLUG,
        }),
      ),
    ).toMatch(/no note with id/i);
  });

  test('a note older than its destination still lands last', async () => {
    const mcp = rw();

    // THE ORDER OF THESE TWO WRITES IS THE WHOLE TEST. The note is written
    // FIRST, against the run, and the destination's own note is written
    // after it — which is the real case this tool exists for: a note goes
    // on a batch because the record it belongs to does not exist yet, so
    // that record's notes are necessarily newer.
    //
    // Sorting on `created_at`, as the five note reads did before D-13, this
    // note lands FIRST at its destination. `sort_at` is what makes it land
    // last, and without it a moved `science` note becomes M1 on a recipe
    // and renumbers every mechanism /science has already published below
    // it. Written the other way round — destination note first — this test
    // passes whether or not the move reassigns anything, which is what the
    // version it replaced did.
    const { noteId } = await mcp.call<NoteResult>('add_note', {
      experimentSlug: RUN_SLUG,
      kind: 'observation',
      title: 'Written first, moved later',
      body: 'Older than everything it will end up sitting beside.',
    });

    await mcp.call('add_note', {
      ingredientSlug: INGREDIENT_SLUG,
      kind: 'observation',
      title: 'Already at the destination',
      body: 'Written after the note that will be moved here.',
    });

    await mcp.call('reattach_note', {
      noteId,
      ingredientSlug: INGREDIENT_SLUG,
    });

    const ingredient = await mcp.call<IngredientResult>('get_ingredient', {
      slug: INGREDIENT_SLUG,
    });
    const ids = ingredient.notes.map((n) => n.id);
    expect(ids).toContain(noteId);
    expect(ids[ids.length - 1]).toBe(noteId);

    // And the date the note was WRITTEN is untouched. Only where it sorts
    // changed, which is the distinction D-13 turns on.
    const moved = ingredient.notes.find((n) => n.id === noteId)!;
    const neighbour = ingredient.notes.find(
      (n) => n.title === 'Already at the destination',
    )!;
    expect(
      new Date(moved.createdAt!).getTime(),
      'the moved note must still be the older of the two',
    ).toBeLessThan(new Date(neighbour.createdAt!).getTime());
  });
});
