'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';

import { signIn, signOut, useSession } from '@/lib/auth-client';
import { oauthReturnUrl, safeCallbackUrl } from '@/lib/auth-routes';
import { Button } from '@/components/f/button';
import { Field } from '@/components/f/field';
import { Warning } from '@/components/f/note';

/**
 * The sign-in form. `access-1280.html:1815` draws it as two `F/Field`s over
 * a submit row: the filled control, then a quiet mono line beside it.
 *
 * M6 RESTYLED THIS AND CHANGED NOTHING IT DOES. Every branch is the one that
 * was here before — the pending session, the already-signed-in state, the
 * email submit, the Google trip through `/connect/done` — and the class
 * names are the only thing that moved. The components it now draws with are
 * server components with no server-only imports, so they compile into this
 * client bundle the same way any shared component does.
 *
 * THE GOOGLE BUTTON IS NOT IN THE DESIGN, and it stays. The design draws one
 * filled SIGN IN and nothing else, but the hosted provider trip is a real
 * path through `src/lib/auth-routes.ts` and deleting a working sign-in route
 * to match a drawing would be redesigning the flow rather than restyling it.
 * It takes `F/Button`'s `quiet` variant, which is the design's own second
 * control — the one it draws three times across the eighteen exports.
 */
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
      // The hosted flow returns to /connect/done rather than here, because
      // the middleware's verifier exchange is skipped for anything at or
      // under the configured login path, and this page is that path. See
      // src/lib/auth-routes.ts.
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
    /* The design has no waiting state. One quiet mono line in the slot the
       form will take is the least that still says the page is working. */
    return (
      <span className="text-09 leading-170 font-mono tracking-label uppercase text-ink-3">
        Checking your session
      </span>
    );
  }

  if (session?.user) {
    return (
      <div className="flex w-full flex-col items-start gap-4">
        <p className="m-0 w-full text-15 leading-170 font-sans tracking-flat text-ink shell:text-16">
          Signed in as {session.user.email ?? session.user.id}.
        </p>
        {callbackURL !== '/' ? (
          <span className="text-09 leading-170 font-mono tracking-label uppercase text-ink-3">
            Continuing to {callbackURL}
          </span>
        ) : null}
        <Button className="w-full shell:w-fit" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleEmailSubmit}
      className="flex w-full flex-col items-start gap-3 shell:gap-4"
    >
      <Field
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={busy}
      />
      <Field
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={busy}
      />

      {error ? (
        <Warning role="alert" title="Sign in failed">
          {error}
        </Warning>
      ) : null}

      {/* The design's submit row: the filled control, then a quiet line
          beside it. At 360 the button takes the full width and the row
          wraps, which is what the 360 artboard draws. */}
      <div className="flex w-full flex-row flex-wrap items-center gap-3 shell:gap-4">
        <Button
          type="submit"
          className="w-full shell:w-fit"
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? 'Signing in' : 'Sign in'}
        </Button>{' '}
        <Button
          variant="quiet"
          className="w-full shell:w-fit"
          onClick={() => void handleGoogleSignIn()}
          disabled={busy}
        >
          Continue with Google
        </Button>{' '}
        <span className="text-09 leading-170 font-mono tracking-label uppercase text-ink-3">
          The session is a cookie on this browser
        </span>
      </div>
    </form>
  );
}
