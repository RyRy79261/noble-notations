'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

import { safeCallbackUrl } from '@/lib/auth-routes';
import { cn } from '@/lib/utils';
import { FOCUS_RING } from '@/components/f/button';

/**
 * The destination of the return trip, and the navigation to it.
 *
 * M6 changed where this draws and not what it does. It used to be a
 * paragraph of its own — "Continuing to <next>. If nothing happens, start
 * again." — and it is now the value of the CONTINUING TO row in the details
 * block, which is where the design puts a fact about the handshake.
 *
 * The address stays a real link rather than plain text, and that is the
 * no-JavaScript path: if the effect never runs, the reader has the
 * destination in front of them and one click reaches it.
 */
export function OAuthReturn() {
  const searchParams = useSearchParams();
  const next = safeCallbackUrl(searchParams.get('next'));

  // A hard navigation: `next` is usually the MCP authorize route handler,
  // which the client router cannot render.
  useEffect(() => {
    window.location.replace(next);
  }, [next]);

  return (
    <a
      href={next}
      className={cn(
        'text-12 leading-150 font-mono break-all text-ink no-underline',
        FOCUS_RING,
      )}
    >
      {next}
    </a>
  );
}
