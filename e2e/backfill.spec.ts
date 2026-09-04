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

    const labels = await page.locator('.timeline .rev-label').allTextContents();
    // Newest first by when each version existed: 2 and 1 were written now,
    // 3 describes 2019, so 3 sorts to the bottom despite its number.
    expect(labels).toEqual(['Revision 2', 'Revision 1', 'Revision 3']);

    // And it says why its number and its date disagree.
    await expect(page.locator('.timeline .rev-when')).toContainText(
      '2019-11-02',
    );
  });
});
