'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { safeCallbackUrl, SIGN_IN_PATH } from '@/lib/auth-routes';

export function OAuthReturn() {
  const searchParams = useSearchParams();
  const next = safeCallbackUrl(searchParams.get('next'));

  // A hard navigation: `next` is usually the MCP authorize route handler,
  // which the client router cannot render.
  useEffect(() => {
    window.location.replace(next);
  }, [next]);

  return (
    <p className="muted">
      Continuing to <a href={next}>{next}</a>. If nothing happens,{' '}
      <a href={SIGN_IN_PATH}>start again</a>.
    </p>
  );
}
