import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * The doors beside the doors that were closed.
 *
 * Issues #13 and #14 were fixed by two rules at the submission boundary: a
 * tag may not be named after an empty value, and a one-line name may not
 * arrive with a JSON escape in it where a character belongs. Both rules were
 * right and both were applied to the fields the reports happened to name.
 * This file is the rest of each rule's own class.
 *
 * THE THREE DOORS INTO `taxonomy_terms`, and the third was open.
 * `resolveTermId` in `src/lib/queries/write.ts` creates a tag from whatever
 * text reaches it, and three fields reach it: `upsert_category`'s label, a
 * recipe's `categories`, and a step's `technique`. The first two refused a
 * reserved name; `steps[].technique` was a bare string, so
 * `create_recipe {steps: [{technique: "null"}]}` still made a
 * `technique/null` term — which is the exact precondition issue #14 is
 * about. The fix stated an invariant ("a reserved name can no longer be
 * created, so a tag holding one is by definition a legacy accident") that
 * this field made false.
 *
 * THE NAMES AND HEADINGS THE ESCAPE RULE DID NOT COVER. `create_recipe`'s
 * ingredient line mints a canonical ingredient and a permanent slug, and the
 * line itself lands in an immutable revision; `component` and `phase` are
 * headings a reader meets inside that same revision; an alias becomes a
 * lookup key nobody can type. Each of those was accepting the identical
 * string that `upsert_ingredient {name}` was refusing, and landing it
 * somewhere with no update path — which is the case the refusal's own
 * message cites.
 *
 * AND ONE RULE THAT WAS TOO WIDE. `search_recipes` is a READ, and it shared
 * the write's category schema, so it refused a query naming a reserved tag —
 * with a message telling the caller to pick a better name for a tag they
 * were not naming. That blocked the connector half of the clean-up the fix
 * documents: `list_categories` shows the junk tag, and `search_recipes` is
 * the only tool that answers which recipes carry it.
 */

/** Six characters where an em dash belongs, and an escaped quotation mark. */
const ENCODED = 'Chef\\u2019s \\"special\\" salt';

function rw() {
  return mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
}

/**
 * Create a recipe if it is not there already.
 *
 * A `beforeAll` fixture is a STATE, not an event. Playwright restarts the
 * worker after a test fails, and a restarted worker runs `beforeAll` again —
 * so a bare `create_recipe` turns the first real failure in a file into a
 * second, louder failure in the setup, and the message a reader then sees is
 * "a recipe with that slug already exists" instead of the fault.
 */
async function ensureRecipe(
  mcp: ReturnType<typeof mcpClient>,
  args: Record<string, unknown>,
): Promise<void> {
  try {
    await mcp.call('create_recipe', args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) throw error;
  }
}

interface CategoryRow {
  categoryType: string;
  slug: string;
  label: string;
}

interface SearchResult {
  results: { slug: string }[];
  total: number;
}

/** The message of a refused call. Fails the test if the call is accepted. */
async function refusal(call: Promise<unknown>): Promise<string> {
  try {
    await call;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('The call was accepted. It had to be refused.');
}

const BOUNDARY_SLUG = 'boundary-subject';

test.beforeAll(async () => {
  const mcp = rw();
  await ensureRecipe(mcp, {
    title: 'Boundary subject',
    slug: BOUNDARY_SLUG,
    kind: 'recipe',
    rationale: 'A recipe to aim refused calls at.',
    ingredients: [{ name: 'Boundary subject salt', quantity: 1, unit: 'tsp' }],
    steps: [{ instruction: 'Do it.' }],
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 1. The third door into the tag table
// ─────────────────────────────────────────────────────────────────────────

test('a step cannot name a technique after an empty value', async () => {
  const mcp = rw();

  const techniquesNow = async () =>
    (
      await mcp.call<CategoryRow[]>('list_categories', {
        categoryType: 'technique',
      })
    ).map((row) => row.slug);

  for (const [word, slug] of [
    ['null', 'boundary-technique-null'],
    ['undefined', 'boundary-technique-undefined'],
    ['None', 'boundary-technique-none'],
  ] as const) {
    // On the way in, through `create_recipe`…
    const created = await refusal(
      mcp.call('create_recipe', {
        title: `Boundary ${word} technique`,
        slug,
        kind: 'recipe',
        rationale: 'A step whose technique is the name of nothing.',
        ingredients: [{ name: 'Boundary subject salt' }],
        steps: [{ instruction: 'Boil it.', technique: word }],
      }),
    );
    expect(created).toMatch(/is not a name a tag can have/);
    expect(created).toMatch(/technique/);
    expect(created).not.toMatch(/internal error/i);

    // …and the whole write was refused, not the field alone.
    await expect(mcp.call('get_recipe', { slug })).rejects.toThrow(
      /No recipe/i,
    );

    // …and through `revise_recipe`, which takes the same step schema and is
    // the door a second call would have used.
    expect(
      await refusal(
        mcp.call('revise_recipe', {
          slug: BOUNDARY_SLUG,
          rationale: 'A revision whose step names nothing.',
          ingredients: [{ name: 'Boundary subject salt' }],
          steps: [{ instruction: 'Boil it again.', technique: word }],
        }),
      ),
    ).toMatch(/is not a name a tag can have/);
  }

  // Nothing was created. This is the assertion the whole test is for: the
  // refusal above could be perfect and a term still be written, because
  // `resolveTermId` creates on a miss and the schema is the only guard.
  const slugs = await techniquesNow();
  for (const junk of ['null', 'undefined', 'none']) {
    expect(slugs, `technique/${junk} must not exist`).not.toContain(junk);
  }

  // The control, and it is what says the rule refuses a NAME rather than the
  // field: an ordinary technique on the same field still works, and still
  // creates its tag.
  await ensureRecipe(mcp, {
    title: 'Boundary real technique',
    slug: 'boundary-technique-real',
    kind: 'recipe',
    rationale: 'The same field, with a technique a cook would name.',
    // The tag on the recipe AND the technique on the step. They are two
    // different links — a step's technique names a tag, and `categories` is
    // what carries the recipe into `recipe_terms` and therefore into a
    // search — so a control for both has to write both.
    categories: { technique: ['Boundary dry toasting'] },
    ingredients: [{ name: 'Boundary subject salt' }],
    steps: [{ instruction: 'Boil it.', technique: 'Boundary dry toasting' }],
  });
  expect(await techniquesNow()).toContain('boundary-dry-toasting');
});

test('a step technique cannot arrive double-encoded either', async () => {
  const mcp = rw();

  // The same field, the other rule. A technique mints a term with that
  // label, so a damaged one is a permanent slug and a permanent heading.
  expect(
    await refusal(
      mcp.call('create_recipe', {
        title: 'Boundary encoded technique',
        slug: 'boundary-technique-encoded',
        kind: 'recipe',
        rationale: 'A technique whose name was encoded two times.',
        ingredients: [{ name: 'Boundary subject salt' }],
        steps: [{ instruction: 'Do it.', technique: ENCODED }],
      }),
    ),
  ).toMatch(/backslash escape/);
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The names and headings beside the five that were guarded
// ─────────────────────────────────────────────────────────────────────────

test('every field that names a thing refuses text that was encoded twice', async () => {
  const mcp = rw();

  const body = (overrides: Record<string, unknown>) => ({
    title: 'Boundary encoded subject',
    slug: 'boundary-encoded-subject',
    kind: 'recipe',
    rationale: 'A write that must not land.',
    ingredients: [{ name: 'Boundary subject salt' }],
    steps: [{ instruction: 'Do it.' }],
    ...overrides,
  });

  /*
   * Each row is a field that a reader meets as a name or a heading, or that
   * the store uses as identity. `ingredients[].name` is the one that made
   * the partial rule indefensible: `upsert_ingredient {name}` refused this
   * exact string while `create_recipe` took it, minted a canonical
   * ingredient from it and wrote the line into a revision no tool can edit.
   */
  const cases: {
    what: string;
    args: Record<string, unknown>;
    field: RegExp;
  }[] = [
    {
      what: 'an ingredient line name',
      args: body({ ingredients: [{ name: ENCODED }] }),
      field: /name/,
    },
    {
      what: 'an ingredient line component heading',
      args: body({
        ingredients: [{ name: 'Boundary subject salt', component: ENCODED }],
      }),
      field: /component/,
    },
    {
      what: 'a step phase heading',
      args: body({ steps: [{ instruction: 'Do it.', phase: ENCODED }] }),
      field: /phase/,
    },
    {
      what: 'a tag on a recipe',
      args: body({ categories: { cuisine: [ENCODED] } }),
      field: /label/,
    },
  ];

  for (const row of cases) {
    const message = await refusal(mcp.call('create_recipe', row.args));
    expect(message, row.what).toMatch(/backslash escape/);
    expect(message, row.what).toMatch(row.field);
    expect(message, row.what).not.toMatch(/internal error/i);
  }

  // Nothing landed, on any of the four attempts.
  await expect(
    mcp.call('get_recipe', { slug: 'boundary-encoded-subject' }),
  ).rejects.toThrow(/No recipe/i);

  // An alias and a plural are identity too: `findIngredientId` matches on an
  // alias, so a damaged one is a lookup key nobody can type.
  for (const [what, args] of [
    ['aliases', { name: 'Boundary alias subject', aliases: [ENCODED] }],
    ['plural', { name: 'Boundary plural subject', plural: ENCODED }],
  ] as const) {
    expect(await refusal(mcp.call('upsert_ingredient', args)), what).toMatch(
      /backslash escape/,
    );
  }

  // And an observation's item label, which is the heading on a run's table.
  expect(
    await refusal(
      mcp.call('log_experiment', {
        slug: 'boundary-encoded-run',
        title: 'Boundary encoded run',
        items: [{ label: ENCODED }],
      }),
    ),
  ).toMatch(/backslash escape/);
});

test('prose keeps its backslashes, because prose is where code is written', async () => {
  const mcp = rw();

  /*
   * THE CONTROL FOR THE WHOLE RULE, and it is the half that says the rule
   * has not started guessing. A body, a summary and a description are
   * Markdown; Markdown holds code; and a fenced block that explains what
   * `—` is, or a regular expression that contains `\"`, is text
   * somebody meant to write. Refusing these would make the repository unable
   * to describe its own boundary.
   */
  await mcp.call('add_note', {
    recipeSlug: BOUNDARY_SLUG,
    kind: 'research',
    title: 'How a double encoding shows itself',
    body:
      'A client that encodes twice sends `\\u2014` where an em dash belongs, ' +
      'and `\\"` where a quotation mark belongs.',
    sources: [{ title: 'RFC 8259, section 7' }],
  });

  const recipe = await mcp.call<{ notes: { body: string }[] }>('get_recipe', {
    slug: BOUNDARY_SLUG,
  });
  expect(recipe.notes.map((note) => note.body).join('\n')).toContain(
    '`\\u2014`',
  );
});

// ─────────────────────────────────────────────────────────────────────────
// 3. A read tool answers the question instead of refusing it
// ─────────────────────────────────────────────────────────────────────────

test('search_recipes will look for a tag whose name is a reserved word', async () => {
  const mcp = rw();

  /*
   * The clean-up path, end to end. A junk tag exists in the store today —
   * that is the premise of the #14 fix, and its runbook starts by asking
   * which recipes carry one. `list_categories` shows the tag. `search_recipes`
   * is the only tool that answers "which recipes", and it was refusing the
   * question with advice written for somebody naming a tag: "give the tag
   * the name of the thing it groups… send a `slug` of your own beside it",
   * on a tool with no `slug` field.
   *
   * A read tool answers with nothing found. It does not refuse the question.
   */
  for (const word of ['null', 'undefined', 'None', 'true']) {
    const found = await mcp.call<SearchResult>('search_recipes', {
      categories: { technique: [word] },
    });
    expect(found.results, word).toHaveLength(0);
    expect(found.total, word).toBe(0);
  }

  // And the filter still works on a tag that is really there, so this is a
  // search that answers rather than a search that has stopped filtering.
  const real = await mcp.call<SearchResult>('search_recipes', {
    categories: { technique: ['boundary-dry-toasting'] },
  });
  expect(real.results.map((r) => r.slug)).toContain('boundary-technique-real');
});

test('naming a tag is still refused on the write it belongs to', async () => {
  const mcp = rw();

  // The other side of the same line. Narrowing the rule to the write path
  // must not have loosened the write path, and these two are the doors the
  // original fix closed.
  expect(
    await refusal(
      mcp.call('upsert_category', {
        categoryType: 'diet',
        label: 'None',
      }),
    ),
  ).toMatch(/is not a name a tag can have/);

  expect(
    await refusal(
      mcp.call('create_recipe', {
        title: 'Boundary reserved tag',
        slug: 'boundary-reserved-tag',
        kind: 'recipe',
        rationale: 'A recipe that names a tag after an empty value.',
        categories: { diet: ['None'] },
        ingredients: [{ name: 'Boundary subject salt' }],
        steps: [{ instruction: 'Do it.' }],
      }),
    ),
  ).toMatch(/is not a name a tag can have/);

  // The escape hatch the rule promises: the reserved word as a LABEL, with a
  // slug of the caller's own. A reader sees "None"; the identity is not junk.
  const made = await mcp.call<{ slug: string; created: boolean }>(
    'upsert_category',
    {
      categoryType: 'diet',
      label: 'None',
      slug: 'boundary-no-diet',
      description:
        'A tag whose label is a reserved word and whose slug is not.',
    },
  );
  expect(made.slug).toBe('boundary-no-diet');
});
