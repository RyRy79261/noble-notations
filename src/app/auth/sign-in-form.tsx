'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn, signOut, useSession } from '@/lib/auth-client';
import { oauthReturnUrl, safeCallbackUrl } from '@/lib/auth-routes';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function SignInForm() {
  const searchParams = useSearchParams();
  // `callbackURL` is what the authorize route sends. `next` is what Neon
  // Auth's own proxy appends when it bounces an unauthenticated request
  // here — it forwards the original request's query params onto the login
  // URL under their own names, so a failed return trip would otherwise
  // arrive with its destination intact but unread.
  const callbackURL = safeCallbackUrl(
    searchParams.get('callbackURL') ?? searchParams.get('next'),
  );
  const { data: session, isPending } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-forward when someone lands here already signed in with a pending
  // destination. Neon Auth's hosted flow can return the browser to the
  // originating page rather than unwrapping `callbackURL` itself, and
  // without this the user would just see the form again despite holding a
  // valid session. A hard navigation, not router.push: `callbackURL` is
  // usually the MCP authorize *route handler*, which the client router
  // cannot render.
  useEffect(() => {
    if (isPending) return;
    if (!session?.user) return;
    if (callbackURL === '/') return;
    window.location.replace(callbackURL);
  }, [isPending, session, callbackURL]);

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Enter an email address and password.');
      return;
    }

    setBusy(true);
    try {
      const result = await signIn.email({
        email: email.trim(),
        password,
        callbackURL,
      });
      if (result && 'error' in result && result.error) {
        setError(result.error.message ?? 'Sign in failed.');
        return;
      }
      window.location.replace(callbackURL);
    } catch (caught) {
      setError(errorMessage(caught, 'Sign in failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setBusy(true);
    try {
      // The hosted flow returns to /oauth-return rather than here, because
      // the middleware's verifier exchange is skipped for anything at or
      // under the configured login path. See src/lib/auth-routes.ts.
      await signIn.social({
        provider: 'google',
        callbackURL: oauthReturnUrl(callbackURL),
      });
    } catch (caught) {
      setError(errorMessage(caught, 'Google sign in failed.'));
      setBusy(false);
    }
  }

  if (isPending) {
    return <p className="muted">Checking your session…</p>;
  }

  if (session?.user) {
    return (
      <div className="stack">
        <p>
          Signed in as <strong>{session.user.email ?? session.user.id}</strong>.
        </p>
        {callbackURL !== '/' ? (
          <p className="muted">
            Continuing to <a href={callbackURL}>{callbackURL}</a>…
          </p>
        ) : null}
        <button
          type="button"
          className="button-primary"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleEmailSubmit} className="stack">
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
        />
      </label>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      <button type="submit" className="button-primary" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <button
        type="button"
        className="button-secondary"
        onClick={() => void handleGoogleSignIn()}
        disabled={busy}
      >
        Continue with Google
      </button>
    </form>
  );
}
