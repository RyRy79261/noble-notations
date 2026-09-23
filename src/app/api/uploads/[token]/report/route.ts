import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isDatabaseConfigured } from '@/db/client';
import { findImageUpload } from '@/lib/queries/uploads';

/**
 * Where the upload page says a step failed. It writes one log line and
 * nothing else.
 *
 * The first real upload froze on a phone and left no trace: the browser's
 * PUT to the blob store never reaches this app, so the runtime logs showed
 * the token being issued and then silence. A failure the person can see is
 * half the fix; this is the other half, so the next one arrives with its
 * error text instead of a screenshot.
 *
 * Only a token that names a link is heard, spent or not, so this cannot be
 * used to write arbitrary lines into the logs. The token itself is not
 * logged — only the link's id.
 */
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  stage: z.enum(['token', 'send', 'complete']),
  message: z.string().max(1000),
  fileBytes: z.number().int().nonnegative().nullable().optional(),
  fileType: z.string().max(100).nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!isDatabaseConfigured()) return new NextResponse(null, { status: 204 });
  const upload = await findImageUpload(token);
  if (!upload) return new NextResponse(null, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  console.error('[upload] the page reported a failure', {
    uploadId: upload.id,
    state: upload.state,
    ...parsed.data,
    userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
  });
  return new NextResponse(null, { status: 204 });
}
