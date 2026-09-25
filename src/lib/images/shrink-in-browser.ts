'use client';

import { MAX_STORED_EDGE } from './widths';

/**
 * The largest body the upload page sends to its own server.
 *
 * A Vercel function refuses a request body over 4.5 MB before any code runs.
 * Four leaves room for the headers and for the platform counting in decimal.
 */
export const SEND_LIMIT_BYTES = 4 * 1024 * 1024;

/** Read in slices this size, so a failure names the offset it failed at. */
const SLICE_BYTES = 1024 * 1024;

/** A picked file the browser would not read, with where it stopped. */
export class FileReadError extends Error {
  constructor(
    message: string,
    readonly errorName: string,
    readonly offset: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * The whole picked file as bytes, read the moment it is picked.
 *
 * **WHY THIS CAN FAIL, AND WHY THE ACCEPT LIST MATTERS.** Chrome on Android
 * 13 and later opens the system Photo Picker whenever every type in the
 * input's `accept` starts with `image/` (`SelectFileDialog.java`,
 * `isSupportedPhotoPickerTypes`). The picker hands Chrome a proxy
 * (`content://media/picker_get_content/…`, display name `<media id>.jpg`)
 * whose size comes from the picker's database, not from the bytes. When the
 * two disagree, every read of that file fails in Chrome's blob reader with
 * `NotReadableError` — the preview, a `fetch` body and `arrayBuffer()`
 * alike. That is what happened to every upload from the phone: no preview,
 * "Failed to fetch", then NotReadableError. `upload-form.tsx` keeps Chrome on
 * Android out of that picker; this function is what tells the person, at
 * once, when a file still cannot be read, and reports the offset so the
 * logs say whether the size was stale (a late slice fails) or the file was
 * missing (offset 0 fails).
 */
export async function readPickedFile(file: File): Promise<ArrayBuffer> {
  const out = new Uint8Array(file.size);
  let offset = 0;
  try {
    while (offset < file.size) {
      const chunk = new Uint8Array(
        await file.slice(offset, offset + SLICE_BYTES).arrayBuffer(),
      );
      if (chunk.byteLength === 0) {
        throw new DOMException(
          'the read returned no bytes',
          'NotReadableError',
        );
      }
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    throw new FileReadError(
      `This phone did not let the page read the photo (${name}).`,
      name,
      offset,
      { cause: err },
    );
  }
  return out.buffer;
}

/**
 * The bytes as they go over the wire: as picked when they fit under the
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
export async function prepareForSending(
  bytes: ArrayBuffer,
  pickedType: string,
): Promise<{ body: ArrayBuffer | Blob; type: string; shrunk: boolean }> {
  const type = pickedType || 'image/jpeg';
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
