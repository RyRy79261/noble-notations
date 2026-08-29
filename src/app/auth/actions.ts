'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  isAdminConfigured,
  mintSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyAdminPassword,
} from '@/lib/mcp/admin-session';

export interface SignInState {
  error?: string;
}

/**
 * Only same-origin relative paths are accepted as a post-sign-in
 * destination. An open redirect here would be handed straight to an OAuth
 * flow, so anything absolute or protocol-relative falls back to the site
 * root rather than being sanitised into something "close enough".
 */
function safeCallback(raw: FormDataEntryValue | null): string {
  if (typeof raw !== 'string' || !raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  return raw;
}

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  if (!isAdminConfigured()) {
    return {
      error:
        'No administrator credentials are configured on this deployment. ' +
        'Set ADMIN_PASSWORD_HASH and ADMIN_SESSION_SECRET.',
    };
  }

  const password = formData.get('password');
  if (typeof password !== 'string' || !password) {
    return { error: 'Enter the administrator password.' };
  }

  if (!verifyAdminPassword(password)) {
    return { error: 'That password is not correct.' };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, mintSessionToken(), sessionCookieOptions());

  redirect(safeCallback(formData.get('callbackURL')));
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/');
}
