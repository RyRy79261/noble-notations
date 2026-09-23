import 'server-only';

/**
 * Bytes in, a stored picture out. The one pipeline every way in shares.
 *
 * There are three ways a picture reaches this store now: base64 inside
 * `upload_image`, a web address `upload_image` fetches itself, and the file a
 * person picks on an upload link. They differ only in where the bytes come
 * from. Everything after that — the checks, the resize, the smaller copies,
 * the blob writes and their order — is here, so the three cannot drift into
 * three slightly different pictures of the same photograph.
 */
import { processImage, type AcceptedMimeType } from './process';
import { putImage, putRenditions } from './blob';
import type { StoreImageInput } from '@/lib/queries/write';
import type { AttachToInput } from '@/lib/domain/schemas';

export interface PreparedImage {
  /** Everything `storeImage` needs except what the caller says about it. */
  stored: Omit<StoreImageInput, 'alt' | 'caption' | 'attachTo'>;
  /** True when the picture was bigger than the largest stored copy. */
  resized: boolean;
}

/**
 * Check, shrink, and write to the blob store. Writes no row.
 *
 * THE BLOBS ARE WRITTEN BEFORE THE ROW, and the order is the only one that
 * fails safely. A row naming a blob that was never written is a picture that
 * 404s for good; a blob with no row is an object nobody can reach, which
 * costs storage and nothing else. The checksum makes the second case
 * self-healing: the next upload of the same bytes lands the row then.
 */
export async function prepareImage(
  raw: Buffer,
  declaredMimeType: AcceptedMimeType | null,
): Promise<PreparedImage> {
  const processed = await processImage(raw, declaredMimeType);
  const [stored, renditions] = await Promise.all([
    putImage(processed.data, processed.checksum),
    putRenditions(processed.renditions, processed.checksum),
  ]);
  return {
    stored: {
      blobUrl: stored.url,
      blobPathname: stored.pathname,
      mimeType: processed.mimeType,
      width: processed.width,
      height: processed.height,
      bytes: processed.bytes,
      checksum: processed.checksum,
      renditions,
    },
    resized: processed.resized,
  };
}

/** What the caller says about a prepared picture, joined to it. */
export function storeInput(
  prepared: PreparedImage,
  about: {
    alt: string;
    caption?: string | null;
    attachTo?: AttachToInput;
  },
): StoreImageInput {
  return { ...prepared.stored, ...about };
}
