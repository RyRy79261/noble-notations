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
import { del, put } from '@vercel/blob';

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
