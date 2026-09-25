'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { usePathname } from 'next/navigation';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { buttonClasses, FOCUS_RING } from '@/components/f/button';
import { installErrorCapture, recentErrors } from '@/lib/client-errors';
import { reportablePath } from '@/lib/report-path';
import {
  motionPermissionNeeded,
  requestMotionPermission,
  useShakeGesture,
} from '@/lib/shake';
import { cn } from '@/lib/utils';

/**
 * Shake the phone to report a problem. Ported from Intake Tracker.
 *
 * Mounted once, in the root layout, and inert for almost everybody. It asks
 * `GET /api/report` whether this visitor may file — signed in as the owner,
 * with `GITHUB_ISSUE_TOKEN` set — and listens for a shake only when the
 * answer is yes. A reader who shakes a phone on a recipe page sees nothing,
 * and no reader can write an issue under the owner's token. The question is
 * asked from the browser, not answered in the layout, because reading the
 * session in the root layout would make every page on the site dynamic.
 *
 * `?report=1` on any address opens the sheet by hand, for a desk with no
 * accelerometer.
 *
 * iOS sends no motion events until the page asks, and it may only ask inside
 * a tap, so the first tap anywhere asks once. Android needs nothing.
 */

const OFF_KEY = 'nn:shake-to-report:off';

type Kind = 'bug' | 'idea';

type State =
  | { kind: 'form' }
  | { kind: 'sending' }
  | { kind: 'filed'; number: number; url: string }
  | { kind: 'failed'; message: string; signIn: boolean };

function readOff(): boolean {
  try {
    return window.localStorage.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
}

function environment(): { label: string; value: string }[] {
  return [
    { label: 'Browser', value: navigator.userAgent },
    {
      label: 'Screen',
      value: `${window.screen.width}×${window.screen.height} @ ${window.devicePixelRatio}x`,
    },
    { label: 'Viewport', value: `${window.innerWidth}×${window.innerHeight}` },
    { label: 'Online', value: navigator.onLine ? 'yes' : 'no' },
    { label: 'Time', value: new Date().toISOString() },
  ];
}

export function ShakeToReport() {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);
  const [off, setOff] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    installErrorCapture();
    setOff(readOff());
    let cancelled = false;
    fetch('/api/report', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((body: { enabled?: boolean }) => {
        if (!cancelled) setAllowed(Boolean(body.enabled));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!allowed) return;
    if (new URLSearchParams(window.location.search).get('report') === '1') {
      setOpen(true);
    }
  }, [allowed, pathname]);

  useEffect(() => {
    if (!allowed || off || !motionPermissionNeeded()) return;
    const ask = () => void requestMotionPermission();
    window.addEventListener('pointerdown', ask, { once: true });
    return () => window.removeEventListener('pointerdown', ask);
  }, [allowed, off]);

  const onShake = useCallback(() => setOpen(true), []);
  useShakeGesture({ enabled: allowed && !off && !open, onShake });

  if (!allowed) return null;

  return (
    <ReportSheet
      open={open}
      onOpenChange={setOpen}
      shakeOff={off}
      onShakeOffChange={(value) => {
        setOff(value);
        try {
          window.localStorage.setItem(OFF_KEY, value ? '1' : '0');
        } catch {
          // A setting that cannot be saved lasts for this tab only.
        }
      }}
    />
  );
}

function ReportSheet({
  open,
  onOpenChange,
  shakeOff,
  onShakeOffChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shakeOff: boolean;
  onShakeOffChange: (off: boolean) => void;
}) {
  const textId = useId();
  const offId = useId();
  const [kind, setKind] = useState<Kind>('bug');
  const [text, setText] = useState('');
  const [state, setState] = useState<State>({ kind: 'form' });
  const [page, setPage] = useState('');
  const [errors, setErrors] = useState(recentErrors);

  // A fresh sheet on each opening, with the address and the errors as they
  // are NOW — the moment of the shake is the moment the report is about.
  useEffect(() => {
    if (!open) return;
    setKind('bug');
    setText('');
    setState({ kind: 'form' });
    setPage(reportablePath(window.location.pathname, window.location.search));
    setErrors(recentErrors());
  }, [open]);

  async function send() {
    if (!text.trim()) return;
    setState({ kind: 'sending' });
    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          description: text.trim(),
          page,
          environment: environment(),
          errors,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        number?: number;
        url?: string;
        error?: string;
        signIn?: boolean;
      };
      if (!response.ok || !body.number || !body.url) {
        setState({
          kind: 'failed',
          message: body.error ?? `The server answered ${response.status}.`,
          signIn: Boolean(body.signIn),
        });
        return;
      }
      setState({ kind: 'filed', number: body.number, url: body.url });
    } catch (err) {
      setState({
        kind: 'failed',
        message: err instanceof Error ? err.message : String(err),
        signIn: false,
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-report-sheet=""
        className="max-h-[90vh] px-4 pt-5 pb-6 shell:px-15"
      >
        <div className="mx-auto flex w-full flex-col items-start gap-4 shell:w-155">
          <SheetTitle className="m-0 pr-10 text-24 leading-115 font-serif text-ink">
            {state.kind === 'filed'
              ? 'Report sent'
              : kind === 'bug'
                ? 'Report a problem'
                : 'Suggest an idea'}
          </SheetTitle>
          <SheetDescription className="m-0 text-13 leading-150 text-ink-3">
            {state.kind === 'filed'
              ? `It is issue #${state.number} on GitHub.`
              : 'This makes a GitHub issue. The page address, the browser and recent page errors go with it.'}
          </SheetDescription>

          {state.kind === 'filed' ? (
            <>
              <a
                href={state.url}
                target="_blank"
                rel="noopener noreferrer"
                data-report-link=""
                className={cn('text-15 text-ink underline', FOCUS_RING)}
              >
                Open issue #{state.number}
              </a>
              <button
                type="button"
                className={buttonClasses('primary', 'w-full shell:w-fit')}
                onClick={() => onOpenChange(false)}
              >
                Done
              </button>
            </>
          ) : (
            <form
              className="flex w-full flex-col items-start gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <div
                role="radiogroup"
                aria-label="Kind of report"
                className="flex w-full flex-row gap-2"
              >
                {(['bug', 'idea'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => setKind(k)}
                    className={buttonClasses(
                      kind === k ? 'primary' : 'quiet',
                      'flex-1',
                    )}
                  >
                    {k === 'bug' ? 'Problem' : 'Idea'}
                  </button>
                ))}
              </div>

              <div className="flex w-full flex-col gap-2">
                <label
                  htmlFor={textId}
                  className="text-09 leading-normal font-mono tracking-label uppercase text-ink-3"
                >
                  {kind === 'bug' ? 'What went wrong?' : 'What do you want?'}
                </label>
                <textarea
                  id={textId}
                  rows={5}
                  maxLength={5000}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={
                    kind === 'bug'
                      ? 'What you did, what you expected, and what happened.'
                      : 'The change you want, and why.'
                  }
                  className={cn(
                    'w-full resize-y border border-hair bg-paper px-3 py-2 text-15 leading-150 font-serif text-ink',
                    FOCUS_RING,
                  )}
                />
              </div>

              <details className="w-full text-12 leading-150 text-ink-3">
                <summary className={cn('cursor-pointer', FOCUS_RING)}>
                  What goes with it ({errors.length} page error
                  {errors.length === 1 ? '' : 's'})
                </summary>
                <div className="mt-2 flex flex-col gap-1 font-mono break-all">
                  <span>Page: {page}</span>
                  {errors.map((e, i) => (
                    <span key={i}>
                      {e.kind}: {e.message}
                    </span>
                  ))}
                  <span>
                    The browser, the screen size and the deployed commit go too.
                    Values that look like passwords or keys are removed.
                  </span>
                </div>
              </details>

              {state.kind === 'failed' ? (
                <div
                  role="alert"
                  data-report-error=""
                  className="flex w-full flex-col gap-1 bg-warn-wash px-4 py-3 text-13 leading-150 text-ink"
                >
                  <span>{state.message}</span>
                  {state.signIn ? (
                    <a
                      href={`/sign-in?callbackURL=${encodeURIComponent(page)}`}
                      className={cn('underline', FOCUS_RING)}
                    >
                      Sign in
                    </a>
                  ) : null}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!text.trim() || state.kind === 'sending'}
                className={buttonClasses(
                  'primary',
                  'w-full shell:w-fit disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                {state.kind === 'sending' ? 'Sending…' : 'Send report'}
              </button>

              <label
                htmlFor={offId}
                className="flex flex-row items-center gap-2 text-12 leading-150 text-ink-3"
              >
                <input
                  id={offId}
                  type="checkbox"
                  checked={shakeOff}
                  onChange={(event) => onShakeOffChange(event.target.checked)}
                />
                Do not open this when I shake the phone. Add ?report=1 to an
                address to open it.
              </label>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
