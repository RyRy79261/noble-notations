'use client';

import { MAX_STORED_EDGE } from './widths';

/**
 * The largest body the upload page sends to its own server.
 *
 * A Vercel function refuses a request body over 4.5 MB before any code runs.
 * Four leaves room for the headers and for the platform counting in decimal.
 */
export const SEND_LIMIT_BYTES = 4 * 1024 * 1024;

/** The whole file as bytes, or an error that names what the phone refused. */
export class FileReadError extends Error {}

async function readIntoMemory(file: File): Promise<ArrayBuffer> {
  try {
    return await file.arrayBuffer();
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    throw new FileReadError(
      `This phone did not let the page read the photo (${name}). Choose it again. If that fails, save a copy of the photo to the phone and choose the copy.`,
      { cause: err },
    );
  }
}

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
 * **THE FILE IS READ INTO MEMORY FIRST, and that is the fix for the phone.**
 * A `File` from the picker on Android is a reference to a gallery item, not
 * bytes. Chrome reads it only when the request streams the body, and if the
 * gallery reports a size or modified time different from the one it gave the
 * picker, Chrome cancels the request before it leaves the phone
 * (`net::ERR_UPLOAD_FILE_CHANGED`). The page sees only "Failed to fetch", the
 * server sees nothing — which is exactly what the production logs showed
 * for a 2.5 MB JPEG, every try, whether the PUT went to Vercel Blob or to
 * this site. An `ArrayBuffer` is not a file reference and cannot change, and
 * a read that fails here fails with a message that says so.
 *
 * `createImageBitmap` applies the EXIF orientation, so a portrait photograph
 * stays upright after the redraw. A transparent PNG is drawn on white,
 * because a JPEG has no alpha.
 */
export async function shrinkForSending(
  file: File,
): Promise<{ body: ArrayBuffer | Blob; type: string; shrunk: boolean }> {
  const bytes = await readIntoMemory(file);
  const type = file.type || 'image/jpeg';
  if (bytes.byteLength <= SEND_LIMIT_BYTES) {
    return { body: bytes, type, shrunk: false };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type }), {
      imageOrientation: 'from-image',
    });
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
