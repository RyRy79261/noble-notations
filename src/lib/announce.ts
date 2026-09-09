'use client';

import { useEffect, useRef } from 'react';

/**
 * One polite live region for the whole document, and why there is only one.
 *
 * A live region has to be OUTSIDE the shell, not merely outside the drawer.
 * Radix hides the background of a modal dialog with `hideOthers` from
 * `aria-hidden`, and that function deliberately exempts live regions:
 *
 *   // we should not hide aria-live elements
 *   targets.push(...activeParentNode.querySelectorAll('[aria-live], script'));
 *
 * It then walks every ancestor of each match up to `<body>` and exempts
 * those too. So a single `aria-live` anywhere inside the shell keeps its
 * whole ancestor chain in the accessibility tree while the 360 drawer is
 * open — measured: with one recipe collected, the header, the brand and the
 * list control all stayed exposed behind the open drawer, the list control
 * announcing as a link named "1". Four components used to carry their own
 * region: the list control in the header and three counts inside `<main>`.
 *
 * The region also has to be MOUNTED BEFORE the value it announces. A region
 * inserted and populated in the same update is not announced by NVDA, JAWS
 * or VoiceOver — only a change to a region already in the tree is. The list
 * control unmounts itself at zero (R-CMP-01), so its own span could never
 * announce the 0 → 1 change, which is the one that matters (R-ACC-06).
 *
 * `src/app/announcer.tsx` renders the one region, as a direct child of
 * `<body>` and a sibling of the shell. Everything else calls `announce` or
 * `useAnnounce`. Say a whole sentence: the region carries no visible label
 * beside it, so "2 recipes in the list" is the announcement and "2" is not.
 */
export const ANNOUNCE_EVENT = 'nn:announce';

/** Say something politely, once. */
export function announce(message: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ANNOUNCE_EVENT, { detail: message }));
}

/**
 * Announce `message` whenever it changes, and never on arrival.
 *
 * `ready` is for a component that hydrates its state from `localStorage`
 * after mount: pass its own ready flag and the restored value becomes the
 * baseline instead of an announcement nobody asked for.
 */
export function useAnnounce(message: string, ready = true): void {
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (previous.current === null || previous.current === message) {
      previous.current = message;
      return;
    }
    previous.current = message;
    announce(message);
  }, [message, ready]);
}
