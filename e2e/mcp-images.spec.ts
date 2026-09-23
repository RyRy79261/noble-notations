import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { mcpClient, tokens, type McpClient } from './helpers';
import { BLUE_6X4_PNG, NOT_AN_IMAGE, RED_4X4_PNG } from './image-fixtures';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * PUTTING A PICTURE IN — issue #54, end to end.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Every image field in this repository took a web address, and nothing in
 * the connector could make one. An agent that had just been sent a
 * photograph held BYTES: no address, no way to mint one, so `heroImageUrl`
 * was reachable in theory and unreachable in practice. The person had to
 * leave the conversation, host the file somewhere and come back with a link,
 * and most pictures were therefore never added.
 *
 * WHAT THESE TESTS DEFEND, AND WHY EACH ONE IS NOT OBVIOUS:
 *
 * - **The round trip.** The assertion that matters is not that a row was
 *   written. It is that `get_recipe` reports the address, that the address
 *   ANSWERS, and that what comes back is an image. Three parts, three ways
 *   to be broken, and a test of the row alone would pass with all three
 *   broken.
 * - **The stored address is ours.** `/images/<id>`, never the blob URL, and
 *   that is the decision the whole design turns on. A recipe points at a
 *   picture through a TEXT column and not a foreign key — it always did, so
 *   a recipe can name a picture on somebody else's site — so deleting the
 *   image row can do nothing about the recipes naming it. Serving from our
 *   own address is what makes one soft delete take the picture off every
 *   record at once, with no revision rewritten.
 * - **Deduplication is by checksum.** A person sends the same photograph
 *   twice in a conversation more often than not: once to look at it, once to
 *   file it. Two rows would mean two blobs, two bin entries and two ids for
 *   one picture.
 * - **The refusals.** A declared type that disagrees with the bytes, and
 *   bytes that are not an image at all. Both must be a sentence the caller
 *   can act on rather than "An internal error occurred", which tells an
 *   agent nothing about whether its arguments or the server were wrong.
 *
 * NOTHING HERE REACHES VERCEL. `e2e/blob-stub.ts` answers the SDK, and
 * `VERCEL_BLOB_API_URL` on the app server is what makes that a property of
 * the network layer rather than of discipline.
 */

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`;

function rw(): McpClient {
  return mcpClient(BASE, tokens().readWrite);
}

interface UploadResult {
  id: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: string;
  deduplicated: boolean;
  attachedTo: string | null;
  message: string;
}

interface RecipeResult {
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  steps: {
    position: number;
    imageUrl: string | null;
    imageAlt: string | null;
  }[];
}

const stamp = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** A picture no other test has sent, so the checksum is this test's alone. */
async function uniquePng(width: number, height: number): Promise<string> {
  const buffer = await sharp({
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
    .png()
    .toBuffer();
  return buffer.toString('base64');
}

// ═════════════════════════════════════════════════════════════════════════
// 1. The round trip the issue asked for, in the issue's own words
// ═════════════════════════════════════════════════════════════════════════

test('a picture uploaded with attachTo becomes the hero image the recipe reports and the site serves', async ({
  request,
}) => {
  const mcp = rw();
  const id = stamp();
  const slug = `images-hero-${id}`;

  await mcp.call('create_recipe', {
    title: `Images hero ${id}`,
    slug,
    rationale: 'Written by e2e/mcp-images.spec.ts.',
    ingredients: [{ name: `Images salt ${id}`, quantity: 5, unit: 'g' }],
    steps: [{ instruction: 'Salt it.' }, { instruction: 'Wait a day.' }],
  });

  // "I hold a JPEG of a finished dish. I call upload_image with the bytes,
  // the alt text, and attachTo: { recipeSlug }. The tool returns a URL.
  // get_recipe then reports that URL as heroImageUrl." — issue #54, § What a
  // correct result looks like.
  const uploaded = await mcp.call<UploadResult>('upload_image', {
    data: await uniquePng(40, 30),
    mimeType: 'image/png',
    alt: 'Sliced biltong, dark red with a white fat seam.',
    attachTo: { recipeSlug: slug },
  });

  // The address is OURS and not the blob store's. This is the assertion the
  // soft delete depends on; see the file header.
  expect(uploaded.url).toMatch(/^\/images\/[0-9a-f-]{36}$/);
  expect(uploaded.url).toBe(`/images/${uploaded.id}`);
  expect(uploaded.attachedTo).toContain('hero image');
  // Everything is re-encoded to WebP, whatever arrived, so the route has one
  // content type and the store has one extension.
  expect(uploaded.mimeType).toBe('image/webp');
  expect(uploaded.width).toBe(40);
  expect(uploaded.height).toBe(30);

  const recipe = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(recipe.heroImageUrl).toBe(uploaded.url);
  expect(recipe.heroImageAlt).toBe(
    'Sliced biltong, dark red with a white fat seam.',
  );

  // AND THE ADDRESS ANSWERS. A row that reports an address nothing serves is
  // the same broken field the issue was filed about, one layer further down.
  const served = await request.get(`${BASE}${uploaded.url}`);
  expect(served.ok()).toBe(true);
  expect(served.headers()['content-type']).toContain('image/webp');
  const body = await served.body();
  const meta = await sharp(body).metadata();
  expect(meta.format).toBe('webp');
  expect(meta.width).toBe(40);

  // The recipe PAGE draws it, which is the last link in the chain and the
  // one a reader actually meets.
  const page = await request.get(`${BASE}/recipes/${slug}`);
  expect(await page.text()).toContain(uploaded.url);
});

// ═════════════════════════════════════════════════════════════════════════
// 2. A hero makes no version; a step picture goes into the stored one
// ═════════════════════════════════════════════════════════════════════════

test('setting a hero image makes no version, and a step picture lands on the version people read', async () => {
  const mcp = rw();
  const id = stamp();
  const slug = `images-steps-${id}`;

  const created = await mcp.call<{ revisionNumber: number }>('create_recipe', {
    title: `Images steps ${id}`,
    slug,
    rationale: 'Written by e2e/mcp-images.spec.ts.',
    ingredients: [{ name: `Images salt ${id}`, quantity: 5, unit: 'g' }],
    steps: [{ instruction: 'Salt it.' }, { instruction: 'Wait a day.' }],
  });
  expect(created.revisionNumber).toBe(1);

  await mcp.call('upload_image', {
    data: await uniquePng(24, 24),
    mimeType: 'image/png',
    alt: 'The dish, finished and plated.',
    attachTo: { recipeSlug: slug },
  });

  const stepImage = await mcp.call<UploadResult>('upload_image', {
    data: await uniquePng(26, 24),
    mimeType: 'image/png',
    alt: 'The salted meat before it goes in.',
    // COUNTING FROM 1, which is what the site draws and what the issue
    // asked for. The column counts from 0, and the assertion below is on
    // `position: 1` for exactly that reason: `get_recipe` reports the raw
    // column, so the two numbers differ by one and both tools say so.
    attachTo: { recipeSlug: slug, stepPosition: 2 },
  });
  expect(stepImage.attachedTo).toContain('step 2');

  const recipe = await mcp.call<RecipeResult & { revisions: unknown[] }>(
    'get_recipe',
    { slug },
  );

  // NEITHER UPLOAD MADE A VERSION. A hero belongs to the recipe and not to a
  // version; a step picture is a correction to a stored one. Both are the
  // statement that the food did not change, which is the question the whole
  // repository turns on.
  expect(recipe.revisions).toHaveLength(1);

  const second = recipe.steps.find((s) => s.position === 1);
  expect(second?.imageUrl).toBe(stepImage.url);
  expect(second?.imageAlt).toBe('The salted meat before it goes in.');
  // And the first step is untouched, so the position was read and not
  // guessed at — which is the half of the off-by-one that a translation in
  // the wrong direction would still pass.
  expect(recipe.steps.find((s) => s.position === 0)?.imageUrl).toBeNull();
});

test('a step that does not exist is refused, and the refusal says how many there are', async () => {
  const mcp = rw();
  const id = stamp();
  const slug = `images-nostep-${id}`;

  await mcp.call('create_recipe', {
    title: `Images nostep ${id}`,
    slug,
    rationale: 'Written by e2e/mcp-images.spec.ts.',
    ingredients: [{ name: `Images salt ${id}`, quantity: 5, unit: 'g' }],
    steps: [{ instruction: 'Salt it.' }],
  });

  await expect(
    mcp.call('upload_image', {
      data: RED_4X4_PNG,
      mimeType: 'image/png',
      alt: 'A picture with nowhere to go.',
      attachTo: { recipeSlug: slug, stepPosition: 9 },
    }),
    // Counting from 1 is the thing a caller gets wrong, so the refusal says
    // so rather than only reporting that 9 missed.
  ).rejects.toThrow(/1 step\(s\).*no step 9.*count from 1/s);
});

// ═════════════════════════════════════════════════════════════════════════
// 3. The other three records, and the one that takes a list
// ═════════════════════════════════════════════════════════════════════════

test('an ingredient, a tag and a run each take a picture, and a run takes several', async () => {
  const mcp = rw();
  const id = stamp();

  await mcp.call('upsert_ingredient', {
    name: `Images chilli ${id}`,
    slug: `images-chilli-${id}`,
    category: 'spice',
    description: 'One of two chillies that look nothing alike.',
  });
  const onIngredient = await mcp.call<UploadResult>('upload_image', {
    data: await uniquePng(30, 30),
    mimeType: 'image/png',
    alt: 'A wrinkled dark chilli, about 60 mm long.',
    attachTo: { ingredientSlug: `images-chilli-${id}` },
  });
  expect(onIngredient.attachedTo).toContain(`Images chilli ${id}`);

  await mcp.call('upsert_category', {
    categoryType: 'technique',
    label: `Images air-drying ${id}`,
    slug: `images-air-drying-${id}`,
    description: 'A technique that is easier to show than to say.',
  });
  const onTag = await mcp.call<UploadResult>('upload_image', {
    data: await uniquePng(32, 30),
    mimeType: 'image/png',
    alt: 'Strips of meat hanging in a wooden box.',
    attachTo: {
      tagSlug: `images-air-drying-${id}`,
      categoryType: 'technique',
    },
  });
  expect(onTag.attachedTo).toContain(`Images air-drying ${id}`);

  await mcp.call('log_experiment', {
    slug: `images-run-${id}`,
    title: `Images run ${id}`,
    outcome: 'It went well enough to photograph.',
  });
  const hero = await mcp.call<UploadResult>('upload_image', {
    data: await uniquePng(34, 30),
    mimeType: 'image/png',
    alt: 'The finished batch, sliced.',
    attachTo: { experimentSlug: `images-run-${id}` },
  });
  expect(hero.attachedTo).toContain('hero image');

  // A RUN TAKES SEVERAL, and `upload_image` APPENDS to that list where every
  // other list in the write layer is replaced wholesale. It has to: an agent
  // holding one new photograph does not hold the other four, and making it
  // send the whole list would lose one whenever two uploads overlap.
  const first = await mcp.call<UploadResult>('upload_image', {
    data: await uniquePng(36, 30),
    mimeType: 'image/png',
    alt: 'The meat going in on day one.',
    caption: 'Day 1',
    attachTo: { experimentSlug: `images-run-${id}`, gallery: true },
  });
  const second = await mcp.call<UploadResult>('upload_image', {
    data: await uniquePng(38, 30),
    mimeType: 'image/png',
    alt: 'The box on day three.',
    caption: 'Day 3',
    attachTo: { experimentSlug: `images-run-${id}`, gallery: true },
  });
  expect(second.attachedTo).toContain('pictures of');

  const run = await mcp.call<{
    heroImageUrl: string | null;
    images: { url: string; alt: string | null; caption: string | null }[];
  }>('get_experiment', { slug: `images-run-${id}` });

  expect(run.heroImageUrl).toBe(hero.url);
  // In the order they were appended, and the hero is NOT in the list: it is
  // a different field and drawing it twice would read as a duplicate.
  expect(run.images.map((i) => i.url)).toEqual([first.url, second.url]);
  expect(run.images.map((i) => i.caption)).toEqual(['Day 1', 'Day 3']);
});

test('a picture goes on one record, and naming two is refused', async () => {
  await expect(
    rw().call('upload_image', {
      data: RED_4X4_PNG,
      mimeType: 'image/png',
      alt: 'A picture that names two homes.',
      attachTo: { recipeSlug: 'baumy-biltong', ingredientSlug: 'bay-leaf' },
    }),
  ).rejects.toThrow(/one record/);
});

// ═════════════════════════════════════════════════════════════════════════
// 4. The same picture twice
// ═════════════════════════════════════════════════════════════════════════

test('the same bytes sent twice give the same address back, and the second call still attaches', async () => {
  const mcp = rw();
  const id = stamp();
  const slug = `images-dedup-${id}`;
  const bytes = await uniquePng(28, 28);

  await mcp.call('create_recipe', {
    title: `Images dedup ${id}`,
    slug,
    rationale: 'Written by e2e/mcp-images.spec.ts.',
    ingredients: [{ name: `Images salt ${id}`, quantity: 5, unit: 'g' }],
    steps: [{ instruction: 'Salt it.' }],
  });

  const first = await mcp.call<UploadResult>('upload_image', {
    data: bytes,
    mimeType: 'image/png',
    alt: 'A first description, written in a hurry.',
  });
  expect(first.deduplicated).toBe(false);
  expect(first.attachedTo).toBeNull();

  const again = await mcp.call<UploadResult>('upload_image', {
    data: bytes,
    mimeType: 'image/png',
    alt: 'A better description, written on second thoughts.',
    attachTo: { recipeSlug: slug },
  });

  expect(again.deduplicated).toBe(true);
  expect(again.id).toBe(first.id);
  expect(again.url).toBe(first.url);
  // The second call is a caller saying what this picture IS and where it
  // goes. Only the bytes were already known, so the alt text is the new one.
  expect(again.attachedTo).toContain('hero image');

  const recipe = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(recipe.heroImageAlt).toBe(
    'A better description, written on second thoughts.',
  );
});

// ═════════════════════════════════════════════════════════════════════════
// 5. What comes in, and what is refused
// ═════════════════════════════════════════════════════════════════════════

test('a picture larger than the stored edge is made smaller, and a small one is left alone', async () => {
  const mcp = rw();

  const big = await sharp({
    create: {
      width: 4000,
      height: 3000,
      channels: 3,
      background: { r: 120, g: 110, b: 60 },
    },
  })
    .jpeg({ quality: 60 })
    .toBuffer();

  const uploaded = await mcp.call<UploadResult>('upload_image', {
    data: big.toString('base64'),
    mimeType: 'image/jpeg',
    alt: 'A photograph the size a phone actually produces.',
  });

  // 2400 on the longest edge, and the aspect ratio kept.
  expect(uploaded.width).toBe(2400);
  expect(uploaded.height).toBe(1800);
  expect(uploaded.message).toContain('smaller');

  // A SMALL PICTURE IS NEVER SCALED UP. `withoutEnlargement` is what stops a
  // 4 px fixture becoming a blurry 2400 px one.
  const small = await mcp.call<UploadResult>('upload_image', {
    data: BLUE_6X4_PNG,
    mimeType: 'image/png',
    alt: 'Six pixels by four, and it stays that way.',
  });
  expect(small.width).toBe(6);
  expect(small.height).toBe(4);
  expect(small.message).not.toContain('smaller');
});

test('bytes that are not an image, and a type that disagrees with the bytes, are both refused in words', async () => {
  const mcp = rw();

  await expect(
    mcp.call('upload_image', {
      data: NOT_AN_IMAGE,
      mimeType: 'image/png',
      alt: 'Not a picture at all.',
    }),
    // A sentence the caller can act on, never "An internal error occurred".
  ).rejects.toThrow(/not an image this store can read/);

  // The declared type is CHECKED against the bytes rather than trusted. A
  // caller that says PNG and sends something else is a caller whose next
  // call would put that something else behind an `<img>` tag.
  await expect(
    mcp.call('upload_image', {
      data: RED_4X4_PNG,
      mimeType: 'image/jpeg',
      alt: 'A PNG wearing a JPEG label.',
    }),
  ).rejects.toThrow(/says image\/jpeg and the bytes are image\/png/);
});

test('alt text is required, and the schema says so before any byte is read', async () => {
  const advertised = await rw().listToolSchemas();
  const tool = advertised.find((t) => t.name === 'upload_image');
  expect(tool, 'upload_image is not registered').toBeTruthy();

  const schema = tool!.inputSchema as { required?: string[] };
  // `images.alt` is NOT NULL while `recipes.hero_image_alt` is nullable, and
  // the difference is deliberate: the recipe column predates this tool, and
  // a column that allows null collects nulls.
  //
  // `alt` is the ONLY required field now. `data` and `mimeType` became
  // optional when `sourceUrl` arrived (issue #56), and "exactly one of data
  // or sourceUrl" is a refinement the JSON Schema cannot state — see
  // e2e/mcp-image-upload-link.spec.ts for the refusal that enforces it.
  expect([...(schema.required ?? [])].sort()).toEqual(['alt']);

  await expect(
    rw().call('upload_image', {
      data: RED_4X4_PNG,
      mimeType: 'image/png',
      alt: '',
    }),
    // The SDK validates against the advertised JSON Schema before the tool
    // body runs, so this refusal is the transport's and not `runTool`'s.
    // Asserting the field name is what makes it a test of `alt` being
    // required rather than of validation existing.
  ).rejects.toThrow(/validation error.*at alt/s);
});

// ═════════════════════════════════════════════════════════════════════════
// 6. Deleting a picture, which is the thing issue #54 asked for a tool for
// ═════════════════════════════════════════════════════════════════════════

test('deleting an image takes it off every record at once, and a restore brings them all back', async ({
  request,
}) => {
  const mcp = rw();
  const id = stamp();
  const slug = `images-delete-${id}`;

  await mcp.call('create_recipe', {
    title: `Images delete ${id}`,
    slug,
    rationale: 'Written by e2e/mcp-images.spec.ts.',
    ingredients: [{ name: `Images salt ${id}`, quantity: 5, unit: 'g' }],
    steps: [{ instruction: 'Salt it.' }],
  });
  await mcp.call('upsert_ingredient', {
    name: `Images pepper ${id}`,
    slug: `images-pepper-${id}`,
    category: 'spice',
    description: 'An ingredient that shares a picture with a recipe.',
  });

  // ONE picture on TWO records. This is only possible because the reference
  // is an address and not a foreign key, and it is exactly the case a delete
  // cannot fix by rewriting rows.
  const bytes = await uniquePng(44, 33);
  const uploaded = await mcp.call<UploadResult>('upload_image', {
    data: bytes,
    mimeType: 'image/png',
    alt: 'A picture two records point at.',
    attachTo: { recipeSlug: slug },
  });
  await mcp.call('upload_image', {
    data: bytes,
    mimeType: 'image/png',
    alt: 'A picture two records point at.',
    attachTo: { ingredientSlug: `images-pepper-${id}` },
  });

  expect((await request.get(`${BASE}${uploaded.url}`)).ok()).toBe(true);

  // There is no `delete_image`, and the issue asked for one. This repository
  // has ONE delete and it is soft; a second verb would have needed a second
  // undo beside it, and then two answers to "how do I get it back".
  const deleted = await mcp.call<{ kind: string; handle: string }>(
    'delete_record',
    {
      kind: 'image',
      id: uploaded.id,
      reason: 'It is a picture of the wrong dish.',
    },
  );
  expect(deleted.kind).toBe('image');
  // The handle is the alt text, because it is the only human-readable thing
  // an image carries — without it the bin would be a column of uuids.
  expect(deleted.handle).toContain('A picture two records point at');

  // THE ADDRESS IS NOW A 404, which is what takes the picture off both
  // records at once. Neither row was rewritten.
  const gone = await request.get(`${BASE}${uploaded.url}`, {
    maxRedirects: 0,
  });
  expect(gone.status()).toBe(404);

  // The rows still name it, unchanged, which is what makes the restore
  // exact. A delete that had cleared them could not put them back.
  const recipe = await mcp.call<RecipeResult>('get_recipe', { slug });
  expect(recipe.heroImageUrl).toBe(uploaded.url);

  await mcp.call('restore_record', { kind: 'image', id: uploaded.id });
  expect((await request.get(`${BASE}${uploaded.url}`)).ok()).toBe(true);
});

test('an image is addressed by id alone, and a slug is refused', async () => {
  await expect(
    rw().call('delete_record', { kind: 'image', slug: 'no-such-picture' }),
  ).rejects.toThrow(/image has no slug/);
});

test('an address that names no stored picture is a 404, not a 500', async ({
  request,
}) => {
  // A uuid-shaped id nothing holds.
  const missing = await request.get(
    `${BASE}/images/00000000-0000-0000-0000-000000000000`,
    { maxRedirects: 0 },
  );
  expect(missing.status()).toBe(404);

  // AND ONE THAT IS NOT A UUID AT ALL. Postgres raises `22P02` rather than
  // matching nothing when a uuid column meets a value that is not one, so
  // without the shape check in `getImage` a mistyped address is a 500.
  const malformed = await request.get(`${BASE}/images/not-a-uuid`, {
    maxRedirects: 0,
  });
  expect(malformed.status()).toBe(404);
});
