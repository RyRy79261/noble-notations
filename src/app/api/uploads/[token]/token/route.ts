import { issueUploadToken } from '@/lib/images/blob';
import { ACCEPTED_MIME_TYPES, MAX_INPUT_BYTES } from '@/lib/images/process';
import { jsonError, openLink } from '@/lib/images/upload-link';
import { NextResponse } from 'next/server';

/**
 * Step 1 of 3 on the upload page: a client token for the blob store.
 *
 * It names one pathname, under this link's id, the four types the store
 * reads, and the size limit, and it lasts ten minutes. It does NOT spend the
 * link. A phone that loses its connection halfway through a 12 MB photograph
 * asks again; only a picture that lands spends it. See `issueUploadToken`.
 */
export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const upload = await openLink(token);
  if (upload instanceof NextResponse) return upload;

  try {
    const issued = await issueUploadToken(
      upload.id,
      MAX_INPUT_BYTES,
      ACCEPTED_MIME_TYPES,
    );
    return NextResponse.json(issued, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (err) {
    console.error('[upload] issuing a client token failed', err);
    return jsonError(500, 'The server could not prepare the upload.');
  }
}
