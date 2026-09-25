'use client';

/**
 * The last few errors this browser tab met, kept for a report.
 *
 * A person who shakes the phone because something broke is describing a
 * symptom. The error the page threw a moment earlier is the evidence, and
 * it is gone once the tab closes. So the report sheet keeps a short ring of
 * them from the moment it mounts: uncaught errors and unhandled promise
 * rejections, which is what a failed fetch or a broken component becomes.
 *
 * Memory only. Nothing is written to storage, and nothing leaves the tab
 * unless the person files a report and can see the list first.
 */

export interface CapturedError {
  at: string;
  kind: 'error' | 'rejection';
  message: string;
  source: string | null;
}

const LIMIT = 20;
const errors: CapturedError[] = [];
let installed = false;

function push(entry: CapturedError) {
  errors.push({ ...entry, message: entry.message.slice(0, 1000) });
  if (errors.length > LIMIT) errors.shift();
}

export function installErrorCapture(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => {
    push({
      at: new Date().toISOString(),
      kind: 'error',
      message: event.message || String(event.error ?? 'Unknown error'),
      source: event.filename
        ? `${event.filename}:${event.lineno}:${event.colno}`
        : null,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    push({
      at: new Date().toISOString(),
      kind: 'rejection',
      message:
        reason instanceof Error
          ? `${reason.name}: ${reason.message}`
          : String(reason),
      source: null,
    });
  });
}

export function recentErrors(): CapturedError[] {
  return [...errors];
}
