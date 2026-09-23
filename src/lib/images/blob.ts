import 'server-only';

/**
 * The blob store, behind two functions.
 *
 * Vercel Blob is the only thing in this repository that holds bytes. Every
 * other durable fact is a Postgres row, and keeping the SDK behind this
 * module is what stops that asymmetry leaking: the write layer stores an
 * address and a pathname, and has no opinion about who serves them.
 *
 * **It is configured in Production and Preview only.** The token is a
 * project environment variable, so a developer's machine and CI both run
 * without it, and both must stay working — `pnpm build` has no database
 * either, and the e2e suite brings its own Postgres and no blob store. So
 * the absence of the token is a NORMAL state with a sentence for the caller,
 * not an exception that reaches a stack trace. `isConfigured` is what
 * `registerTools` asks before it registers `upload_image` at all, for the
 * same reason `report_issue` asks about `GITHUB_ISSUE_TOKEN`: a tool that is
 * advertised and cannot work is worse than a tool that is absent, because an
 * agent calls it, fails, and has no way to tell a misconfiguration from a
 * fault in its own arguments.
 */
import { del, head, put } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import type { ProcessedRendition } from './process';

/** The prefix every object this repository writes lives under. */
const PREFIX = 'images';

export class BlobNotConfigured extends Error {
  constructor() {
    super(
      'Image storage is not configured on this deployment, so there is ' +
        'nowhere to put the bytes. BLOB_READ_WRITE_TOKEN is not set. Give ' +
        'the recipe a `heroImageUrl` that already exists on the web instead, ' +
        'or ask the owner to connect the blob store.',
    );
  }
}

export function isConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export interface StoredBlob {
  url: string;
  pathname: string;
}

export interface StoredRendition extends StoredBlob {
  width: number;
  height: number;
  bytes: number;
}

/**
 * Write the bytes and return where they went.
 *
 * `addRandomSuffix` is left at its default of true, and that is load-bearing
 * rather than incidental. A blob is public — the SDK has no other access
 * mode — so the only thing standing between a deleted picture and anybody
 * who wants to guess its address is the suffix. It also makes the checksum
 * name below safe to use: two callers uploading the same file at the same
 * moment write two objects instead of racing on one key, and the unique
 * index on `images.checksum` is what settles which row survives.
 */
export async function putImage(
  data: Buffer,
  checksum: string,
): Promise<StoredBlob> {
  if (!isConfigured()) throw new BlobNotConfigured();

  const result = await put(`${PREFIX}/${checksum}.webp`, data, {
    access: 'public',
    contentType: 'image/webp',
    // The bytes at an address never change: the address is derived from a
    // hash of the bytes. So the object may be cached for as long as the CDN
    // will hold it. A year is the conventional ceiling.
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });

  return { url: result.url, pathname: result.pathname };
}

/**
 * Write the smaller copies beside the stored picture. See
 * `images.renditions` in `src/db/schema.ts`.
 *
 * Named after the checksum of the LARGEST copy, with the width appended, so
 * every copy of one picture sits next to it in the store and a person
 * looking in the dashboard can see which file each one belongs to.
 */
export async function putRenditions(
  renditions: ProcessedRendition[],
  checksum: string,
): Promise<StoredRendition[]> {
  if (!isConfigured()) throw new BlobNotConfigured();
  return Promise.all(
    renditions.map(async (r) => {
      const result = await put(
        `${PREFIX}/${checksum}-w${r.width}.webp`,
        r.data,
        {
          access: 'public',
          contentType: 'image/webp',
          cacheControlMaxAge: 60 * 60 * 24 * 365,
        },
      );
      return {
        url: result.url,
        pathname: result.pathname,
        width: r.width,
        height: r.height,
        bytes: r.bytes,
      };
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Upload links
//
// A person's browser sends the ORIGINAL file straight to the blob store and
// not through a function. That is not a preference. A Vercel function
// refuses a request body over 4.5 MB, and a phone photograph is often more,
// so a form that posted to our own route would fail on exactly the pictures
// the link exists for. The store takes the file directly when the browser
// holds a client token, and a client token is something only the server can
// sign.
// ─────────────────────────────────────────────────────────────────────────

/** Where the originals land. Nothing renders from here. */
const UPLOAD_PREFIX = 'uploads';

/** The pathname a link's original is written to, before the random suffix. */
export function uploadPathname(uploadId: string): string {
  return `${UPLOAD_PREFIX}/${uploadId}/original`;
}

/**
 * Sign permission for ONE browser upload to ONE pathname.
 *
 * The token names the pathname, the types and the size, and it lasts ten
 * minutes: long enough for a slow phone connection to send 25 MB, short
 * enough that a token copied out of a browser is worth little. It cannot
 * write anywhere else, because the store checks the pathname it was signed
 * for.
 */
export async function issueUploadToken(
  uploadId: string,
  maxBytes: number,
  contentTypes: readonly string[],
): Promise<{ clientToken: string; pathname: string }> {
  if (!isConfigured()) throw new BlobNotConfigured();
  const pathname = uploadPathname(uploadId);
  const clientToken = await generateClientTokenFromReadWriteToken({
    token: process.env.BLOB_READ_WRITE_TOKEN,
    pathname,
    allowedContentTypes: [...contentTypes],
    maximumSizeInBytes: maxBytes,
    addRandomSuffix: true,
    validUntil: Date.now() + 10 * 60 * 1000,
  });
  return { clientToken, pathname };
}

/**
 * Ask the store where an uploaded original is, and how big it is.
 *
 * The browser reports the pathname it wrote. The address to READ is taken
 * from the store's answer and never from the browser, so a page that lies
 * about where its file went can at worst name another object in our own
 * store under the same link's prefix — the caller checks the prefix before
 * it asks.
 */
export async function findUpload(
  pathname: string,
): Promise<{ url: string; size: number; contentType: string } | null> {
  if (!isConfigured()) throw new BlobNotConfigured();
  try {
    const found = await head(pathname);
    return {
      url: found.url,
      size: found.size,
      contentType: found.contentType,
    };
  } catch {
    return null;
  }
}

/** Read an object this store holds, refusing one over `maxBytes`. */
export async function readUpload(
  url: string,
  maxBytes: number,
): Promise<Buffer> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(
      `The blob store answered ${response.status} for an upload.`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) {
    throw new Error('The upload is larger than the limit it was signed for.');
  }
  return buffer;
}

/**
 * Remove the bytes. Nothing in the connector calls this.
 *
 * It exists for the one job that will eventually need it — reclaiming the
 * objects behind images that have been deleted long enough that nobody is
 * going to restore them — and it is deliberately not wired to
 * `delete_record`. A delete in this repository is soft and exact: the row
 * stays, the picture leaves the site, and `restore_record` brings it back
 * whole. Destroying the bytes would make that restore a lie for one kind of
 * record and no other. See `images` in `src/db/schema.ts`.
 */
export async function removeImage(url: string): Promise<void> {
  if (!isConfigured()) throw new BlobNotConfigured();
  await del(url);
}

/**
 * Remove an ORIGINAL once it has been processed. This one is called.
 *
 * It is not the delete `removeImage` refuses to be. An original is not a
 * picture this repository stores — it is the file on its way in, and the
 * stored picture is the WebP made from it. Keeping it would be the second
 * copy nothing renders that `process.ts` says the store does not keep.
 * A failure here is swallowed: the picture is already on the record, and an
 * original left behind costs storage and nothing else.
 */
export async function discardUpload(url: string): Promise<void> {
  if (!isConfigured()) return;
  try {
    await del(url);
  } catch {
    // See above.
  }
}
