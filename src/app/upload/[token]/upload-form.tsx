'use client';

import { useEffect, useId, useState } from 'react';

import { cn } from '@/lib/utils';
import { buttonClasses, FOCUS_RING } from '@/components/f/button';
import { shrinkForSending } from '@/lib/images/shrink-in-browser';

/**
 * The file picker behind an upload link.
 *
 * ONE REQUEST, TO THIS SITE:
 *
 *   PUT /api/uploads/<token>?alt=...   the photo; the server shrinks it,
 *                                      stores it and puts it on the record
 *
 * **WHY NOT STRAIGHT TO THE BLOB STORE.** The first version sent the file
 * from the browser to Vercel Blob's API with a client token, to get past
 * the 4.5 MB body limit of a Vercel function. From a phone in production
 * that request never landed: first it froze at "Sending… 0%", then, with
 * the freeze fixed, the browser refused it outright with "Failed to fetch"
 * in under a second, twice. That is a cross-origin request the browser
 * would not make, and nothing in this repository can prove or fix what
 * another origin answers to a preflight. A request to this page's own
 * origin has no preflight, no CORS and no `connect-src` to get wrong.
 *
 * The body limit is handled here instead: a photo over 4 MB is redrawn in
 * the browser at 2400 pixels on its longest edge, the size of the largest
 * copy the store keeps, so nothing a reader sees is lost. A photo under
 * 4 MB — most phone photos — is sent exactly as taken. See
 * `shrink-in-browser.ts`.
 *
 * `accept` lists the four types the store reads and NOT `image/*`. That is
 * what makes an iPhone hand over a JPEG: Safari converts a HEIC photograph
 * when the page does not say it takes HEIC, and the server cannot decode
 * HEIC.
 *
 * **A FAILURE IS SHOWN, AND REPORTED.** A watchdog aborts a request that
 * never answers. The person sees the error and a "Try again" button — the
 * link is not spent until a picture lands — and the error text goes to
 * `/api/uploads/<token>/report`, so a failure is in the runtime logs rather
 * than only on somebody's phone.
 */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';

/**
 * How long the PUT may take before the page gives up. A 4 MB body over a
 * poor 1 Mbit/s mobile connection takes about 35 seconds, and the server
 * then resizes it; three minutes leaves room and still ends a request that
 * is never going to answer.
 */
const SEND_TIMEOUT_MS = 3 * 60 * 1000;

type Phase =
  | { kind: 'idle' }
  | { kind: 'sending'; startedAt: number }
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

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Seconds since `startedAt`, redrawn once a second while it matters. */
function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt === null
    ? 0
    : Math.max(0, Math.floor((now - startedAt) / 1000));
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

  const busy = phase.kind === 'sending';
  const elapsed = useElapsed(busy ? phase.startedAt : null);
  const tooBig = file ? file.size > maxBytes : false;
  const missingAlt = alt.trim().length === 0;
  const ready = Boolean(file) && !tooBig && !missingAlt && !busy;

  async function report(stage: string, message: string) {
    try {
      await fetch(`/api/uploads/${token}/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage,
          message: message.slice(0, 1000),
          fileBytes: file?.size ?? null,
          fileType: file?.type ?? null,
        }),
      });
    } catch {
      // A report that cannot be sent changes nothing for the person.
    }
  }

  async function send() {
    if (!file || !ready) return;
    let stage = 'shrink';
    const abort = new AbortController();
    const watchdog = setTimeout(() => abort.abort(), SEND_TIMEOUT_MS);
    try {
      setPhase({ kind: 'sending', startedAt: Date.now() });
      const { body, type } = await shrinkForSending(file);

      stage = 'send';
      const query = new URLSearchParams({ alt: alt.trim() });
      if (caption) query.set('caption', caption);
      let response: Response;
      try {
        response = await fetch(`/api/uploads/${token}?${query}`, {
          method: 'PUT',
          headers: type ? { 'content-type': type } : {},
          body,
          signal: abort.signal,
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(
          abort.signal.aborted
            ? `The photo did not finish sending in ${SEND_TIMEOUT_MS / 60000} minutes. Check the connection and try again.`
            : `The photo could not be sent: ${detail}`,
          { cause: err },
        );
      }

      stage = 'complete';
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as {
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
      const message = err instanceof Error ? err.message : String(err);
      setPhase({ kind: 'failed', message });
      void report(stage, message);
    } finally {
      clearTimeout(watchdog);
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
      {/* THE PICKER IS A BUTTON-SIZED LABEL, NOT THE NATIVE CONTROL. The
          native one draws a small "Choose File" in the browser's own type,
          and on a phone it did not read as the first thing to press — the
          person pressed "Upload" instead. The input stays in the DOM, hidden
          from sight only, so the label opens it and a screen reader still
          announces it. */}
      <input
        id={fileId}
        name="file"
        type="file"
        accept={ACCEPT}
        disabled={busy}
        className="sr-only"
        onChange={(event) => {
          setPhase({ kind: 'idle' });
          setFile(event.target.files?.[0] ?? null);
        }}
      />

      {!file ? (
        <label
          htmlFor={fileId}
          data-upload-pick=""
          className={cn(
            'flex w-full cursor-pointer flex-col items-center justify-center gap-2',
            'border border-dashed border-ink-3 bg-desk px-4 py-10 text-center',
            FOCUS_RING,
          )}
        >
          <span className="text-15 leading-150 font-serif text-ink">
            Choose a photo
          </span>
          <span className="text-12 leading-150 text-ink-3">
            From this device. Up to {megabytes(maxBytes)}.
          </span>
        </label>
      ) : (
        <div className="flex w-full flex-col items-start gap-2">
          {preview ? (
            // A local object URL of the file just picked. The optimiser
            // cannot read one, and the point is to show exactly what will be
            // sent.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              data-upload-preview=""
              className="h-auto max-h-96 w-full object-contain"
            />
          ) : null}
          <div className="flex w-full flex-row items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-12 leading-150 font-mono text-ink-3">
              {file.name} · {megabytes(file.size)}
            </span>
            {!busy ? (
              <label
                htmlFor={fileId}
                className={cn(
                  'shrink-0 cursor-pointer text-12 leading-150 text-ink underline',
                  FOCUS_RING,
                )}
              >
                Choose another
              </label>
            ) : null}
          </div>
          {tooBig ? (
            <p role="alert" className="m-0 text-12 leading-150 text-warn">
              That file is {megabytes(file.size)}. The limit is{' '}
              {megabytes(maxBytes)}.
            </p>
          ) : null}
        </div>
      )}

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

      {busy ? (
        <div
          role="status"
          data-upload-status=""
          className="flex w-full flex-col items-start gap-1 bg-desk px-4 py-3"
        >
          <p className="m-0 text-15 leading-150 font-serif text-ink">
            Sending the photo and saving it…
          </p>
          <p className="m-0 text-12 leading-150 font-mono text-ink-3">
            {elapsed} s. Keep this page open.
          </p>
        </div>
      ) : null}

      {phase.kind === 'failed' ? (
        <div
          role="alert"
          data-upload-error=""
          className="flex w-full flex-col items-start gap-1 bg-warn-wash px-4 py-3"
        >
          <p className="m-0 text-15 leading-150 font-serif text-ink">
            The upload did not work.
          </p>
          <p className="m-0 text-12 leading-150 text-ink-2">{phase.message}</p>
          <p className="m-0 text-12 leading-150 text-ink-3">
            The link is not used up. Press the button to try again.
          </p>
        </div>
      ) : null}

      {file && !busy ? (
        <>
          <button
            type="submit"
            disabled={!ready}
            className={buttonClasses(
              'primary',
              'w-full shell:w-fit disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            {phase.kind === 'failed' ? 'Try again' : 'Upload'}
          </button>
          {missingAlt ? (
            <p className="m-0 text-12 leading-150 text-ink-3">
              Write what the picture shows, then press Upload.
            </p>
          ) : null}
        </>
      ) : null}
    </form>
  );
}
