'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { announce, useAnnounce } from '@/lib/announce';
import { cn } from '@/lib/utils';

import { FOCUS_RING } from './f/button';

/**
 * Cooking from the page: steps you cross out, timers with an alarm, and a
 * cooking mode that keeps the screen on.
 *
 * ── STEPS ────────────────────────────────────────────────────────────────
 *
 * A tap on a step crosses it out. It is how a cook works through the mise
 * en place and then the method without losing their place. The state is
 * saved per REVISION, for the reason `ingredient-checklist.tsx` gives for
 * its ticks: a step that exists in revision 4 is not the same step in
 * revision 5, and must not arrive crossed out.
 *
 * ── TIMERS ───────────────────────────────────────────────────────────────
 *
 * Every step that records a time can start a timer. There is no upper
 * limit: a cure of two days is a timer too. A timer is stored as the moment
 * it ENDS, never as a count that goes down, so it survives a reload, a tab
 * in the background and a phone that throttles the page. A timer of two
 * days that ended while the page was closed rings when the page opens.
 *
 * A range (20–30 min) runs to its lower end. That is the first time to
 * check the food.
 *
 * The alarm is a Web Audio tone, so no sound file is served. A browser only
 * plays sound after a gesture, so the tap that starts a timer also unlocks
 * the audio. A vibration and a system notification go with the tone where
 * the browser allows them. The alarm rings until somebody stops it.
 *
 * What a website cannot do: ring on a locked phone. iOS Safari stops a page
 * in the background. Cooking mode keeps the screen on, which keeps the page
 * in front, and that is the reliable way to hear the alarm.
 *
 * ── COOKING MODE ─────────────────────────────────────────────────────────
 *
 * One button in the control bar. It holds a screen wake lock and sets the
 * step text larger. It is not saved: like the batch size (R-STO-07), it is
 * a choice for this visit, and a screen that stays on by default is a
 * battery that goes flat by default.
 *
 * Everything that changes is state in this file, so the steps themselves
 * stay server components and only their shell is client code.
 */

/* ── Shared constants ──────────────────────────────────────────────────── */

const RESET = 'appearance-none rounded-none border-0 m-0';

/** The bare mono text control — CLEAR, STOP, START TIMER. */
const TEXT_CONTROL = cn(
  RESET,
  'cursor-pointer bg-transparent p-0 text-09 font-mono tracking-label uppercase',
  'text-accent underline decoration-1 underline-offset-2',
  FOCUS_RING,
);

type Timer = {
  /** Epoch milliseconds at which the timer rings. */
  endsAt: number;
  /** What the timer is for, in words: `Step 4`. */
  label: string;
};

type Timers = Record<string, Timer>;

type CookingState = {
  ready: boolean;
  done: ReadonlySet<string>;
  toggleDone: (stepId: string) => void;
  clearDone: () => void;
  timers: Timers;
  now: number;
  startTimer: (stepId: string, minutes: number, label: string) => void;
  stopTimer: (stepId: string) => void;
  cooking: boolean;
  setCooking: (on: boolean) => void;
  /** True while the browser holds the screen on for us. */
  screenOn: boolean;
};

const CookingContext = createContext<CookingState | null>(null);

function useCooking(): CookingState {
  const value = useContext(CookingContext);
  if (!value) throw new Error('useCooking needs a CookingProvider above it.');
  return value;
}

/* ── Storage ───────────────────────────────────────────────────────────── */

/**
 * A JSON value in localStorage, read after mount, written on change and
 * kept in step with other tabs.
 *
 * The same three rules `ingredient-checklist.tsx` follows (R-STO-01 to 03).
 * The equality check on the `storage` event is load-bearing for the same
 * reason too: without it two tabs write one value at each other forever.
 */
function useStored<T>(
  key: string,
  initial: T,
  parse: (raw: unknown) => T,
): [T, (update: (previous: T) => T) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const serialised = useRef<string | null>(null);

  const read = useCallback((): T | null => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? parse(JSON.parse(raw)) : null;
    } catch {
      // Private mode, blocked storage, corrupt JSON: the empty state is a
      // good fallback.
      return null;
    }
    // `parse` is a module-level function at every call site.
  }, [key]);

  useEffect(() => {
    const stored = read();
    if (stored !== null) setValue(stored);
    setReady(true);
  }, [read]);

  useEffect(() => {
    if (!ready) return;
    const next = JSON.stringify(value);
    if (next === serialised.current) return;
    serialised.current = next;
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // The state still works for this visit.
    }
  }, [value, ready, key]);

  useEffect(() => {
    if (!ready) return;
    function onStorage(event: StorageEvent) {
      if (event.storageArea && event.storageArea !== window.localStorage)
        return;
      if (event.key !== null && event.key !== key) return;
      const stored = read();
      const next = stored ?? initial;
      const text = JSON.stringify(next);
      if (text === serialised.current) return;
      serialised.current = text;
      setValue(next);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // `initial` is a constant at every call site.
  }, [key, ready, read]);

  return [value, setValue, ready];
}

function parseIds(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === 'string')
    : [];
}

function parseTimers(raw: unknown): Timers {
  if (!raw || typeof raw !== 'object') return {};
  const timers: Timers = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const timer = value as Partial<Timer> | null;
    if (
      timer &&
      typeof timer.endsAt === 'number' &&
      typeof timer.label === 'string'
    )
      timers[id] = { endsAt: timer.endsAt, label: timer.label };
  }
  return timers;
}

const NO_IDS: string[] = [];
const NO_TIMERS: Timers = {};

/* ── The alarm ─────────────────────────────────────────────────────────── */

/**
 * One AudioContext for the page. It is made on the first gesture that can
 * need it — starting a timer or turning on cooking mode — because a context
 * made without a gesture starts suspended. If a timer rings after a reload,
 * before any gesture, the context is made anyway and resumes on the next
 * tap anywhere on the page.
 */
let audio: AudioContext | null = null;

function unlockAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audio) {
      const Context =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Context) return null;
      audio = new Context();
    }
    if (audio.state === 'suspended') void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

/** Three short tones at 880 Hz. One call is one second of alarm. */
function beep(): void {
  const context = unlockAudio();
  if (!context || context.state !== 'running') return;
  const start = context.currentTime;
  for (let i = 0; i < 3; i++) {
    const at = start + i * 0.25;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.2, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.2);
  }
}

function vibrate(): void {
  try {
    navigator.vibrate?.([200, 100, 200, 100, 200]);
  } catch {
    // Not supported. The tone and the screen still say it.
  }
}

function askToNotify(): void {
  try {
    if ('Notification' in window && Notification.permission === 'default')
      void Notification.requestPermission();
  } catch {
    // Not supported.
  }
}

function notify(title: string, body: string): void {
  try {
    if ('Notification' in window && Notification.permission === 'granted')
      new Notification(title, { body, tag: `nn-timer-${title}` });
  } catch {
    // Some mobile browsers only notify from a service worker. The tone and
    // the page still say it.
  }
}

/* ── Time, as the cook reads it ────────────────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, '0');

/** `04:59`, `1:04:59`, `2 d 03:04:59`. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0)
    return `${days} d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** When a long timer ends, as a day and a clock time: `Thu 14:30`. */
function formatEnd(endsAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(endsAt);
}

/* ── The provider ──────────────────────────────────────────────────────── */

export function CookingProvider({
  slug,
  revisionNumber,
  children,
}: {
  slug: string;
  revisionNumber: number;
  children: ReactNode;
}) {
  const [doneIds, setDoneIds, doneReady] = useStored(
    `nn:steps:${slug}:${revisionNumber}`,
    NO_IDS,
    parseIds,
  );
  const [timers, setTimers, timersReady] = useStored(
    `nn:timers:${slug}:${revisionNumber}`,
    NO_TIMERS,
    parseTimers,
  );
  const [now, setNow] = useState(0);
  const [cooking, setCookingState] = useState(false);
  const [screenOn, setScreenOn] = useState(false);

  const done = new Set(doneIds);
  const hasTimers = Object.keys(timers).length > 0;

  /* The clock. It ticks only while a timer exists, and it reads the wall
     clock each time, so a tab that was asleep is right on its first tick.
     `visibilitychange` gives that first tick at once, not a second late. */
  useEffect(() => {
    setNow(Date.now());
    if (!hasTimers) return;
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [hasTimers]);

  const ringing = Object.entries(timers)
    .filter(([, timer]) => now > 0 && timer.endsAt <= now)
    .map(([id, timer]) => ({ id, ...timer }));
  const ringingKey = ringing.map((timer) => timer.id).join('|');

  /* The alarm: a tone every 1.5 s and a vibration every 3 s, until the
     last ringing timer is stopped. A notification goes once per timer, for
     a page that is not in front. */
  const notified = useRef(new Set<string>());
  useEffect(() => {
    if (!ringingKey) return;
    for (const timer of ringing) {
      if (notified.current.has(timer.id)) continue;
      notified.current.add(timer.id);
      announce(`${timer.label}: the time is up.`);
      if (document.visibilityState !== 'visible')
        notify(`${timer.label}: the time is up`, 'Open the recipe to stop it.');
    }
    beep();
    vibrate();
    let count = 0;
    const interval = window.setInterval(() => {
      beep();
      if (++count % 2 === 0) vibrate();
    }, 1500);
    // A context made without a gesture waits for one. Any tap will do.
    const resume = () => unlockAudio();
    window.addEventListener('pointerdown', resume);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pointerdown', resume);
    };
    // `ringing` is derived from `ringingKey` and `timers`.
  }, [ringingKey]);

  /* Cooking mode's wake lock. The browser drops the lock whenever the page
     is hidden, so it is asked for again each time the page comes back. */
  useEffect(() => {
    if (!cooking) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    async function acquire() {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible')
        return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void next.release();
          return;
        }
        lock = next;
        setScreenOn(true);
        next.addEventListener('release', () => setScreenOn(false));
      } catch {
        setScreenOn(false);
      }
    }
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
      setScreenOn(false);
    };
  }, [cooking]);

  const value: CookingState = {
    ready: doneReady && timersReady,
    done,
    toggleDone: (stepId) =>
      setDoneIds((previous) =>
        previous.includes(stepId)
          ? previous.filter((id) => id !== stepId)
          : [...previous, stepId],
      ),
    clearDone: () => setDoneIds(() => []),
    timers,
    now,
    startTimer: (stepId, minutes, label) => {
      unlockAudio();
      askToNotify();
      const endsAt = Date.now() + minutes * 60_000;
      setNow(Date.now());
      setTimers((previous) => ({ ...previous, [stepId]: { endsAt, label } }));
      announce(`Timer for ${label.toLowerCase()} started.`);
    },
    stopTimer: (stepId) => {
      notified.current.delete(stepId);
      setTimers((previous) => {
        const next = { ...previous };
        delete next[stepId];
        return next;
      });
    },
    cooking,
    setCooking: (on) => {
      if (on) unlockAudio();
      setCookingState(on);
      announce(on ? 'Cooking mode is on.' : 'Cooking mode is off.');
    },
    screenOn,
  };

  return (
    <CookingContext.Provider value={value}>
      {/* `contents`, so the wrapper adds no box to the layout. It exists
          for the one attribute: cooking mode sets the step text larger from
          here, and the selector outranks `recipe:text-16` by specificity,
          not by source order. */}
      <div
        className="contents data-[cooking]:[&_[data-instruction]]:text-19 data-[cooking]:[&_[data-instruction]]:leading-170"
        data-cooking={cooking ? '' : undefined}
      >
        {children}
      </div>
      <TimerStrip />
    </CookingContext.Provider>
  );
}

/* ── The cooking mode button ───────────────────────────────────────────── */

export function CookingModeButton() {
  const { cooking, setCooking, screenOn } = useCooking();
  return (
    <div className="flex w-full flex-row items-center gap-3 recipe:ml-auto recipe:w-fit recipe:shrink-0">
      {cooking ? (
        <span className="text-09 font-mono tracking-label uppercase text-ink-3">
          {screenOn ? 'Screen stays on' : 'Keep the screen on'}
        </span>
      ) : null}
      <button
        type="button"
        aria-pressed={cooking}
        onClick={() => setCooking(!cooking)}
        className={cn(
          RESET,
          'inline-flex w-full cursor-pointer items-center justify-center recipe:w-fit',
          'px-4.5 py-2.75 text-10 leading-normal font-mono font-normal',
          'tracking-spine uppercase whitespace-nowrap',
          cooking
            ? 'bg-ink text-paper'
            : 'bg-transparent text-ink outline-1 -outline-offset-1 outline-hair',
          FOCUS_RING,
        )}
      >
        {cooking ? 'Stop cooking mode' : 'Cooking mode'}
      </button>
    </div>
  );
}

/* ── One step ──────────────────────────────────────────────────────────── */

/** What a tap on these must do is their own job, not crossing out a step. */
const INTERACTIVE = 'a, button, input, select, textarea, label, summary';

/**
 * The `<li>` of one step, and its number.
 *
 * The number is the real control: a button with `aria-pressed`, so a
 * keyboard and a screen reader get a named toggle. A tap anywhere else on
 * the step does the same thing for a thumb, except on a link, a chip or a
 * timer inside it, and except when the reader is selecting text.
 */
export function CookingStep({
  stepId,
  number,
  letter,
  children,
}: {
  stepId: string;
  number: number;
  letter: string | null;
  children: ReactNode;
}) {
  const { done, toggleDone } = useCooking();
  const isDone = done.has(stepId);

  function onClick(event: MouseEvent<HTMLLIElement>) {
    const target = event.target as HTMLElement;
    if (target.closest(INTERACTIVE)) return;
    if (window.getSelection()?.toString()) return;
    toggleDone(stepId);
  }

  return (
    <li
      data-step={number}
      data-done={isDone ? '' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full shrink-0 cursor-pointer list-none flex-row items-start gap-4 recipe:gap-5',
        /* Crossed out: the prose is struck through and drops to the quiet
           ink. The chips, the meta row and the image stay as they are, so
           a done step can still be read back. */
        'data-[done]:[&_[data-step-prose]]:line-through',
        'data-[done]:[&_[data-step-prose]]:decoration-1',
        'data-[done]:[&_[data-step-prose]]:text-ink-3',
      )}
    >
      {/* `No` — a 46px column holding a 26/26 Newsreader number over the
          phase letter. The same width as the ingredient row's quantity, so
          the steps and the amounts share one rhythm. */}
      <button
        type="button"
        aria-pressed={isDone}
        aria-label={`Step ${number}${isDone ? ', done' : ''}`}
        onClick={() => toggleDone(stepId)}
        className={cn(
          RESET,
          'flex w-8 shrink-0 cursor-pointer flex-col items-start gap-1 bg-transparent p-0 text-left recipe:w-11.5',
          FOCUS_RING,
        )}
      >
        <span
          className={cn(
            'text-21 leading-100 font-serif font-medium tabular-nums recipe:text-26 recipe:leading-100',
            isDone ? 'text-ink-3 line-through decoration-1' : 'text-ink',
          )}
        >
          {number}
        </span>{' '}
        {letter ? (
          <span className="text-08 font-mono tracking-label uppercase text-ink-3">
            {letter}
          </span>
        ) : null}
      </button>{' '}
      {children}
    </li>
  );
}

/* ── The step count ────────────────────────────────────────────────────── */

export function StepProgress({ total }: { total: number }) {
  const { done, clearDone, ready } = useCooking();
  const count = done.size;

  useAnnounce(`${count} of ${total} steps done`, ready);

  return (
    <div className="flex w-full flex-row flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-09 font-mono tracking-label uppercase text-ink-3">
        Tap a step to cross it out
      </span>
      <span className="ml-auto text-09 font-mono tabular-nums tracking-label uppercase text-ink-3">
        {count} / {total} done
      </span>
      {count > 0 ? (
        <button type="button" onClick={clearDone} className={TEXT_CONTROL}>
          Clear
        </button>
      ) : null}
    </div>
  );
}

/* ── The timer on a step ───────────────────────────────────────────────── */

export function StepTimer({
  stepId,
  minutes,
  label,
}: {
  stepId: string;
  minutes: number;
  label: string;
}) {
  const { timers, now, startTimer, stopTimer } = useCooking();
  const timer = timers[stepId];

  if (!timer || now === 0) {
    return (
      <button
        type="button"
        onClick={() => startTimer(stepId, minutes, label)}
        className={TEXT_CONTROL}
      >
        Start timer
      </button>
    );
  }

  const left = timer.endsAt - now;
  const up = left <= 0;

  return (
    <span className="inline-flex flex-row items-center gap-3">
      <span
        className={cn(
          'text-11 font-mono tabular-nums',
          up ? 'text-warn' : 'text-ink-2',
        )}
      >
        {up ? 'Time is up' : formatClock(left)}
      </span>{' '}
      <button
        type="button"
        onClick={() => stopTimer(stepId)}
        className={TEXT_CONTROL}
      >
        {up ? 'Stop alarm' : 'Stop timer'}
      </button>
    </span>
  );
}

/* ── The strip of running timers ───────────────────────────────────────── */

/**
 * Every timer on the page, pinned to the bottom of the screen.
 *
 * It is outside the tab panels on purpose. At or below 900px the browser
 * hides the panel that is not selected, so a timer drawn only in Method
 * would go when the cook opens Ingredients. The page gets a bottom padding
 * the height of the strip, so the strip never covers the last line.
 */
function TimerStrip() {
  const { timers, now, stopTimer } = useCooking();
  const strip = useRef<HTMLDivElement>(null);

  const entries = Object.entries(timers)
    .map(([id, timer]) => ({ id, ...timer }))
    .sort((a, b) => a.endsAt - b.endsAt);
  const visible = now > 0 && entries.length > 0;

  useEffect(() => {
    const element = strip.current;
    if (!visible || !element) return;
    const body = document.body;
    const before = body.style.paddingBottom;
    const observer = new ResizeObserver(() => {
      body.style.paddingBottom = `${element.offsetHeight}px`;
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      body.style.paddingBottom = before;
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={strip}
      data-timer-strip=""
      role="region"
      aria-label="Timers"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 max-h-[40vh] overflow-y-auto bg-paper',
        '[border-style:solid] [border-width:1px_0px_0px_0px] border-t-hair',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <ul className="m-0 flex w-full list-none flex-col p-0 px-4 shell:px-15">
        {entries.map((timer) => {
          const left = timer.endsAt - now;
          const up = left <= 0;
          return (
            <li
              key={timer.id}
              data-ringing={up ? '' : undefined}
              className={cn(
                'flex w-full flex-row flex-wrap items-center gap-x-4 gap-y-1 py-2.5',
                up && 'bg-warn-wash',
              )}
            >
              <span className="text-09 font-mono tracking-label uppercase text-ink-3">
                {timer.label}
              </span>
              <span
                className={cn(
                  'text-15 font-mono tabular-nums',
                  up ? 'text-warn' : 'text-ink',
                )}
              >
                {up ? 'Time is up' : formatClock(left)}
              </span>
              {!up && left > 3_600_000 ? (
                <span className="text-09 font-mono tracking-label uppercase text-ink-3">
                  Ends {formatEnd(timer.endsAt)}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => stopTimer(timer.id)}
                className={cn(TEXT_CONTROL, 'ml-auto')}
              >
                {up ? 'Stop alarm' : 'Stop'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
