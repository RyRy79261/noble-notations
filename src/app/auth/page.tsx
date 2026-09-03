import { Suspense } from 'react';
import type { Metadata } from 'next';
import { isAdminConfigured } from '@/lib/mcp/admin-session';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The one sign-in surface on the site.
 *
 * Nothing here is behind a login — the recipes, categories and archive are
 * public. This page exists so the MCP consent screen has a signed-in
 * administrator to attribute an approval to, and the authorize route sends
 * people here with `?callbackURL=` pointing back at itself.
 *
 * `SignInForm` reads that param with `useSearchParams()`, which has to sit
 * inside a Suspense boundary or the page cannot be prerendered.
 */
export default function AuthPage() {
  const configured = isAdminConfigured();

  return (
    <main className="prose-page narrow">
      <h1>Administrator sign-in</h1>
      <p className="muted">
        Signing in is only needed to approve an MCP connector. The site itself
        is public and needs no account.
      </p>
      {configured ? (
        <Suspense fallback={null}>
          <SignInForm />
        </Suspense>
      ) : (
        <p role="alert" className="form-error">
          This deployment has no administrator identity configured. Set{' '}
          <code>NEON_AUTH_BASE_URL</code>, <code>NEON_AUTH_COOKIE_SECRET</code>{' '}
          and <code>ALLOWED_EMAILS</code>.
        </p>
      )}
    </main>
  );
}
