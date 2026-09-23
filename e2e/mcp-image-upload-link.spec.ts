import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import sharp from 'sharp';
import { mcpClient, tokens, type McpClient } from './helpers';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * A PHOTOGRAPH THAT NEVER PASSES THROUGH THE MODEL — issues #56 and #58.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `upload_image` took the picture as base64, and the model writes the tool
 * call, so a photograph was millions of tokens: it filled the context and
 * failed. `request_image_upload` returns a link instead, the person opens it
 * and picks the file, and the browser writes the original to the blob store.
 *
 * WHAT THESE TESTS DEFEND:
 *
 * - **The whole path, in a real browser.** The page, the client token, the
 *   direct PUT to the store, the processing and the record. The assertion
 *   that matters is on the record and on what `/images/<id>` serves, not on
 *   a row.
 * - **The target is checked when the link is made**, so a person is never
 *   sent to upload for a recipe that is not there.
 * - **One link, one picture.** A used link and an expired link both refuse,
 *   in words, on the page and at every route.
 * - **The browser cannot choose where its file is read from.** A pathname
 *   outside the link's own prefix is refused.
 * - **Smaller copies exist and `?w=` picks one.**
 * - **`sourceUrl` refuses a private address and says why.** A server-side
 *   fetch driven by caller input is a request forgery surface.
 *
 * NOTHING HERE REACHES VERCEL. The browser's PUT goes to `e2e/blob-stub.ts`
 * through `NEXT_PUBLIC_VERCEL_BLOB_API_URL`, inlined at build time.
 */

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`;

function rw(): McpClient {
  return mcpClient(BASE, tokens().readWrite);
}

interface LinkResult {
  link: string;
  putUrl: string;
  target: string;
  expiresAt: string;
  message: string;
}

interface RecipeResult {
  heroImageUrl: string | null;
  heroImageAlt: string | null;
}

const stamp = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function makeRecipe(mcp: McpClient, prefix: string): Promise<string> {
  const id = stamp();
  const slug = `${prefix}-${id}`;
  await mcp.call('create_recipe', {
    title: `Upload link ${id}`,
    slug,
    rationale: 'Written by e2e/mcp-image-upload-link.spec.ts.',
    ingredients: [{ name: `Upload salt ${id}`, quantity: 5, unit: 'g' }],
    steps: [{ instruction: 'Salt it.' }],
  });
  return slug;
}

/** A photograph-shaped JPEG no other test has sent. */
async function uniqueJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: {
        r: Math.floor(Math.random() * 256),
        g: Math.floor(Math.random() * 256),
        b: Math.floor(Math.random() * 256),
      },
    },
  })
    .jpeg({ quality: 70 })
    .toBuffer();
}

function tokenOf(link: string): string {
  return new URL(link).pathname.split('/').pop()!;
}

// ═════════════════════════════════════════════════════════════════════════
// 1. The path a person takes
// ═════════════════════════════════════════════════════════════════════════

test('a person opens the link, picks a photograph, and it becomes the hero image at full stored size', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const mcp = rw();
  const slug = await makeRecipe(mcp, 'upload-link-hero');

  const link = await mcp.call<LinkResult>('request_image_upload', {
    attachTo: { recipeSlug: slug },
  });

  // THE MODEL HANDLES A LINK, NOT A PICTURE. The whole result is a few
  // hundred characters whatever the photograph weighs.
  expect(JSON.stringify(link).length).toBeLessThan(1000);
  expect(link.link).toMatch(/\/upload\/[A-Za-z0-9_-]{43}$/);
  // Written on the host the connector reached, not a guessed one.
  expect(link.link.startsWith(BASE)).toBe(true);
  expect(link.target).toContain('hero image');
  expect(link.putUrl).toBe(`${BASE}/api/uploads/${tokenOf(link.link)}`);

  // A photograph bigger than the stored edge, so the resize shows.
  const photo = await uniqueJpeg(4000, 3000);

  await page.goto(link.link);
  await expect(
    page.getByRole('heading', { name: 'Add a picture' }),
  ).toBeVisible();
  await expect(page.getByText(link.target).first()).toBeVisible();

  const upload = page.locator('input[type="file"]');
  await upload.setInputFiles({
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer: photo,
  });
  // No alt text was given with the link, so the page asks for it and the
  // button waits for it.
  const button = page.getByRole('button', { name: 'Upload' });
  await expect(button).toBeDisabled();
  await page
    .getByLabel('What the picture shows')
    .fill('Grilled chicken, charred skin, on a banana leaf.');
  await button.click();

  await expect(page.locator('[data-upload-done]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-upload-done]')).toContainText('2400 × 1800');

  const recipe = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(recipe.heroImageUrl).toMatch(/^\/images\/[0-9a-f-]{36}$/);
  expect(recipe.heroImageAlt).toBe(
    'Grilled chicken, charred skin, on a banana leaf.',
  );

  // The largest copy is 2400 wide; `?w=480` answers with a copy 480 wide.
  const full = await request.get(`${BASE}${recipe.heroImageUrl}`);
  expect(full.ok()).toBe(true);
  expect((await sharp(await full.body()).metadata()).width).toBe(2400);
  const small = await request.get(`${BASE}${recipe.heroImageUrl}?w=480`);
  expect(small.ok()).toBe(true);
  expect((await sharp(await small.body()).metadata()).width).toBe(480);
  const mid = await request.get(`${BASE}${recipe.heroImageUrl}?w=700`);
  expect((await sharp(await mid.body()).metadata()).width).toBe(960);

  // The recipe page names the copies in `srcset`.
  const html = await (await request.get(`${BASE}/recipes/${slug}`)).text();
  expect(html).toContain(`${recipe.heroImageUrl}?w=960 960w`);

  // THE ORIGINAL IS NOT KEPT. Only WebP objects remain in the store for it.
  const objects = (await (
    await request.get(
      `http://127.0.0.1:${Number(process.env.E2E_PORT ?? 3100) + 6}/__objects`,
    )
  ).json()) as { objects: { pathname: string }[] };
  const linkId = objects.objects.filter((o) =>
    o.pathname.startsWith('uploads/'),
  );
  expect(linkId).toEqual([]);

  // AND THE LINK IS SPENT. The page says so in words.
  await page.goto(link.link);
  await expect(
    page.getByRole('heading', { name: 'This link is used' }),
  ).toBeVisible();
});

// ═════════════════════════════════════════════════════════════════════════
// 2. The target is checked before anybody is sent to upload
// ═════════════════════════════════════════════════════════════════════════

test('a link for a record that is not there, or a step past the last, is refused when it is asked for', async () => {
  const mcp = rw();
  await expect(
    mcp.call('request_image_upload', {
      attachTo: { recipeSlug: `no-such-recipe-${stamp()}` },
    }),
  ).rejects.toThrow(/No recipe with slug/);

  const slug = await makeRecipe(mcp, 'upload-link-step');
  await expect(
    mcp.call('request_image_upload', {
      attachTo: { recipeSlug: slug, stepPosition: 9 },
    }),
  ).rejects.toThrow(/has 1 step\(s\)/);

  // The probe wrote nothing: the recipe still has no hero image.
  const recipe = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(recipe.heroImageUrl).toBeNull();
});

// ═════════════════════════════════════════════════════════════════════════
// 3. The shell path, and one link one picture
// ═════════════════════════════════════════════════════════════════════════

test('an agent with a shell PUTs to the link, and a second picture through the same link is refused', async ({
  request,
}) => {
  const mcp = rw();
  const slug = await makeRecipe(mcp, 'upload-link-put');
  const link = await mcp.call<LinkResult>('request_image_upload', {
    attachTo: { recipeSlug: slug },
    alt: 'A bowl of dipping sauce, dark red with toasted rice.',
  });

  const first = await request.put(link.putUrl, {
    headers: { 'content-type': 'image/jpeg' },
    data: await uniqueJpeg(900, 600),
  });
  expect(first.status()).toBe(200);
  const stored = (await first.json()) as {
    url: string;
    width: number;
    attachedTo: string;
  };
  expect(stored.width).toBe(900);
  expect(stored.attachedTo).toContain('hero image');

  const recipe = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(recipe.heroImageUrl).toBe(stored.url);
  // The alt text given with the link was used, because the PUT gave none.
  expect(recipe.heroImageAlt).toBe(
    'A bowl of dipping sauce, dark red with toasted rice.',
  );

  const second = await request.put(link.putUrl, {
    headers: { 'content-type': 'image/jpeg' },
    data: await uniqueJpeg(900, 600),
  });
  expect(second.status()).toBe(410);
  expect(((await second.json()) as { error: string }).error).toMatch(
    /already been used/,
  );
  const token = await request.post(
    `${BASE}/api/uploads/${tokenOf(link.link)}/token`,
  );
  expect(token.status()).toBe(410);
});

test('a PUT to a link made without alt text must say what the picture shows', async ({
  request,
}) => {
  const mcp = rw();
  const slug = await makeRecipe(mcp, 'upload-link-alt');
  const link = await mcp.call<LinkResult>('request_image_upload', {
    attachTo: { recipeSlug: slug },
  });
  const refused = await request.put(link.putUrl, {
    headers: { 'content-type': 'image/jpeg' },
    data: await uniqueJpeg(100, 100),
  });
  expect(refused.status()).toBe(400);
  expect(((await refused.json()) as { error: string }).error).toMatch(/alt/);

  // The refusal did not spend the link.
  const accepted = await request.put(
    `${link.putUrl}?alt=${encodeURIComponent('A plate of sticky rice.')}`,
    {
      headers: { 'content-type': 'image/jpeg' },
      data: await uniqueJpeg(100, 100),
    },
  );
  expect(accepted.status()).toBe(200);
});

// ═════════════════════════════════════════════════════════════════════════
// 4. Expiry, a bad token, and a lying browser
// ═════════════════════════════════════════════════════════════════════════

test('an expired link refuses on the page and at the routes, and an unknown token is a 404', async ({
  page,
  request,
}) => {
  const mcp = rw();
  const slug = await makeRecipe(mcp, 'upload-link-expired');
  const link = await mcp.call<LinkResult>('request_image_upload', {
    attachTo: { recipeSlug: slug },
    alt: 'Never uploaded.',
  });

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Only the hash of the token is stored, so the row is found the way the
    // server finds it.
    const hash = createHash('sha256').update(tokenOf(link.link)).digest('hex');
    const updated = await client.query(
      `UPDATE image_uploads SET expires_at = now() - interval '1 minute'
        WHERE token_hash = $1`,
      [hash],
    );
    expect(updated.rowCount).toBe(1);
  } finally {
    await client.end();
  }

  await page.goto(link.link);
  await expect(
    page.getByRole('heading', { name: 'This link has expired' }),
  ).toBeVisible();

  const put = await request.put(link.putUrl, {
    headers: { 'content-type': 'image/jpeg' },
    data: await uniqueJpeg(50, 50),
  });
  expect(put.status()).toBe(410);
  expect(((await put.json()) as { error: string }).error).toMatch(/expired/);

  const unknown = await request.post(`${BASE}/api/uploads/not-a-token/token`);
  expect(unknown.status()).toBe(404);
});

test('the complete route refuses a pathname outside the link, so the browser cannot choose what is read', async ({
  request,
}) => {
  const mcp = rw();
  const slug = await makeRecipe(mcp, 'upload-link-lie');
  const link = await mcp.call<LinkResult>('request_image_upload', {
    attachTo: { recipeSlug: slug },
    alt: 'A lie about where the file went.',
  });
  const refused = await request.post(
    `${BASE}/api/uploads/${tokenOf(link.link)}/complete`,
    {
      data: {
        pathname: 'images/somebody-elses-picture.webp',
        alt: 'A lie about where the file went.',
      },
    },
  );
  expect(refused.status()).toBe(400);
  expect(((await refused.json()) as { error: string }).error).toMatch(
    /not uploaded through this link/,
  );
});

// ═════════════════════════════════════════════════════════════════════════
// 5. sourceUrl, and the guard on it
// ═════════════════════════════════════════════════════════════════════════

test('upload_image refuses a sourceUrl at a private address and says why, and refuses data with sourceUrl', async () => {
  const mcp = rw();

  await expect(
    mcp.call('upload_image', {
      sourceUrl: 'https://127.0.0.1/secret.jpg',
      alt: 'Nothing.',
    }),
  ).rejects.toThrow(/private, local or reserved address/);

  await expect(
    mcp.call('upload_image', {
      sourceUrl: 'https://169.254.169.254/latest/meta-data',
      alt: 'Nothing.',
    }),
  ).rejects.toThrow(/private, local or reserved address/);

  await expect(
    mcp.call('upload_image', {
      sourceUrl: 'http://example.com/a.jpg',
      alt: 'Nothing.',
    }),
  ).rejects.toThrow(/https/);

  await expect(
    mcp.call('upload_image', {
      sourceUrl: 'https://example.com/a.jpg',
      data: 'iVBORw0KGgo=',
      mimeType: 'image/png',
      alt: 'Nothing.',
    }),
  ).rejects.toThrow(/one way/);

  await expect(
    mcp.call('upload_image', { alt: 'Nothing at all.' }),
  ).rejects.toThrow(/request_image_upload/);
});
