import { NextResponse } from 'next/server';
import {
  ACCEPTED_MIME_TYPES,
  MAX_INPUT_BYTES,
  type AcceptedMimeType,
} from '@/lib/images/process';
import {
  aboutSchema,
  finishUpload,
  jsonError,
  openLink,
} from '@/lib/images/upload-link';

/**
 * The upload link, for an agent with a shell.
 *
 *   curl -X PUT --data-binary @photo.jpg \
 *     -H 'content-type: image/jpeg' \
 *     '<link as returned, with /upload/ replaced by /api/uploads/>?alt=...'
 *
 * Claude Code on a laptop, or a sandbox that can run curl, holds the file on
 * disk and can send it without the model writing a byte. This is the same
 * link the person would open, so the same one-picture, one-hour rule holds.
 *
 * **A Vercel function takes a body of at most 4.5 MB.** A file over that is
 * refused by the platform before this code runs. Shrinking it first loses
 * nothing: resize to 2400 pixels on the longest edge, which is the largest
 * copy this store keeps anyway, and a JPEG at quality 90 is then well under
 * the limit. The upload page has no such limit, because the browser writes
 * to the blob store directly.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function readCapped(request: Request): Promise<Buffer | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_INPUT_BYTES) return null;
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_INPUT_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const upload = await openLink(token);
  if (upload instanceof NextResponse) return upload;

  const query = new URL(request.url).searchParams;
  const about = aboutSchema.safeParse({
    alt: query.get('alt') ?? upload.alt ?? '',
    caption: query.get('caption') ?? upload.caption,
  });
  if (!about.success) {
    return jsonError(
      400,
      'Say what the picture shows: add ?alt=... to the address. The link ' +
        'was made without alt text.',
    );
  }

  const raw = await readCapped(request);
  if (raw === null) {
    return jsonError(
      413,
      `That file is larger than ${MAX_INPUT_BYTES / 1024 / 1024} MB.`,
    );
  }
  if (raw.length === 0) {
    return jsonError(400, 'The request carried no file. Send it as the body.');
  }

  const type = request.headers.get('content-type')?.split(';')[0]?.trim();
  const declared = (ACCEPTED_MIME_TYPES as readonly string[]).includes(
    type ?? '',
  )
    ? (type as AcceptedMimeType)
    : null;

  return finishUpload(token, raw, declared, {
    alt: about.data.alt,
    caption: about.data.caption ?? null,
  });
}
