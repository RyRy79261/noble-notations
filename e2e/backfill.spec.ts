import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * Writing down history that was never written down.
 *
 * The append-only rule stops a recipe being silently rewritten. Recording a
 * version that came *before* everything stored does not do that: it changes
 * nothing a reader sees. These tests pin the two things that keep the
 * distinction real — the current revision does not move, and a backfill
 * that is not actually earlier is refused.
 */

const SLUG = 'backfill-subject-braise';

interface WriteResult {
  slug: string;
  revisionNumber: number;
}
interface RecipeResult {
  slug: string;
  revisionNumber: number;
  title: string;
  /** A line carries the text as written plus the ingredient it resolved to. */
  ingredients: {
    rawText: string;
    ingredient: { slug: string; name: string } | null;
  }[];
  revisions: { revisionNumber: number; rationale: string | null }[];
}

/** Every name a line answers to, so an assertion cannot pass vacuously. */
function names(recipe: RecipeResult): string[] {
  return recipe.ingredients.flatMap((line) =>
    [line.rawText, line.ingredient?.name].filter(
      (value): value is string => typeof value === 'string',
    ),
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('backfilling earlier revisions', () => {
  test('the tool is advertised', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
    expect(await mcp.listTools()).toContain('backfill_revision');
  });

  test('sets up a recipe with two forward revisions', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);

    await mcp.call<WriteResult>('create_recipe', {
      title: 'Subject braise',
      slug: SLUG,
      kind: 'recipe',
      rationale: 'The version I actually wrote down at the time.',
      ingredients: [
        { name: 'Beef shin', quantity: 1, unit: 'kg' },
        { name: 'Red wine', quantity: 500, unit: 'ml' },
      ],
      steps: [{ instruction: 'Brown the shin.', uses: ['Beef shin'] }],
    });

    const revised = await mcp.call<WriteResult>('revise_recipe', {
      slug: SLUG,
      rationale: 'Less wine; it was drowning the beef.',
      ingredients: [
        { name: 'Beef shin', quantity: 1, unit: 'kg' },
        { name: 'Red wine', quantity: 300, unit: 'ml' },
      ],
    });
    expect(revised.revisionNumber).toBe(2);
  });

  test('records an older version without moving what is current', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);

    const before = await mcp.call<RecipeResult>('get_recipe', { slug: SLUG });
    expect(before.revisionNumber).toBe(2);

    const filled = await mcp.call<WriteResult>('backfill_revision', {
      slug: SLUG,
      occurredAt: '2019-11-02',
      rationale:
        'The original notebook version, found in a photo of the page. ' +
        'Used stout, not wine.',
      ingredients: [
        { name: 'Beef shin', quantity: 1, unit: 'kg' },
        { name: 'Stout', quantity: 500, unit: 'ml' },
      ],
      steps: [{ instruction: 'Brown the shin in dripping.' }],
    });

    // It takes the next number — numbers say when a thing was recorded.
    expect(filled.revisionNumber).toBe(3);

    const after = await mcp.call<RecipeResult>('get_recipe', { slug: SLUG });

    // …and the recipe a reader sees is untouched.
    expect(after.revisionNumber).toBe(2);
    expect(names(after).join(' ')).not.toMatch(/stout/i);
    expect(names(after).join(' ')).toMatch(/red wine/i);
    expect(after.revisions).toHaveLength(3);
  });

  test('the backfilled version keeps its own ingredients', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
    const historical = await mcp.call<RecipeResult>('get_recipe', {
      slug: SLUG,
      revisionNumber: 3,
    });

    // Nothing carries forward into a backfill. Copying revision 2's wine
    // into the 2019 version would be inventing history.
    const written = names(historical).join(' ');
    expect(written).toMatch(/stout/i);
    expect(written).not.toMatch(/red wine/i);
  });

  test('a version that is not earlier is refused', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);

    await expect(
      mcp.call('backfill_revision', {
        slug: SLUG,
        occurredAt: '2035-01-01',
        rationale: 'Should not be accepted.',
        ingredients: [{ name: 'Beef shin', quantity: 1, unit: 'kg' }],
      }),
    ).rejects.toThrow(/not before it|revise_recipe/i);
  });

  test('a version dated exactly at the earliest one is refused too', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);

    /*
     * THE BOUNDARY ITSELF, which is the one case the guard exists for.
     *
     * `backfillRevision` compares with `occurredAt >= earliest`, and the
     * test above only reaches the far side of it — a 2035 date is refused by
     * any comparison anybody could write here. Relaxed to `>`, a backfill
     * dated at exactly the earliest stored version is accepted, and the
     * history then holds two versions claiming the same moment with no order
     * between them but a revision number that says the later-written one is
     * older. `get_recipe` orders by `COALESCE(occurred_at, created_at)`, so
     * which of the two a reader is shown as the oldest is left to the
     * planner.
     *
     * The date is revision 3's own `occurredAt`, so this is the exact
     * equality and not a value near it.
     */
    await expect(
      mcp.call('backfill_revision', {
        slug: SLUG,
        occurredAt: '2019-11-02',
        rationale: 'The same day as the version that is already stored.',
        ingredients: [{ name: 'Beef shin', quantity: 1, unit: 'kg' }],
      }),
    ).rejects.toThrow(/not before it|revise_recipe/i);

    // And nothing was written. A refusal that still appended a revision
    // would be the worse half of the same fault.
    const after = await mcp.call<RecipeResult>('get_recipe', { slug: SLUG });
    expect(after.revisions).toHaveLength(3);
  });

  test('a backfill without ingredients is refused', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);

    await expect(
      mcp.call('backfill_revision', {
        slug: SLUG,
        occurredAt: '2018-01-01',
        rationale: 'No ingredients given.',
      }),
    ).rejects.toThrow(/ingredients/i);
  });

  test('the history reads oldest last, with the backfill in its place', async ({
    page,
  }) => {
    await page.goto(`/recipes/${SLUG}`);

    // The timeline is F/Revision now: a spelled ordinal in Newsreader over
    // the date, with `data-revision` carrying the number the old `.rev-label`
    // text used to.
    await page.getByRole('tab', { name: 'Revisions' }).click();
    const order = await page
      .locator('[data-timeline] [data-revision]')
      .evaluateAll((els) =>
        els.map((el) => (el as HTMLElement).dataset.revision),
      );
    // Newest first by when each version existed: 2 and 1 were written now,
    // 3 describes 2019, so 3 sorts to the bottom despite its number.
    expect(order).toEqual(['2', '1', '3']);

    const backfilled = page.locator('[data-timeline] [data-revision="3"]');
    await expect(backfilled).toContainText('Third revision');
    // And it says why its number and its date disagree: the date is when the
    // version EXISTED, and the note says when it was written down.
    await expect(backfilled).toContainText('02 NOV 2019');
    await expect(backfilled).toContainText(/recorded later/i);
  });

  /**
   * The half of the rule the tests above do not reach.
   *
   * "Nothing carries forward into a backfill: inheriting a later version's
   * ingredients would invent a history that never happened, so an old
   * version states its own." The ingredients half is covered above, and it
   * is covered by a backfill that SENT ingredients — which every backfill
   * must, because a backfill without them is refused. So the rule is only
   * actually observable on the fields a backfill may leave out: the steps,
   * the summary, the yield, the servings and the times.
   *
   * `reviseRecipe` carries every one of those forward, deliberately and
   * correctly, from the version it supersedes. `backfillRevision` must not,
   * and it is the same five lines of code in the same shape one function
   * away. A recipe of its own, so the timeline this file already asserts
   * above does not move.
   */
  test('nothing carries forward into a backfill', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
    const slug = 'backfill-carry-subject';

    await mcp.call<WriteResult>('create_recipe', {
      title: 'Carry subject stew',
      slug,
      kind: 'recipe',
      rationale: 'The version that is current, with everything filled in.',
      summary: 'A stew that has been through several kitchens.',
      yieldQuantity: 3,
      yieldUnit: 'kg',
      servings: 6,
      totalTimeMinutes: 240,
      activeTimeMinutes: 40,
      ingredients: [{ name: 'Carry subject shin', quantity: 1.5, unit: 'kg' }],
      steps: [
        { instruction: 'Brown the shin.' },
        { instruction: 'Braise it for three hours.' },
      ],
    });

    // A backfill that states its ingredients and nothing else. Everything
    // omitted describes the CURRENT version, not the 2016 one.
    await mcp.call<WriteResult>('backfill_revision', {
      slug,
      occurredAt: '2016-04-08',
      rationale: 'Found in a notebook. One pot, no browning, no timings.',
      ingredients: [{ name: 'Carry subject shin', quantity: 1, unit: 'kg' }],
    });

    const historical = await mcp.call<
      RecipeResult & {
        revision: {
          summary: string | null;
          yieldQuantity: number | null;
          yieldUnit: string | null;
          servings: number | null;
          totalTimeMinutes: number | null;
          activeTimeMinutes: number | null;
        };
        steps: { instruction: string }[];
      }
    >('get_recipe', { slug, revisionNumber: 2 });

    // The 2016 version never had these steps: they belong to the version
    // written years later. Copying them in would put words in a cook's
    // notebook that the cook never wrote.
    expect(historical.steps).toEqual([]);
    expect(historical.revision.summary).toBeNull();
    expect(historical.revision.yieldQuantity).toBeNull();
    expect(historical.revision.yieldUnit).toBeNull();
    expect(historical.revision.servings).toBeNull();
    expect(historical.revision.totalTimeMinutes).toBeNull();
    expect(historical.revision.activeTimeMinutes).toBeNull();
    expect(names(historical).join(' ')).toMatch(/carry subject shin/i);

    // And the version a reader sees is untouched, fields and all.
    const current = await mcp.call<
      RecipeResult & {
        revision: { servings: number | null };
        steps: { instruction: string }[];
      }
    >('get_recipe', { slug });
    expect(current.revisionNumber).toBe(1);
    expect(current.revision.servings).toBe(6);
    expect(current.steps).toHaveLength(2);
  });
});
