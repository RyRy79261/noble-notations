import { test, expect } from '@playwright/test';
import { mcpClient, tokens } from './helpers';

/**
 * The lifecycle this whole repository exists for: an MCP client works out a
 * recipe, writes it with its tags, and later *refines* it rather than
 * creating a second copy — and both states are visible on the website.
 */

const SLUG = 'dan-dan-noodles-tofu-sauce-base';

// Inline PNGs so the image assertions need no network and no fixture
// server. `data:` is permitted by the app's img-src CSP and passes the
// URL validator, so this exercises the same path a real hosted image takes.
const HERO_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAFElEQVR4nGPI9VpBEmIY1TAoNAAA+WjFcZFbUrAAAAAASUVORK5CYII=';
const STEP_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAE0lEQVR4nGOw0IohCTGMahgUGgAAzWrhGwLJ7wAAAABJRU5ErkJggg==';

interface CreateResult {
  slug: string;
  revisionNumber: number;
}
interface ReviseResult {
  slug: string;
  revisionNumber: number;
}
/** `get_recipe` returns the recipe flat, with its revisions alongside. */
interface RecipeResult {
  slug: string;
  title: string;
  revisionNumber: number;
  terms: {
    facet: string;
    slug: string;
    label: string;
    description: string | null;
  }[];
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  steps: {
    instruction: string;
    imageUrl: string | null;
    imageAlt: string | null;
  }[];
  revisions: { revisionNumber: number; rationale: string | null }[];
}
interface SearchResult {
  results: { slug: string; title: string }[];
}

test.describe('MCP write lifecycle', () => {
  test('exposes read and write tools over Streamable HTTP', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);
    const names = await mcp.listTools();

    expect(names).toContain('search_recipes');
    expect(names).toContain('create_recipe');
    expect(names).toContain('revise_recipe');
    expect(names).toContain('upsert_taxonomy_term');
  });

  test('a read-only token is refused a write tool', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readOnly);

    // Reading is fine.
    await expect(mcp.call('get_repository_stats', {})).resolves.toBeTruthy();

    // Writing is not — and it fails at the call, not merely at consent.
    await expect(
      mcp.call('create_recipe', { title: 'Should never exist' }),
    ).rejects.toThrow(/scope|permission|denied|write/i);
  });

  test('creates a recipe with cuisine, technique and equipment tags', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);

    const created = await mcp.call<CreateResult>('create_recipe', {
      title: 'Dan dan noodles with a tofu sauce base',
      slug: SLUG,
      subtitle: 'Blender-emulsified, no sesame paste',
      summary:
        'A dan dan sauce built on silken tofu instead of sesame paste, ' +
        'emulsified in a blender so it clings without splitting.',
      kind: 'recipe',
      status: 'active',
      rationale: 'First working version.',
      heroImageUrl: HERO_IMAGE,
      heroImageAlt: 'The finished bowl, sauce clinging to the noodles',
      taxonomy: {
        cuisine: ['Sichuan'],
        course: ['main'],
        technique: ['blending', 'toasting'],
        equipment: ['blender'],
        texture: ['silky'],
      },
      ingredients: [
        { name: 'Silken tofu', quantity: 300, unit: 'g' },
        { name: 'Chinese sesame paste', quantity: 20, unit: 'g' },
        { name: 'Sichuan peppercorn', quantity: 4, unit: 'g' },
      ],
      steps: [
        {
          instruction: 'Toast the Sichuan peppercorn until fragrant.',
          uses: ['Sichuan peppercorn'],
        },
        {
          instruction: 'Blend the silken tofu with the toasted spice.',
          uses: ['Silken tofu'],
          imageUrl: STEP_IMAGE,
          imageAlt: 'The sauce mid-blend, just before it emulsifies',
        },
      ],
    });

    expect(created.slug).toBe(SLUG);
    expect(created.revisionNumber).toBe(1);

    const fetched = await mcp.call<RecipeResult>('get_recipe', { slug: SLUG });
    const facets = fetched.terms.map((t) => t.facet);
    expect(facets).toContain('cuisine');
    expect(facets).toContain('equipment');

    const equipment = fetched.terms.find((t) => t.facet === 'equipment');
    expect(equipment?.slug).toBe('blender');
  });

  test('describes the tags it introduced', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);

    await mcp.call('upsert_taxonomy_term', {
      facet: 'equipment',
      label: 'Blender',
      description:
        'A high-speed jug blender. Shears hard enough to emulsify fat into ' +
        'water without an added emulsifier, which is what lets a tofu base ' +
        'stand in for sesame paste.',
    });

    await mcp.call('upsert_taxonomy_term', {
      facet: 'cuisine',
      label: 'Sichuan',
      description:
        'South-western Chinese cooking defined by ma la — the numbing tingle ' +
        'of Sichuan peppercorn against chilli heat.',
    });

    const term = await mcp.call<{ term: { description: string | null } }>(
      'list_taxonomy',
      { facet: 'equipment' },
    );
    expect(JSON.stringify(term)).toContain('emulsify');
  });

  test('revises rather than duplicating, and keeps both revisions', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);

    const revised = await mcp.call<ReviseResult>('revise_recipe', {
      slug: SLUG,
      rationale:
        'Doubled the Sichuan peppercorn — the numbing was lost behind the ' +
        'tofu, which is exactly what the tofu base risks.',
      ingredients: [
        { name: 'Silken tofu', quantity: 300, unit: 'g' },
        { name: 'Chinese sesame paste', quantity: 20, unit: 'g' },
        { name: 'Sichuan peppercorn', quantity: 8, unit: 'g' },
      ],
    });

    expect(revised.revisionNumber).toBe(2);

    const fetched = await mcp.call<RecipeResult>('get_recipe', { slug: SLUG });
    expect(fetched.revisionNumber).toBe(2);
    expect(fetched.revisions).toHaveLength(2);
    // The rationale is the reason the schema exists — it must survive.
    expect(fetched.revisions[0]?.rationale).toBeTruthy();

    // The step photo has to survive being carried forward. A revision that
    // silently drops imagery would lose the record of what a stage looked
    // like, which is the whole reason for attaching it.
    const blendStep = fetched.steps.find((step) =>
      /blend/i.test(step.instruction),
    );
    expect(blendStep?.imageUrl).toBe(STEP_IMAGE);

    // Crucially: still one recipe, not two.
    const search = await mcp.call<SearchResult>('search_recipes', {
      query: 'dan dan noodles',
    });
    const matches = search.results.filter((r) => r.slug === SLUG);
    expect(matches).toHaveLength(1);
  });

  test('search finds the recipe by ingredient alone', async () => {
    const mcp = mcpClient(test.info().project.use.baseURL!, tokens().readWrite);

    // The no-free-text path — this is the one that used to throw
    // "ORDER BY position 0 is not in select list".
    const byIngredient = await mcp.call<SearchResult>('search_recipes', {
      ingredients: ['Silken tofu'],
    });
    expect(byIngredient.results.map((r) => r.slug)).toContain(SLUG);
  });
});

test.describe('the website serves what the MCP wrote', () => {
  test('the recipe page shows the current revision', async ({ page }) => {
    await page.goto(`/recipes/${SLUG}`);

    await expect(
      page.getByRole('heading', { name: /dan dan noodles/i, level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(/revision 2/i).first()).toBeVisible();
  });

  test('the equipment tag carries the blurb the MCP wrote', async ({
    page,
  }) => {
    await page.goto(`/recipes/${SLUG}`);

    // Located by href, not by accessible name: the name includes the facet
    // prefix ("Equipment Blender"), which is right for a screen reader and
    // brittle to assert on.
    const tag = page.locator('a[href="/taxonomy/equipment/blender"]');
    await expect(tag).toBeVisible();

    const tooltipId = await tag.getAttribute('aria-describedby');
    expect(tooltipId).toBeTruthy();

    const tooltip = page.locator(`#${tooltipId}`);
    await expect(tooltip).toContainText(/emulsify/i);

    // Hidden until hover, then shown — the whole point of the tooltip.
    await expect(tooltip).toBeHidden();
    await tag.hover();
    await expect(tooltip).toBeVisible();
  });

  test('renders the optional hero and step images', async ({ page }) => {
    await page.goto(`/recipes/${SLUG}`);

    const hero = page.locator('.recipe-hero-image img');
    await expect(hero).toBeVisible();
    await expect(hero).toHaveAttribute('alt', /finished bowl/i);

    const stepImage = page.locator('.step-image img');
    await expect(stepImage).toBeVisible();
    await expect(stepImage).toHaveAttribute('alt', /mid-blend/i);

    // Both are optional: a recipe without them renders no figure at all
    // rather than an empty frame or a broken-image icon.
    await page.goto('/recipes/pickled-jalapenos');
    await expect(page.locator('.recipe-hero-image')).toHaveCount(0);
    await expect(page.locator('.step-image')).toHaveCount(0);
  });

  test('the revision history lists why each revision exists', async ({
    page,
  }) => {
    // The rationale appears twice on the page — in the revision timeline and
    // as the "why this revision" lede — so match the first.
    await page.goto(`/recipes/${SLUG}/revisions/1`);
    await expect(
      page.getByText(/first working version/i).first(),
    ).toBeVisible();

    await page.goto(`/recipes/${SLUG}/revisions/2`);
    await expect(page.getByText(/numbing was lost/i).first()).toBeVisible();
  });
});
