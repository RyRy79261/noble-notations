import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { mcpClient, tokens } from './helpers';

/**
 * Identity: the slug a name turns into, and the bytes a title keeps.
 *
 * Two holes, and they share a cause. Neither `slugify` nor the store's
 * promise to keep text exactly as it arrived has anywhere cheap to be
 * asserted — there is no unit-test framework here, so every assertion costs
 * a production build, a Postgres and an HTTP round trip — so both were
 * carried by whatever a screen test happened to walk past.
 *
 * `slugify` is the public identity function. It writes URLs, it writes the
 * arguments an agent passes back to `get_ingredient`, and it writes exported
 * Markdown filenames; its own header says "keep the rules in one place so
 * all three agree", and nothing checked that they did. Deleting the
 * apostrophe rule moves `piment-despelette` to `piment-d-espelette` — a live
 * URL, a stored argument and a filename, all at once, silently.
 *
 * The second is the read half of the issue #13 decision. That issue was
 * closed by refusing double-encoded text at the WRITE boundary and by
 * deciding NOT to unescape on read — because unescaping guesses, and it
 * corrupts a title that legitimately holds a backslash. The write half is
 * asserted. The read half was not, and could not be: the only way to get a
 * `\u2014` into the store is now to put it there directly, which is what
 * this file does.
 */

const APOSTROPHE = "Piment d'Espelette test";
const CURLY = 'Chef\u2019s test salt';
const ACCENT = 'Crème fraîche test';
const PUNCTUATION = '  Salt & pepper — mixed!!  ';
const LONG = `${'Very long ingredient name that keeps going '.repeat(3)}end`;

interface IngredientResult {
  slug: string;
  name: string;
}

interface IngredientDetail {
  ingredient: { slug: string; name: string };
}

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

// ─────────────────────────────────────────────────────────────────────────
// 1. slugify, through the tool that mints a slug from a name
// ─────────────────────────────────────────────────────────────────────────

test('a name becomes the slug the whole repository agrees on', async () => {
  const mcp = rw();

  /*
   * Every rule in `slugify`, one row each, driven through the write path
   * that uses it rather than against the function — which is the only way
   * this suite can reach a pure module, and is also the honest test: the
   * value being pinned is the identity a URL and an MCP argument share.
   *
   * The apostrophe row is the one with a live consequence today. The seed
   * carries `Piment d'Espelette`, whose slug is `piment-despelette`;
   * dropping the rule makes it `piment-d-espelette` and moves the page, the
   * argument and the exported filename together.
   */
  const cases: { name: string; slug: string; why: string }[] = [
    {
      name: APOSTROPHE,
      slug: 'piment-despelette-test',
      why: 'an apostrophe is removed, not turned into a separator',
    },
    {
      name: CURLY,
      slug: 'chefs-test-salt',
      why: 'and a typographic apostrophe goes the same way',
    },
    {
      name: ACCENT,
      slug: 'creme-fraiche-test',
      why: 'accents are folded to their base letter, not dropped',
    },
    {
      name: PUNCTUATION,
      slug: 'salt-pepper-mixed',
      why: 'a run of punctuation is one separator, and the ends are trimmed',
    },
    {
      name: LONG,
      slug: 'very-long-ingredient-name-that-keeps-going-very-long-ingredient-name-that-keeps',
      why: 'eighty characters, and never a trailing hyphen after the cut',
    },
  ];

  for (const row of cases) {
    const result = await mcp.call<IngredientResult>('upsert_ingredient', {
      name: row.name,
      category: 'other',
    });
    expect(result.slug, row.why).toBe(row.slug);

    // And the slug is really the address: a slug the tool reports but the
    // reader cannot use is not an identity. The NAME comes back exactly as
    // it was sent, padding included — `slugify` decides the identity and
    // never edits the text, which is the separation this file is about.
    const read = await mcp.call<IngredientDetail>('get_ingredient', {
      slug: row.slug,
    });
    expect(read.ingredient.name).toBe(row.name);
  }
});

test('a slug is a live URL and an argument at the same time', async ({
  page,
}) => {
  // The third of the three the header names. `/ingredients/<slug>` is the
  // page, and the same string is what an agent sends back to
  // `get_ingredient`, so a change to the rules moves both or neither.
  const response = await page.goto('/ingredients/piment-despelette-test');
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { level: 1, name: APOSTROPHE }),
  ).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Nothing is unescaped on the way out
// ─────────────────────────────────────────────────────────────────────────

test.describe('a stored title comes back byte for byte', () => {
  const SLUG = 'identity-escape-subject';

  /*
   * THE TEXT IS PLANTED WITH SQL, and it has to be.
   *
   * The connector now refuses exactly these two patterns on the way in, so
   * no tool call can create the row this test needs — which is correct, and
   * which is also why the read half had no test. `mcp-contract.spec.ts`
   * already writes to a table directly with a `pg` client and a `finally`
   * clean-up for the same reason.
   *
   * What this pins is a DECISION, not a behaviour that exists by accident:
   * unescaping on read was considered and rejected. A title is not a note, so
   * a `correction` cannot answer a wrong one, and no tool edits a stored
   * title — but repairing it on the way out would silently rewrite a title
   * that legitimately contains a backslash, and a regular expression or a
   * Windows path in a title is a thing a person writes. The refusal at the
   * boundary asks; an unescape would guess.
   *
   * Both rows are here on purpose. The damaged one must not be mended and
   * the legitimate one must not be harmed, and only a test that holds both
   * can tell an unescape from a no-op.
   */
  const DAMAGED = 'The name means \\"to mince\\" \\u2014 not \\"luck\\"';
  const LEGITIMATE = 'The parser splits on /\\s+/ and keeps C:\\notes intact';

  test.beforeAll(async () => {
    const mcp = rw();
    await ensureRecipe(mcp, {
      title: 'Identity escape subject',
      slug: SLUG,
      kind: 'recipe',
      rationale: 'A recipe to hang two awkward note titles on.',
      ingredients: [{ name: 'Identity subject salt' }],
      steps: [{ instruction: 'Do it.' }],
    });

    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      for (const title of [DAMAGED, LEGITIMATE]) {
        await client.query(
          `INSERT INTO notes (recipe_id, kind, title, body)
           SELECT id, 'observation', $2, 'Planted for the read-side test.'
             FROM recipes WHERE slug = $1`,
          [SLUG, title],
        );
      }
    } finally {
      await client.end();
    }
  });

  test('get_recipe hands back what is stored, escapes and all', async () => {
    const mcp = rw();
    const recipe = await mcp.call<{ notes: { title: string | null }[] }>(
      'get_recipe',
      { slug: SLUG },
    );

    const titles = recipe.notes.map((note) => note.title);
    // Byte for byte. `toContain` on an array is an equality test per element,
    // so a title that had one escape turned back into a character fails here.
    expect(titles).toContain(DAMAGED);
    expect(titles).toContain(LEGITIMATE);

    // Said the other way round as well, because the failure this guards is
    // a REPAIR and not a loss: the mended forms must be absent.
    expect(titles).not.toContain('The name means "to mince" — not "luck"');
    expect(titles.join('\n')).toContain('\\u2014');
  });

  test('the screen draws the same characters', async ({ page }) => {
    // The reader's side of the same decision. A damaged title is damaged on
    // the page too — that is the cost the refusal at the write boundary was
    // chosen to stop happening again, and hiding it here would hide the only
    // evidence an owner has that a row needs attention.
    await page.goto(`/recipes/${SLUG}`);
    await expect(page.locator('main')).toContainText('\\u2014');
    await expect(page.locator('main')).toContainText('C:\\notes');
  });
});
