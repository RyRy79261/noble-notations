import 'server-only';

/**
 * Turning what an agent holds into what this repository stores.
 *
 * An agent that just cooked something holds a photograph off a phone: four
 * thousand pixels wide, three to five megabytes, and JPEG. None of that is
 * what a recipe page wants. This module is the one place that decides what
 * happens to it, and it answers the first of the four questions issue #54
 * left open.
 *
 * **The answer is resize, with a refusal above a limit.** Both, not either.
 * Refusing alone puts the work back on the agent, which is the friction the
 * issue was filed about — the whole complaint is that a person has to leave
 * the conversation to make an image usable. Resizing alone means an
 * unbounded decode: `sharp` must allocate width × height × 4 bytes before it
 * can make anything smaller, so a hostile or mistaken 30000 × 30000 PNG is
 * 3.6 GB of resident memory and the function dies rather than refusing. So
 * there is a byte ceiling, a pixel ceiling, and everything under both is
 * resized without comment.
 */
import sharp, { type Metadata } from 'sharp';
import { createHash } from 'node:crypto';
import { MAX_STORED_EDGE, RENDITION_WIDTHS } from './widths';

/** What a caller may send. The stored type is always WebP — see below. */
export const ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;
export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

/**
 * The byte ceiling on what arrives, and the number the refusal names.
 *
 * 25 MB covers every phone in use with room left over — a 48-megapixel
 * iPhone photograph converted to JPEG lands around 6 MB, and a 200-megapixel
 * Android JPEG around 12 MB — so a caller meeting this limit is sending
 * something that is not a photograph. It was 15 MB while base64 was the only
 * way in. An upload link carries the file itself, so the limit now describes
 * the file and not what fits in a tool call; `upload_image` keeps its own
 * smaller ceiling on `data` in `src/lib/domain/schemas.ts`.
 */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

/**
 * The decode ceiling, in pixels, and the reason the byte ceiling is not
 * enough on its own: compression ratio is not bounded. A 2 MB PNG of flat
 * colour decodes to gigabytes. 80 megapixels is above any camera a cook owns
 * and far below anything that hurts.
 */
export const MAX_INPUT_PIXELS = 80_000_000;

/**
 * The longest edge of the largest copy stored, and the smaller copies made
 * beside it. Both live in `widths.ts`, which the components read too.
 *
 * A recipe hero renders at 1200 CSS pixels at the very widest, and a 2×
 * display asks for 2400. It was 2000 while every reader got the one file,
 * because doubling it for a retina screen doubled it for a phone too. Now a
 * page names the smaller copies in `srcset` and the browser picks, so the
 * largest copy can be the one a 2× screen wants without a phone paying for
 * it.
 */
export { MAX_STORED_EDGE, RENDITION_WIDTHS };

/**
 * Everything is stored as WebP, whatever arrived.
 *
 * One stored type means one `Content-Type` on the route, one extension in
 * the blob store, and no branch anywhere that asks what kind of picture this
 * is. WebP is supported by every browser this site targets and is smaller
 * than JPEG at the same quality. The original is not kept: this repository
 * stores what a reader sees, and a second copy nothing renders is a cost
 * with no reader.
 *
 * Quality 82 is where WebP stops being distinguishable from the source on a
 * photograph and is roughly a third of the JPEG bytes.
 */
const STORED_MIME_TYPE = 'image/webp';
const STORED_QUALITY = 82;

export class ImageRejected extends Error {}

export interface ProcessedRendition {
  data: Buffer;
  width: number;
  height: number;
  bytes: number;
}

export interface ProcessedImage {
  /** The bytes to store. Always WebP. */
  data: Buffer;
  mimeType: typeof STORED_MIME_TYPE;
  width: number;
  height: number;
  bytes: number;
  /** sha256 of `data`, which is what makes a re-upload find the first row. */
  checksum: string;
  /** True when the picture was bigger than `MAX_STORED_EDGE` and was cut. */
  resized: boolean;
  /** The smaller copies, narrowest first. See `RENDITION_WIDTHS`. */
  renditions: ProcessedRendition[];
}

/** Decode base64 strictly: a value that is not base64 must not become bytes. */
export function decodeBase64(data: string): Buffer {
  // A data URL is what a caller sends when it pasted rather than read a
  // file, and dropping the prefix is kinder than a refusal that says
  // "invalid base64" about a string that plainly holds an image.
  const bare = data.replace(/^data:[^;,]*;base64,/, '').trim();
  const buffer = Buffer.from(bare, 'base64');
  // Buffer.from ignores anything it cannot read rather than throwing, so a
  // sentence of prose decodes to a few bytes of nonsense. Re-encoding and
  // comparing lengths is the check that catches it.
  if (buffer.length === 0) {
    throw new ImageRejected(
      '`data` decoded to nothing. Send the image base64 encoded.',
    );
  }
  return buffer;
}

/**
 * Validate, shrink and re-encode. The only path bytes take into the store.
 *
 * `declaredMimeType` is checked against what the bytes actually are rather
 * than trusted. A caller that says PNG and sends a PDF is a caller whose
 * next call would put a PDF behind an `<img>` tag. It is null where nobody
 * declared anything — a file a person picked on the upload page, or one
 * fetched from a web address — and then the bytes alone decide, against the
 * same list.
 */
export async function processImage(
  input: Buffer,
  declaredMimeType: AcceptedMimeType | null,
): Promise<ProcessedImage> {
  if (input.length > MAX_INPUT_BYTES) {
    const mb = (input.length / 1024 / 1024).toFixed(1);
    throw new ImageRejected(
      `That image is ${mb} MB and the limit is ${MAX_INPUT_BYTES / 1024 / 1024} MB. ` +
        'Send a smaller one. Every phone camera is under the limit at full ' +
        'resolution, so an image above it is usually a scan or an export ' +
        'from an editor.',
    );
  }

  const pipeline = sharp(input, {
    limitInputPixels: MAX_INPUT_PIXELS,
    // An animated GIF or WebP would otherwise be silently flattened to its
    // first frame. This repository has no use for one and saying so is
    // better than storing a still nobody asked for.
    animated: false,
  });

  let meta: Metadata;
  try {
    meta = await pipeline.metadata();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ImageRejected(
      `Those bytes are not an image this store can read: ${detail}`,
    );
  }

  const actual = meta.format ? `image/${meta.format}` : null;
  if (
    !actual ||
    !(ACCEPTED_MIME_TYPES as readonly string[]).includes(
      actual === 'image/jpg' ? 'image/jpeg' : actual,
    )
  ) {
    throw new ImageRejected(
      `Those bytes are ${actual ?? 'not an image'}. This store takes ` +
        `${ACCEPTED_MIME_TYPES.join(', ')}.`,
    );
  }

  const normalisedActual = actual === 'image/jpg' ? 'image/jpeg' : actual;
  if (declaredMimeType !== null && normalisedActual !== declaredMimeType) {
    throw new ImageRejected(
      `\`mimeType\` says ${declaredMimeType} and the bytes are ` +
        `${normalisedActual}. Send the type the bytes actually are.`,
    );
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1) {
    throw new ImageRejected('That image has no width or no height.');
  }

  const longest = Math.max(width, height);
  const resized = longest > MAX_STORED_EDGE;

  const data = await pipeline
    // `rotate()` with no argument applies the EXIF orientation and drops the
    // tag. Without it a photograph taken in portrait is stored on its side:
    // the browser honours EXIF, `sharp` honours it only when asked, and the
    // resize below is computed on the unrotated dimensions.
    .rotate()
    .resize({
      width: resized ? MAX_STORED_EDGE : undefined,
      height: resized ? MAX_STORED_EDGE : undefined,
      fit: 'inside',
      // Never scale a small picture up. A 400 px photograph stays 400 px.
      withoutEnlargement: true,
    })
    .webp({ quality: STORED_QUALITY })
    .toBuffer();

  // Read the dimensions back rather than computing them. `rotate()` may have
  // swapped the axes and `fit: 'inside'` rounds, so the arithmetic answer and
  // the stored answer disagree often enough to matter for a page that sets
  // width and height to reserve the space.
  const out = await sharp(data).metadata();
  const storedWidth = out.width ?? width;
  const storedHeight = out.height ?? height;

  // Each smaller copy is made from the stored copy and not from the input.
  // The stored copy is already upright and already small, so this decodes
  // 2400 pixels three times rather than 4000 three times, and every copy is
  // certain to be the same picture as the one it stands in for.
  const renditions: ProcessedRendition[] = [];
  for (const target of RENDITION_WIDTHS) {
    if (target >= storedWidth) break;
    const copy = await sharp(data)
      .resize({ width: target, withoutEnlargement: true })
      .webp({ quality: STORED_QUALITY })
      .toBuffer();
    const copyMeta = await sharp(copy).metadata();
    renditions.push({
      data: copy,
      width: copyMeta.width ?? target,
      height:
        copyMeta.height ?? Math.round((storedHeight * target) / storedWidth),
      bytes: copy.length,
    });
  }

  return {
    data,
    mimeType: STORED_MIME_TYPE,
    width: storedWidth,
    height: storedHeight,
    bytes: data.length,
    checksum: createHash('sha256').update(data).digest('hex'),
    resized,
    renditions,
  };
}
