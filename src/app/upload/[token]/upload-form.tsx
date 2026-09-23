'use client';

import { useEffect, useId, useState } from 'react';
import { put } from '@vercel/blob/client';

import { cn } from '@/lib/utils';
import { buttonClasses, FOCUS_RING } from '@/components/f/button';

/**
 * The file picker behind an upload link.
 *
 * Three requests, in this order, and the order is the design:
 *
 *   1. POST /api/uploads/<token>/token      a client token for ONE pathname
 *   2. PUT  <the blob store>                the original file, from here
 *   3. POST /api/uploads/<token>/complete   shrink it and put it on the record
 *
 * The file goes to the blob store directly because a Vercel function refuses
 * a body over 4.5 MB, and a phone photograph is often more. Only the server
 * can sign the token, and only the server decides what the stored picture
 * is — the browser moves the bytes and nothing else.
 *
 * `accept` lists the four types the store reads and NOT `image/*`. That is
 * what makes an iPhone hand over a JPEG: Safari converts a HEIC photograph
 * when the page does not say it takes HEIC, and the server cannot decode
 * HEIC.
 */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';

/**
 * Whether the SDK may report progress. With `onUploadProgress` it sends the
 * file as a STREAMED request body, and Chrome streams a body only over
 * HTTP/2, which a browser speaks only over TLS. The real store is https, so
 * production shows a percentage. The e2e stub is plain http, and there a
 * streamed body fails with ERR_ALPN_NEGOTIATION_FAILED and the SDK retries
 * forever — so against an http store the file goes as one ordinary request
 * and the button says "Sending…" without a number.
 */
const CAN_STREAM = !(process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL ?? '')
  .trim()
  .startsWith('http:');

type Phase =
  | { kind: 'idle' }
  | { kind: 'sending'; percent: number | null }
  | { kind: 'processing' }
  | { kind: 'done'; width: number; height: number; target: string }
  | { kind: 'failed'; message: string };

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // Fall through to the status line.
  }
  return `The server answered ${response.status}.`;
}

export function UploadForm({
  token,
  target,
  initialAlt,
  caption,
  maxBytes,
}: {
  token: string;
  target: string;
  initialAlt: string;
  caption: string | null;
  maxBytes: number;
}) {
  const fileId = useId();
  const altId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [alt, setAlt] = useState(initialAlt);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const busy = phase.kind === 'sending' || phase.kind === 'processing';
  const tooBig = file ? file.size > maxBytes : false;
  const ready = Boolean(file) && !tooBig && alt.trim().length > 0 && !busy;

  async function send() {
    if (!file || !ready) return;
    try {
      setPhase({ kind: 'sending', percent: CAN_STREAM ? 0 : null });

      const tokenResponse = await fetch(`/api/uploads/${token}/token`, {
        method: 'POST',
      });
      if (!tokenResponse.ok) throw new Error(await readError(tokenResponse));
      const { clientToken, pathname } = (await tokenResponse.json()) as {
        clientToken: string;
        pathname: string;
      };

      const blob = await put(pathname, file, {
        access: 'public',
        token: clientToken,
        contentType: file.type || undefined,
        ...(CAN_STREAM
          ? {
              onUploadProgress: ({ percentage }: { percentage: number }) =>
                setPhase({ kind: 'sending', percent: Math.round(percentage) }),
            }
          : {}),
      });

      setPhase({ kind: 'processing' });
      const done = await fetch(`/api/uploads/${token}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pathname: blob.pathname,
          alt: alt.trim(),
          caption,
        }),
      });
      if (!done.ok) throw new Error(await readError(done));
      const result = (await done.json()) as {
        width: number;
        height: number;
        attachedTo: string | null;
      };
      setPhase({
        kind: 'done',
        width: result.width,
        height: result.height,
        target: result.attachedTo ?? target,
      });
    } catch (err) {
      setPhase({
        kind: 'failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (phase.kind === 'done') {
    return (
      <div
        data-upload-done=""
        role="status"
        className="flex w-full flex-col items-start gap-3 bg-desk px-4 py-3 shell:px-5 shell:py-4.5"
      >
        <p className="m-0 text-15 leading-150 font-serif text-ink">
          Done. The picture is now {phase.target}.
        </p>
        <p className="m-0 text-12 leading-150 font-mono text-ink-3">
          Stored at {phase.width} × {phase.height}. Go back to Claude and say it
          is done.
        </p>
      </div>
    );
  }

  return (
    <form
      data-upload-form=""
      className="flex w-full flex-col items-start gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <div className="flex w-full flex-col items-start gap-2">
        <label
          htmlFor={fileId}
          className="text-09 leading-normal font-mono tracking-label uppercase text-ink-3"
        >
          Photograph
        </label>
        <input
          id={fileId}
          name="file"
          type="file"
          accept={ACCEPT}
          disabled={busy}
          onChange={(event) => {
            setPhase({ kind: 'idle' });
            setFile(event.target.files?.[0] ?? null);
          }}
          className={cn(
            'w-full text-12 leading-150 font-mono text-ink',
            FOCUS_RING,
          )}
        />
        {tooBig ? (
          <p role="alert" className="m-0 text-12 leading-150 text-warn">
            That file is {(file!.size / 1024 / 1024).toFixed(1)} MB. The limit
            is {maxBytes / 1024 / 1024} MB.
          </p>
        ) : null}
      </div>

      {preview ? (
        // A local object URL of the file just picked. The optimiser cannot
        // read one, and the point is to show exactly what will be sent.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt=""
          data-upload-preview=""
          className="h-auto max-h-96 w-full object-contain"
        />
      ) : null}

      <div className="flex w-full flex-col items-start gap-2">
        <label
          htmlFor={altId}
          className="text-09 leading-normal font-mono tracking-label uppercase text-ink-3"
        >
          What the picture shows
        </label>
        <textarea
          id={altId}
          name="alt"
          required
          maxLength={300}
          rows={2}
          value={alt}
          disabled={busy}
          onChange={(event) => setAlt(event.target.value)}
          placeholder="Sliced biltong, dark red with a white fat seam"
          className={cn(
            'w-full resize-y border border-hair bg-paper px-3 py-2 text-15 leading-150 font-serif text-ink',
            FOCUS_RING,
          )}
        />
        <p className="m-0 text-12 leading-150 text-ink-3">
          For a reader who cannot see it. Describe the food, not the photo.
        </p>
      </div>

      {phase.kind === 'failed' ? (
        <p
          role="alert"
          data-upload-error=""
          className="m-0 text-12 leading-150 text-warn"
        >
          {phase.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!ready}
        className={buttonClasses('primary', 'w-full shell:w-fit')}
      >
        {phase.kind === 'sending'
          ? phase.percent === null
            ? 'Sending…'
            : `Sending… ${phase.percent}%`
          : phase.kind === 'processing'
            ? 'Making it smaller…'
            : 'Upload'}
      </button>
    </form>
  );
}
