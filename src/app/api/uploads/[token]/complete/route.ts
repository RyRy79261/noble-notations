import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  discardUpload,
  findUpload,
  readUpload,
  uploadPathname,
} from '@/lib/images/blob';
import { MAX_INPUT_BYTES } from '@/lib/images/process';
import {
  aboutSchema,
  finishUpload,
  jsonError,
  openLink,
} from '@/lib/images/upload-link';

/**
 * Step 3 of 3 on the upload page: the original is in the blob store; shrink
 * it and put it on the record.
 *
 * The browser says WHERE it wrote the file, and that claim is checked twice
 * before anything is read. The pathname must be under this link's own
 * prefix — the client token could write nowhere else, so anything outside
 * it is a page lying about its upload. And the address to read comes from
 * the store's answer to `head`, never from the browser, so this route can
 * only ever fetch an object this store holds.
 *
 * 60 seconds, as the MCP route has: `sharp` on a 12 MB photograph plus four
 * blob writes is a few seconds, and a cold function is a few more.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = aboutSchema.extend({
  pathname: z.string().min(1).max(300),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const upload = await openLink(token);
  if (upload instanceof NextResponse) return upload;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return jsonError(
      400,
      'Send the pathname the file was written to, and the alt text.',
    );
  }

  const prefix = uploadPathname(upload.id);
  if (!body.pathname.startsWith(prefix) || body.pathname.includes('..')) {
    return jsonError(400, 'That file was not uploaded through this link.');
  }

  const found = await findUpload(body.pathname);
  if (!found) {
    return jsonError(404, 'The file did not reach the store. Try again.');
  }
  if (found.size > MAX_INPUT_BYTES) {
    await discardUpload(found.url);
    return jsonError(
      422,
      `That file is larger than ${MAX_INPUT_BYTES / 1024 / 1024} MB.`,
    );
  }

  let raw: Buffer;
  try {
    raw = await readUpload(found.url, MAX_INPUT_BYTES);
  } catch (err) {
    console.error('[upload] reading an original failed', err);
    return jsonError(
      502,
      'The server could not read the file back. Try again.',
    );
  }

  const response = await finishUpload(token, raw, null, {
    alt: body.alt,
    caption: body.caption ?? null,
  });
  // The original has done its job whether the picture landed or was
  // refused. A refused one is a file nobody will ever read.
  await discardUpload(found.url);
  return response;
}
