'use client';

import { useActionState } from 'react';
import { signInAction, type SignInState } from './actions';

export function SignInForm({ callbackURL }: { callbackURL: string }) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    signInAction,
    {},
  );

  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="callbackURL" value={callbackURL} />
      <label className="field">
        <span>Administrator password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          autoFocus
        />
      </label>
      {state.error ? (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="button-primary">
        {pending ? 'Checking…' : 'Sign in'}
      </button>
    </form>
  );
}
