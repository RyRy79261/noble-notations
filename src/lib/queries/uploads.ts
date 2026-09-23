import 'server-only';

/**
 * Upload links: the rows behind `request_image_upload` and `/upload/<token>`.
 *
 * Issues #56 and #58. See `image_uploads` in `src/db/schema.ts` for why a
 * link exists at all. In short: a photograph cannot pass through the model,
 * so the model hands the person a link, and the person's browser sends the
 * file.
 *
 * Three moments, three functions:
 *
 *   createImageUpload     the agent asks. The target is checked NOW, so a
 *                         person is never sent to upload a picture for a
 *                         recipe that does not exist.
 *   findImageUpload       the page opens, or the browser asks to send.
 *   completeImageUpload   the picture has been processed. Spending the link
 *                         and storing the picture are one transaction.
 */
import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { withTransaction } from '@/db/client';
import { imageUploads } from '@/db/schema';
import type { AttachToInput } from '@/lib/domain/schemas';
import {
  ConflictError,
  NotFoundError,
  probeAttachTarget,
  storeImageTx,
  type StoreImageInput,
  type StoreImageResult,
} from './write';

/**
 * How long a link lasts. An hour.
 *
 * Long enough for a person to finish cooking, find the photograph and open
 * the link. Short enough that a link pasted into a chat that somebody else
 * later reads is dead. A person who misses it asks again; a new link costs
 * one tool call.
 */
export const UPLOAD_LINK_MINUTES = 60;

export type ImageUploadState = 'open' | 'used' | 'expired';

export interface ImageUploadView {
  id: string;
  state: ImageUploadState;
  target: string;
  alt: string | null;
  caption: string | null;
  expiresAt: Date;
  imageId: string | null;
}

export function hashUploadToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Mint a link. Returns the token once; only its hash is stored.
 *
 * The target is PROBED rather than trusted: `probeAttachTarget` runs the
 * very write the finished upload will run, inside a savepoint it then rolls
 * back. So every refusal the finished upload could meet for its target — no
 * such recipe, a deleted run, step 9 of a dish with six — is met here, in
 * the tool call, where the agent can fix it. Checking with separate reads
 * would be a second copy of those rules, free to drift from the first.
 */
export async function createImageUpload(input: {
  userId: string;
  clientId: string;
  alt?: string | null;
  caption?: string | null;
  attachTo: AttachToInput;
}): Promise<{ id: string; token: string; target: string; expiresAt: Date }> {
  return withTransaction(async (tx) => {
    const target = await probeAttachTarget(tx, input.attachTo);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + UPLOAD_LINK_MINUTES * 60 * 1000);
    const inserted = await tx
      .insert(imageUploads)
      .values({
        tokenHash: hashUploadToken(token),
        userId: input.userId,
        clientId: input.clientId,
        alt: input.alt ?? null,
        caption: input.caption ?? null,
        attachTo: input.attachTo,
        target,
        expiresAt,
      })
      .returning({ id: imageUploads.id });
    return { id: inserted[0]!.id, token, target, expiresAt };
  });
}

function stateOf(row: {
  completedAt: Date | null;
  expiresAt: Date;
}): ImageUploadState {
  if (row.completedAt) return 'used';
  if (row.expiresAt.getTime() <= Date.now()) return 'expired';
  return 'open';
}

/** Look a link up by the token in its address. Null when there is none. */
export async function findImageUpload(
  token: string,
): Promise<ImageUploadView | null> {
  return withTransaction(async (tx) => {
    const rows = await tx
      .select()
      .from(imageUploads)
      .where(eq(imageUploads.tokenHash, hashUploadToken(token)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      state: stateOf(row),
      target: row.target,
      alt: row.alt,
      caption: row.caption,
      expiresAt: row.expiresAt,
      imageId: row.imageId,
    };
  });
}

/** The sentence a spent or expired link answers with, everywhere. */
export function closedLinkMessage(state: Exclude<ImageUploadState, 'open'>) {
  return state === 'used'
    ? 'This link has already been used. One link takes one picture. Ask ' +
        'Claude for a new link to add another.'
    : 'This link has expired. A link lasts one hour. Ask Claude for a new ' +
        'one.';
}

/**
 * Spend the link and store the picture, in one commit.
 *
 * The row is locked FOR UPDATE first, so two tabs finishing at once cannot
 * both store: the second waits, then reads `completed_at` and is refused.
 * The blobs are already written by then — see `prepareImage` — and a refused
 * second picture leaves objects no row names, which is the safe way round.
 */
export async function completeImageUpload(
  token: string,
  prepared: Omit<StoreImageInput, 'alt' | 'caption' | 'attachTo'>,
  about: { alt: string; caption: string | null },
): Promise<StoreImageResult> {
  return withTransaction(async (tx) => {
    const rows = await tx
      .select()
      .from(imageUploads)
      .where(eq(imageUploads.tokenHash, hashUploadToken(token)))
      .for('update')
      .limit(1);
    const row = rows[0];
    if (!row)
      throw new NotFoundError('There is no upload link at this address.');
    const state = stateOf(row);
    if (state !== 'open') throw new ConflictError(closedLinkMessage(state));

    const result = await storeImageTx(tx, {
      ...prepared,
      alt: about.alt,
      caption: about.caption,
      attachTo: row.attachTo as AttachToInput,
    });

    await tx
      .update(imageUploads)
      .set({ completedAt: sql`now()`, imageId: result.id })
      .where(eq(imageUploads.id, row.id));

    return result;
  });
}
