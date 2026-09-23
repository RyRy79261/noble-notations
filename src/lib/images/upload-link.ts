import 'server-only';

/**
 * The server half of an upload link, shared by its two finishing routes.
 *
 * A picture reaches a link one of two ways. A person's browser writes the
 * original to the blob store and then calls `complete` with where it went.
 * An agent with a shell — Claude Code, or a sandbox that can run curl —
 * PUTs the bytes to the link itself. Both end here, in `finishUpload`, so
 * the checks and the order of writes are the same.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isDatabaseConfigured } from '@/db/client';
import { BlobNotConfigured, isConfigured as blobConfigured } from './blob';
import { ImageRejected } from './process';
import { prepareImage } from './ingest';
import type { AcceptedMimeType } from './process';
import {
  closedLinkMessage,
  completeImageUpload,
  findImageUpload,
  type ImageUploadView,
} from '@/lib/queries/uploads';
import { ConflictError, NotFoundError } from '@/lib/queries/write';

export function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

/**
 * Find an OPEN link, or the response that says why there is none. Every
 * route asks this first, so a spent link is refused before anything is
 * signed, read or processed.
 */
export async function openLink(
  token: string,
): Promise<ImageUploadView | NextResponse> {
  if (!isDatabaseConfigured() || !blobConfigured()) {
    return jsonError(404, 'Uploads are not configured on this deployment.');
  }
  const upload = await findImageUpload(token);
  if (!upload) {
    return jsonError(404, 'There is no upload link at this address.');
  }
  if (upload.state !== 'open') {
    return jsonError(410, closedLinkMessage(upload.state));
  }
  return upload;
}

export const aboutSchema = z.object({
  alt: z.string().trim().min(1).max(300),
  caption: z.string().max(500).nullish(),
});

/** Process the bytes and spend the link. Answers the route's response. */
export async function finishUpload(
  token: string,
  raw: Buffer,
  declared: AcceptedMimeType | null,
  about: { alt: string; caption: string | null },
): Promise<NextResponse> {
  try {
    const prepared = await prepareImage(raw, declared);
    const result = await completeImageUpload(token, prepared.stored, about);
    return NextResponse.json(
      {
        id: result.id,
        url: result.url,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        attachedTo: result.attachedTo,
        resized: prepared.resized,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (err) {
    // The same classes `runTool` trusts, for the same reason: each is a
    // fact the person can act on, and "internal error" is not.
    if (err instanceof ImageRejected || err instanceof BlobNotConfigured) {
      return jsonError(422, err.message);
    }
    if (err instanceof ConflictError) return jsonError(409, err.message);
    if (err instanceof NotFoundError) return jsonError(404, err.message);
    console.error('[upload] finishing an upload failed', err);
    return jsonError(500, 'The server could not store the picture.');
  }
}
