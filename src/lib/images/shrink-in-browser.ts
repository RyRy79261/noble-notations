'use client';

import { MAX_STORED_EDGE } from './widths';

/**
 * The largest body the upload page sends to its own server.
 *
 * A Vercel function refuses a request body over 4.5 MB before any code runs.
 * Four leaves room for the headers and for the platform counting in decimal.
 */
export const SEND_LIMIT_BYTES = 4 * 1024 * 1024;

/**
 * The file as it goes over the wire: the original when it is under the
 * limit, otherwise a JPEG made in this browser at the largest edge the store
 * keeps.
 *
 * **The original is sent whenever it fits.** The server resizes with sharp,
 * which does it better than a canvas, so a phone photograph of 2–4 MB goes
 * exactly as it was taken. Only a file over the limit is redrawn, at
 * `MAX_STORED_EDGE` on the longest side — the size of the largest copy the
 * store keeps anyway — so nothing the reader will ever see is lost.
 *
 * `createImageBitmap` applies the EXIF orientation, so a portrait photograph
 * stays upright after the redraw. A transparent PNG is drawn on white,
 * because a JPEG has no alpha.
 */
export async function shrinkForSending(
  file: File,
): Promise<{ body: Blob; type: string; shrunk: boolean }> {
  if (file.size <= SEND_LIMIT_BYTES) {
    return { body: file, type: file.type, shrunk: false };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (err) {
    throw new Error(
      'This browser cannot open that file to make it smaller. Choose a JPEG or PNG photo.',
      { cause: err },
    );
  }

  try {
    const scale = Math.min(
      1,
      MAX_STORED_EDGE / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('This browser cannot make the photo smaller.');
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);

    for (const quality of [0.92, 0.85, 0.75]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      );
      if (blob && blob.size <= SEND_LIMIT_BYTES) {
        return { body: blob, type: 'image/jpeg', shrunk: true };
      }
    }
    throw new Error(
      'The photo is still larger than 4 MB after it was made smaller. Choose another photo.',
    );
  } finally {
    bitmap.close();
  }
}
