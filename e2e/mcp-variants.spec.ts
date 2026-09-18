import { test, expect } from '@playwright/test';

import { mcpClient, tokens, type McpClient } from './helpers';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * VARIATIONS: a recipe beside a dish, not a version of it. D-17.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The expensive mistake this whole feature exists to stop is one call:
 * `revise_recipe` for "dan dan noodles but with shiitake". It succeeds, it
 * moves `current_revision_id`, and the pork version stops being what people
 * read — with no refusal anywhere, because the call is valid. Nothing here
 * can test a mistake that the tools cannot detect, so what is tested instead
 * is the property that makes `create_variant` a different act: **the parent
 * is untouched.** Same pointer, same revision count, same page.
 *
 * The rest is the shape of the relationship:
 *
 * - **One parent, no cycles.** A column gives the first for free. The second
 *   is `assertNoVariantCycle` and it is the one guard with a lock behind it,
 *   so both the direct case and the case through another recipe are asserted.
 * - **The family is the same from every member.** That is the whole reason
 *   `variantFamily` climbs before it descends, and a test that only read it
 *   from the base dish would pass against a walk that goes one way.
 * - **A delete breaks the chain and a restore rejoins it exactly.** The
 *   column is never cleared by either, so this is a statement about what
 *   `recipes_live` does, not about bookkeeping.
 * - **`variantOf` has three states on `update_recipe`**, and the one that is
 *   easy to get wrong is `undefined` — absent must mean "leave it alone",
 *   because this tool is the one whose other list fields replace wholesale.
 * - **The retired link kind says where to go.** An agent that learnt
 *   `{ kind: 'variant_of' }` gets a message naming the field, not zod's list
 *   of four.
 */

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`;

function rw(): McpClient {
  return mcpClient(BASE, tokens().readWrite);
}

let counter = 0;
function stamp(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

interface FamilyMember {
  slug: string;
  title: string;
  variantNote: string | null;
  depth: number;
  revisionCount: number;
  self: boolean;
}

interface RecipeResult {
  slug: string;
  title: string;
  revisionNumber: number;
  variantOf: { slug: string; title: string; note: string | null } | null;
  variantFamily: FamilyMember[];
  revisions: { revisionNumber: number }[];
}

/** A dish with one line and one step, created as a base recipe. */
async function dish(mcp: McpClient, slug: string): Promise<string> {
  await mcp.call('create_recipe', {
    title: `VAR ${slug}`,
    slug,
    rationale: 'Written by e2e/mcp-variants.spec.ts.',
    ingredients: [{ name: `VAR pork ${slug}`, quantity: 200, unit: 'g' }],
    steps: [{ instruction: 'Fry the pork for 4 min.' }],
  });
  return slug;
}

/** A variation of `parent`, through the tool that is the point of all this. */
async function variation(
  mcp: McpClient,
  slug: string,
  parent: string,
  note: string,
): Promise<string> {
  await mcp.call('create_variant', {
    title: `VAR ${slug}`,
    slug,
    variantOf: parent,
    variantNote: note,
    ingredients: [{ name: `VAR shiitake ${slug}`, quantity: 200, unit: 'g' }],
    steps: [{ instruction: 'Fry the shiitake for 6 min.' }],
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

const family = (recipe: RecipeResult) =>
  recipe.variantFamily.map((m) => `${'>'.repeat(m.depth)}${m.slug}`);

// ─────────────────────────────────────────────────────────────────────────
// The act itself
// ─────────────────────────────────────────────────────────────────────────

test('create_variant is advertised, and it asks for the dish it varies', async () => {
  const mcp = rw();
  const tools = await mcp.listToolSchemas();
  const tool = tools.find((t) => t.name === 'create_variant');

  expect(tool, 'create_variant is registered').toBeTruthy();
  if (!tool) return;

  // Required rather than optional is the whole difference from
  // `create_recipe`, and it is what the advertised signature has to say.
  expect(tool.inputSchema?.required ?? []).toContain('variantOf');

  // The description carries the fork. An agent reads this and nothing else
  // before it picks between three tools, so the two words that separate them
  // have to be in it.
  const text = `${tool.description ?? ''}`;
  expect(text).toContain('revise_recipe');
  expect(text).toContain('not a revision');
});

test('a variation is a recipe of its own, and the dish it came from does not move', async () => {
  const mcp = rw();
  const id = stamp();
  const base = await dish(mcp, `var-base-${id}`);

  // Two versions on the parent, so "the pointer did not move" is a claim
  // about a real pointer and not about a recipe with one version.
  await mcp.call('revise_recipe', {
    slug: base,
    rationale: 'More chilli oil.',
    ingredients: [{ name: `VAR pork ${base}`, quantity: 250, unit: 'g' }],
  });
  const before = await mcp.call<RecipeResult>('get_recipe', { slug: base });
  expect(before.revisionNumber).toBe(2);

  const child = await variation(
    mcp,
    `var-shiitake-${id}`,
    base,
    'With shiitake instead of pork.',
  );

  // THE PROPERTY THAT SEPARATES THIS TOOL FROM revise_recipe. Had this been
  // a revision, the parent would now be reading revision 3 — the shiitake
  // one — and the pork version would be off its own page.
  const after = await mcp.call<RecipeResult>('get_recipe', { slug: base });
  expect(after.revisionNumber).toBe(2);
  expect(after.revisions).toHaveLength(2);
  expect(after.variantOf, 'the parent varies nothing').toBeNull();

  // And the variation is a recipe: its own address, its own revision 1.
  const made = await mcp.call<RecipeResult>('get_recipe', { slug: child });
  expect(made.slug).toBe(child);
  expect(made.revisionNumber).toBe(1);
  expect(made.variantOf).toMatchObject({
    slug: base,
    note: 'With shiitake instead of pork.',
  });

  // Nothing is carried forward. The parent's line is not on the variation,
  // which is `backfill_revision`'s rule for `backfill_revision`'s reason.
  const lines = await mcp.call<{ ingredients: { rawText: string }[] }>(
    'get_recipe',
    { slug: child },
  );
  expect(lines.ingredients.map((l) => l.rawText).join(' ')).not.toContain(
    'pork',
  );
});

test('a variation has its own revisions, and revising one leaves its siblings alone', async () => {
  const mcp = rw();
  const id = stamp();
  const base = await dish(mcp, `var-rev-base-${id}`);
  const a = await variation(mcp, `var-rev-a-${id}`, base, 'With shiitake.');
  const b = await variation(mcp, `var-rev-b-${id}`, base, 'With lamb.');

  await mcp.call('revise_recipe', {
    slug: a,
    rationale: 'Six minutes was not enough.',
    steps: [{ instruction: 'Fry the shiitake for 8 min.' }],
  });

  expect(
    (await mcp.call<RecipeResult>('get_recipe', { slug: a })).revisionNumber,
  ).toBe(2);
  expect(
    (await mcp.call<RecipeResult>('get_recipe', { slug: b })).revisionNumber,
  ).toBe(1);
  expect(
    (await mcp.call<RecipeResult>('get_recipe', { slug: base })).revisionNumber,
  ).toBe(1);

  // The count the panel prints beside each member is per member.
  const shown = await mcp.call<RecipeResult>('get_recipe', { slug: base });
  const counts = Object.fromEntries(
    shown.variantFamily.map((m) => [m.slug, m.revisionCount]),
  );
  expect(counts).toMatchObject({ [base]: 1, [a]: 2, [b]: 1 });
});

// ─────────────────────────────────────────────────────────────────────────
// The family
// ─────────────────────────────────────────────────────────────────────────

test('every member of a family reads the same family', async () => {
  const mcp = rw();
  const id = stamp();
  const base = await dish(mcp, `var-fam-base-${id}`);
  const lamb = await variation(mcp, `var-fam-lamb-${id}`, base, 'With lamb.');
  const shiitake = await variation(
    mcp,
    `var-fam-shiitake-${id}`,
    base,
    'With shiitake.',
  );
  const vegan = await variation(
    mcp,
    `var-fam-vegan-${id}`,
    shiitake,
    'No egg noodles.',
  );

  // Base first, then each branch under the recipe it varies, siblings
  // alphabetical. `lamb` sorts before `shiitake` by title.
  const expected = [base, `>${lamb}`, `>${shiitake}`, `>>${vegan}`];

  for (const slug of [base, lamb, shiitake, vegan]) {
    const recipe = await mcp.call<RecipeResult>('get_recipe', { slug });
    expect(family(recipe), `the family as ${slug} sees it`).toEqual(expected);
    // Exactly one member is marked as the one being read.
    expect(
      recipe.variantFamily.filter((m) => m.self).map((m) => m.slug),
    ).toEqual([slug]);
  }
});

test('a recipe with no family gets an empty list, so no panel is drawn', async () => {
  const mcp = rw();
  const alone = await dish(mcp, `var-alone-${stamp()}`);
  const recipe = await mcp.call<RecipeResult>('get_recipe', { slug: alone });

  // Not `[alone]`. A tab with nothing behind it is a dead control, and
  // "one variation: this one" is nothing.
  expect(recipe.variantFamily).toEqual([]);
});

// ─────────────────────────────────────────────────────────────────────────
// The guards
// ─────────────────────────────────────────────────────────────────────────

test('a recipe cannot be a variation of itself, and cycles are refused at any length', async () => {
  const mcp = rw();
  const id = stamp();
  const base = await dish(mcp, `var-cyc-base-${id}`);
  const mid = await variation(mcp, `var-cyc-mid-${id}`, base, 'With lamb.');
  const leaf = await variation(mcp, `var-cyc-leaf-${id}`, mid, 'Vegan.');

  const itself = await refusal(
    mcp.call('update_recipe', { slug: base, variantOf: base }),
    'a recipe varying itself',
  );
  expect(itself).toContain('cannot be a variation of itself');

  // One step: the base under its own child.
  const direct = await refusal(
    mcp.call('update_recipe', { slug: base, variantOf: mid }),
    'a one-step cycle',
  );
  expect(direct).toContain('no base dish');

  // Two steps, through another recipe. This is the case only the recursive
  // walk catches — `variant_not_self` cannot see it and neither can a
  // constraint.
  const indirect = await refusal(
    mcp.call('update_recipe', { slug: base, variantOf: leaf }),
    'a cycle through another recipe',
  );
  expect(indirect).toContain('no base dish');

  // The family is untouched by three refusals.
  const after = await mcp.call<RecipeResult>('get_recipe', { slug: base });
  expect(family(after)).toEqual([base, `>${mid}`, `>>${leaf}`]);
});

test('a variation of a recipe that is not there, or is deleted, is refused by name', async () => {
  const mcp = rw();
  const id = stamp();
  const gone = await dish(mcp, `var-gone-${id}`);

  const missing = await refusal(
    mcp.call('create_variant', {
      title: `VAR nothing ${id}`,
      variantOf: `var-nothing-${id}`,
    }),
    'a variation of a recipe that does not exist',
  );
  expect(missing).toContain('No recipe with slug');

  await mcp.call('delete_record', {
    kind: 'recipe',
    slug: gone,
    reason: 'Written by e2e/mcp-variants.spec.ts.',
  });

  // A deleted parent is NOT reported as missing: the row is there, and
  // "no recipe with that slug" would send the caller hunting a spelling
  // mistake that does not exist. The refusal names the way out instead.
  const deleted = await refusal(
    mcp.call('create_variant', {
      title: `VAR of a deleted dish ${id}`,
      variantOf: gone,
    }),
    'a variation of a deleted recipe',
  );
  expect(deleted).toContain('restore_record');
});

test('variantNote without a dish to vary is refused, on both tools', async () => {
  const mcp = rw();
  const id = stamp();
  const base = await dish(mcp, `var-note-${id}`);

  // On `create_recipe` the schema catches it: there is no stored parent for
  // an absent `variantOf` to mean "leave alone".
  const created = await refusal(
    mcp.call('create_recipe', {
      title: `VAR noteless ${id}`,
      variantNote: 'With shiitake instead of pork.',
    }),
    'a create carrying a variation note and no parent',
  );
  expect(created).toContain('variantOf');

  // On `update_recipe` the schema has to let it through — a recipe that is
  // already a variation may correct its note alone — so the write layer
  // makes the call, holding the stored parent.
  const corrected = await refusal(
    mcp.call('update_recipe', {
      slug: base,
      variantNote: 'With shiitake instead of pork.',
    }),
    'a note about a difference on a dish that varies nothing',
  );
  expect(corrected).toContain('not a variation of anything');
});

test('a variation may correct its own note without naming its parent again', async () => {
  const mcp = rw();
  const id = stamp();
  const base = await dish(mcp, `var-renote-base-${id}`);
  const child = await variation(mcp, `var-renote-${id}`, base, 'With shitake.');

  await mcp.call('update_recipe', {
    slug: child,
    variantNote: 'With shiitake instead of pork.',
  });

  const after = await mcp.call<RecipeResult>('get_recipe', { slug: child });
  expect(after.variantOf).toMatchObject({
    slug: base,
    note: 'With shiitake instead of pork.',
  });
});

// ─────────────────────────────────────────────────────────────────────────
// The three states of `variantOf`, and the one that is easy to get wrong
// ─────────────────────────────────────────────────────────────────────────

test('an update that does not name variantOf leaves the family alone', async () => {
  const mcp = rw();
  const id = stamp();
  const base = await dish(mcp, `var-keep-base-${id}`);
  const child = await variation(mcp, `var-keep-${id}`, base, 'With lamb.');

  // The call that used to drop the parentage: a correction that replaces the
  // link list, sent by a caller echoing back what `get_recipe` showed it.
  await mcp.call('update_recipe', {
    slug: child,
    title: `VAR corrected ${id}`,
    categories: { technique: [`VAR frying ${id}`] },
    links: [],
  });

  const after = await mcp.call<RecipeResult>('get_recipe', { slug: child });
  expect(after.title).toBe(`VAR corrected ${id}`);
  expect(
    after.variantOf,
    'the parentage survived a links rewrite',
  ).toMatchObject({ slug: base, note: 'With lamb.' });
});

test('variantOf null makes a dish of its own, keeps its branch, and clears the note', async () => {
  const mcp = rw();
  const id = stamp();
  const base = await dish(mcp, `var-split-base-${id}`);
  const mid = await variation(mcp, `var-split-mid-${id}`, base, 'With lamb.');
  const leaf = await variation(mcp, `var-split-leaf-${id}`, mid, 'Vegan.');

  await mcp.call('update_recipe', { slug: mid, variantOf: null });

  const promoted = await mcp.call<RecipeResult>('get_recipe', { slug: mid });
  expect(promoted.variantOf).toBeNull();

  // A child keeps its own children: the branch below was a variation of THIS
  // dish and still is. It is the root of a family of its own now.
  expect(family(promoted)).toEqual([mid, `>${leaf}`]);

  // And the base is alone again, so its panel is not drawn at all.
  const parent = await mcp.call<RecipeResult>('get_recipe', { slug: base });
  expect(parent.variantFamily).toEqual([]);
});

// ─────────────────────────────────────────────────────────────────────────
// Delete and restore
// ─────────────────────────────────────────────────────────────────────────

test('deleting a member breaks the family at the gap, and a restore rejoins it exactly', async () => {
  const mcp = rw();
  const id = stamp();
  const base = await dish(mcp, `var-del-base-${id}`);
  const lamb = await variation(mcp, `var-del-lamb-${id}`, base, 'With lamb.');
  const mid = await variation(mcp, `var-del-mid-${id}`, base, 'With shiitake.');
  const leaf = await variation(mcp, `var-del-leaf-${id}`, mid, 'Vegan.');

  const whole = [base, `>${lamb}`, `>${mid}`, `>>${leaf}`];
  expect(
    family(await mcp.call<RecipeResult>('get_recipe', { slug: base })),
  ).toEqual(whole);

  await mcp.call('delete_record', {
    kind: 'recipe',
    slug: mid,
    reason: 'Written by e2e/mcp-variants.spec.ts.',
  });

  // The walk goes over live recipes only, so the deleted member is not a
  // node and is not a path. The branch below it is unreachable from the base.
  expect(
    family(await mcp.call<RecipeResult>('get_recipe', { slug: base })),
  ).toEqual([base, `>${lamb}`]);
  // And the branch below is a family of one, which is no family.
  expect(
    (await mcp.call<RecipeResult>('get_recipe', { slug: leaf })).variantFamily,
  ).toEqual([]);

  await mcp.call('restore_record', { kind: 'recipe', slug: mid });

  // Nothing was cleared, so nothing has to be put back: the same tree.
  expect(
    family(await mcp.call<RecipeResult>('get_recipe', { slug: base })),
  ).toEqual(whole);
});

// ─────────────────────────────────────────────────────────────────────────
// The retired link kind
// ─────────────────────────────────────────────────────────────────────────

test('a link of kind variant_of is refused, and the refusal names the field to use', async () => {
  const mcp = rw();
  const id = stamp();
  const base = await dish(mcp, `var-link-base-${id}`);
  const other = await dish(mcp, `var-link-other-${id}`);

  const message = await refusal(
    mcp.call('update_recipe', {
      slug: other,
      links: [{ kind: 'variant_of', slug: base }],
    }),
    'a link of the retired kind',
  );

  // Not zod's "expected one of derived_from | component_of | …". An agent
  // that learnt the old vocabulary is told where the sentence lives now.
  expect(message).toContain('variantOf');
  expect(message).toContain('create_variant');

  // The four that remain still work, and still replace wholesale.
  await mcp.call('update_recipe', {
    slug: other,
    links: [{ kind: 'derived_from', slug: base }],
  });
  const after = await mcp.call<{ links: { kind: string }[] }>('get_recipe', {
    slug: other,
  });
  expect(after.links.map((l) => l.kind)).toEqual(['derived_from']);
});

// ─────────────────────────────────────────────────────────────────────────
// The page
// ─────────────────────────────────────────────────────────────────────────

test('the recipe page says what a variation is, and offers the family as a tab', async ({
  page,
}) => {
  const mcp = rw();
  const id = stamp();
  const base = await dish(mcp, `var-page-base-${id}`);
  const child = await variation(
    mcp,
    `var-page-child-${id}`,
    base,
    'With shiitake instead of pork.',
  );

  await page.goto(`${BASE}/recipes/${child}`);

  // The hero says it once, with the link inside the sentence (D-10).
  const link = page.getByRole('link', { name: `VAR ${base}`, exact: true });
  await expect(link.first()).toHaveAttribute('href', `/recipes/${base}`);

  // The tab exists, and the panel behind it names both members.
  await page.getByRole('tab', { name: 'Variations' }).first().click();
  const panel = page.locator('[data-family]');
  await expect(panel).toContainText('You are here');
  await expect(panel.locator(`[data-variant="${base}"]`)).toBeVisible();
  await expect(panel.locator(`[data-variant="${child}"]`)).toBeVisible();

  // The dish it came from offers the same tab, which is the point of
  // climbing before descending.
  await page.goto(`${BASE}/recipes/${base}`);
  await expect(
    page.getByRole('tab', { name: 'Variations' }).first(),
  ).toBeVisible();

  // A dish with no family offers no tab. R-SCR-27.
  const alone = await dish(mcp, `var-page-alone-${id}`);
  await page.goto(`${BASE}/recipes/${alone}`);
  await expect(page.getByRole('tab', { name: 'Variations' })).toHaveCount(0);
});

test('a card marks a variation, so a family does not read as duplicates on the index', async ({
  page,
}) => {
  const mcp = rw();
  const id = stamp();
  const base = await dish(mcp, `var-card-base-${id}`);
  const child = await variation(mcp, `var-card-${id}`, base, 'With shiitake.');

  await page.goto(`${BASE}/search?q=${encodeURIComponent(`VAR ${child}`)}`);
  await expect(
    page.getByText(`Variation of VAR ${base}`, { exact: false }).first(),
  ).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────
// The Markdown an agent reads
// ─────────────────────────────────────────────────────────────────────────

test('the .md of a variation carries its parent and its family', async ({
  request,
}) => {
  const mcp = rw();
  const id = stamp();
  const base = await dish(mcp, `var-md-base-${id}`);
  const child = await variation(
    mcp,
    `var-md-${id}`,
    base,
    'With shiitake instead of pork.',
  );

  const response = await request.get(`${BASE}/recipes/${child}/md`);
  expect(response.status()).toBe(200);
  const body = await response.text();

  // The front matter carries the slug, which is what every write tool takes.
  expect(body).toContain(`variantOf: '${base}'`);

  // And the family is above the ingredients, because the question that costs
  // the most to get wrong is asked before the method is read.
  const variations = body.indexOf('## Variations');
  const ingredients = body.indexOf('## Ingredients');
  expect(variations).toBeGreaterThan(-1);
  expect(variations).toBeLessThan(ingredients);
  expect(body).toContain(`(\`${base}\`)`);
  expect(body).toContain('— this one');
});

// ─────────────────────────────────────────────────────────────────────────
// The guide
// ─────────────────────────────────────────────────────────────────────────

test('the guide teaches the three-way fork, so an agent does not reach for revise_recipe', async () => {
  const mcp = rw();
  const guide = await mcp.call<Record<string, unknown>>('get_started', {});
  const text = JSON.stringify(guide);

  expect(text).toContain('create_variant');
  // The fork itself, in the words the tool descriptions use.
  expect(text).toContain('went a different way');
  expect(text).toContain('variantFamily');
});
