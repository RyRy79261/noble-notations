'use client';

import { useEffect, useState } from 'react';

import { ANNOUNCE_EVENT } from '@/lib/announce';

/**
 * The document's one polite live region. R-ACC-06.
 *
 * `src/lib/announce.ts` carries the reasoning; the two properties this file
 * has to keep are:
 *
 *   1. It is rendered as a DIRECT CHILD OF `<body>`, a sibling of the shell
 *      and not a descendant of it. Radix's `hideOthers` exempts every
 *      `[aria-live]` element AND every ancestor of one, so a region inside
 *      the shell would keep the whole shell in the accessibility tree while
 *      the 360 drawer is open. From here the walk stops at `<body>` and the
 *      shell is hidden as it should be.
 *   2. It is ALWAYS MOUNTED, empty to begin with. A live region inserted
 *      together with its first value is not announced by any screen reader.
 *
 * It lives in `src/app/` rather than `src/components/` on purpose: §9.3 of
 * the specification enumerates the eight components in `src/components/`
 * that run in the browser, and this is not one of them. It is part of the
 * root layout, the way `src/app/list/list-recipes.tsx` is part of `/list`.
 *
 * It has no user interface. `sr-only` keeps it out of the picture and in the
 * accessibility tree, which is the whole job.
 */
export function Announcer() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    let clear: ReturnType<typeof setTimeout> | undefined;

    const say = (event: Event) => {
      setMessage((event as CustomEvent<string>).detail ?? '');
      // A polite region is read when its CONTENT CHANGES; the text does not
      // have to stay behind afterwards, and leaving it there means a reader
      // browsing the page meets a stale announcement as stray text at the
      // top of the document. A second is long enough for the change to be
      // picked up and queued — clearing after that cancels nothing.
      if (clear) clearTimeout(clear);
      clear = setTimeout(() => setMessage(''), 1000);
    };

    window.addEventListener(ANNOUNCE_EVENT, say);
    return () => {
      window.removeEventListener(ANNOUNCE_EVENT, say);
      if (clear) clearTimeout(clear);
    };
  }, []);

  return (
    <span aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </span>
  );
}
