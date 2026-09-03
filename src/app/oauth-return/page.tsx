import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OAuthReturn } from './oauth-return';

export const metadata: Metadata = {
  title: 'Signing in',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Landing point for Neon Auth's hosted sign-in.
 *
 * The hosted flow returns here with `?neon_auth_session_verifier=…`, which
 * `auth.middleware()` swaps for a real session cookie and then redirects
 * back to this same path with the param stripped. That second load is what
 * renders: by then the cookie exists, and all this page has to do is
 * forward to wherever sign-in was headed.
 *
 * It lives outside `/auth` on purpose — the middleware skips its exchange
 * for any path at or under the configured login path. See
 * src/lib/auth-routes.ts.
 */
export default function OAuthReturnPage() {
  return (
    <main className="prose-page narrow">
      <h1>Signing you in…</h1>
      <Suspense fallback={null}>
        <OAuthReturn />
      </Suspense>
    </main>
  );
}
